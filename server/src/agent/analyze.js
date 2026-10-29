/**
 * 范文拆解：把一篇范文交给 LLM，拿回结构化的"这一段干什么"和"用了什么招"。
 *
 * 这是一个**代码编排的 agent**，不是自主工具调用的 agent。原因是实测的：
 * 当前可用的推理模型与 tool_choice: specified 不兼容，让模型自己决定调不调工具
 * 这条路走不通。所以检索、核对、重试全部由代码决定，模型只负责生成。
 * 这不丢人——反而符合产品的一条老原则：规则拥有结论，就必须拥有回应的确定性。
 *
 * 一轮拆解的四步：
 *   1. 检索  代码按年级取学段要求与教学法依据（agent/standards.js）
 *   2. 生成  模型带上下文输出结构化 JSON
 *   3. 核对  代码校验，重点是**引用必须逐字出自原文**
 *   4. 自纠  核对不过，把具体原因回给模型重试一次；仍不过才降级
 *
 * 降级策略与绘本导演那次不同：导演可以本地按关键词匹配素材，"这一段在整篇里
 * 干什么"没有可靠的本地算法。所以降级只做**能确定做对的事**——按标点切段、
 * 把原文还回去，招式列表留空，并明确标 degraded。规则引擎和模型受同一条约束：
 * 不许编造。
 */

import { config } from '../config.js';
import { chatCompletion } from '../model/client.js';
import { logger } from '../lib/logger.js';
import { buildAnalyzerPrompt } from './prompts/index.js';
import { detectCrisis, CRISIS_REPLY } from '../safety/crisis-rules.js';
import { lookupStandards, renderStandards } from './standards.js';

/** 自纠错轮数。只给一次：每次调用约 7 秒，孩子等不起第三次。 */
const MAX_ATTEMPTS = 2;

/**
 * 从模型回复中提取 JSON。
 * 先整体 parse；失败则截取首个 { 到末个 } 之间的子串再试——
 * 模型偶尔会用 ```json 围栏或带一句寒暄，截取能兜住大多数情况。
 */
function parseJsonLoose(text) {
  const trimmed = String(text ?? '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/**
 * 去掉所有空白后判断 sub 是否逐字出自 text。
 *
 * 为什么要去空白：粘贴的范文换行和空格位置不稳定，模型照抄时也可能微调，
 * 逐个字符卡死会把"格式差异"误判成"编造"。去掉空白后仍然要求
 * **每一个字都对得上**——换一个词、加一个意思，照样过不了。
 */
function isVerbatimSubstring(sub, text) {
  if (typeof sub !== 'string' || sub.length === 0) return false;
  return text.replace(/\s+/g, '').includes(sub.replace(/\s+/g, ''));
}

/**
 * 校验拆解结果。
 *
 * 判据沿用分镜那套"恰好覆盖 + 不重复 + 白名单"，外加本条最重要的断言：
 * **引用必须逐字出自原文**。
 *
 * 返回 null 表示合法，返回字符串表示**具体哪一条不合规**——这个原因是给
 * 自纠错轮用的，必须具体到模型能照着改，不能只说"不合法"。
 *
 * @returns {string|null} null = 合法；字符串 = 拒绝原因
 */
export function isValidAnalysis(analysis, essayText) {
  if (!analysis || typeof analysis !== 'object') return '返回的不是一个对象';

  if (!Array.isArray(analysis.moves) || analysis.moves.length === 0) {
    return 'moves 必须是非空数组';
  }

  const seenIds = new Set();
  for (const move of analysis.moves) {
    if (!move || typeof move !== 'object') return 'moves 里有人不是对象';
    if (typeof move.id !== 'string' || move.id.length === 0) return '有招式缺 id';
    if (seenIds.has(move.id)) return `招式 id 重复: ${move.id}`;
    seenIds.add(move.id);
    // 四处文本缺一不可：缺了哪一处，前端那一块就渲染不出来
    if (typeof move.name !== 'string' || move.name.trim().length === 0) {
      return `招式 ${move.id} 缺 name`;
    }
    if (typeof move.why !== 'string' || move.why.trim().length === 0) {
      return `招式 ${move.id} 缺 why`;
    }
    if (typeof move.tryThis !== 'string' || move.tryThis.trim().length === 0) {
      return `招式 ${move.id} 缺 tryThis`;
    }
    // 核心断言：招式指着的那一句，必须真的在这一篇里
    if (!isVerbatimSubstring(move.quote, essayText)) {
      return `招式 ${move.id} 引用的原句不在范文里，必须逐字照抄原文`;
    }
  }

  if (!Array.isArray(analysis.paragraphs) || analysis.paragraphs.length === 0) {
    return 'paragraphs 必须是非空数组';
  }
  // 这里也用 return 不用 throw：整函数的契约是"返回拒绝原因"，
  // 混用会让调用方（自纠错轮）拿到异常而不是能改的原因。
  for (const [position, paragraph] of analysis.paragraphs.entries()) {
    if (!paragraph || typeof paragraph !== 'object') return `段落 ${position} 不是对象`;
    if (paragraph.index !== position) {
      return `段落序号不连续: 第 ${position} 位是 ${paragraph.index}`;
    }
    if (typeof paragraph.text !== 'string' || paragraph.text.trim().length === 0) {
      return `段落 ${position} 缺 text`;
    }
  }
  if (analysis.freshWords !== undefined) {
    if (!Array.isArray(analysis.freshWords)) return 'freshWords 必须是数组';
    for (const item of analysis.freshWords) {
      if (!isVerbatimSubstring(item?.word, essayText)) {
        return '有新鲜感的词不在范文里，必须逐字照抄原文';
      }
      if (typeof item?.sentence !== 'string') return 'freshWords 里有人缺 sentence';
    }
  }

  // challenge 是支架撤除的载体：让孩子自己找的那一句。
  // 它必须真的在原文里，且不能和已标过的招式重复——否则"自己找"是假的。
  if (analysis.challenge !== undefined && analysis.challenge !== null) {
    if (!isVerbatimSubstring(analysis.challenge?.quote, essayText)) {
      return 'challenge 的原句不在范文里';
    }
    const overlaps = analysis.moves.some((move) => move.quote === analysis.challenge.quote);
    if (overlaps) return 'challenge 的原句和已标出的招式重复了，要另找一句';
  }

  return null;
}

/** 确定性切段。
 *
 * 优先按空行/换行切——人粘贴的作文本来就分自然段。只有整篇只有一个块
 * （从网页复制来的常这样）时才按句号级标点累积切，每段约 100 字。
 */
export function splitParagraphs(text) {
  const byLine = text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (byLine.length > 1) return byLine;

  const whole = byLine[0] ?? '';
  if (whole.length <= 120) return whole.length > 0 ? [whole] : [];

  const groups = [];
  let current = '';
  for (const sentence of whole.split(/(?<=[。！？])/)) {
    current += sentence;
    if (current.length >= 100) {
      groups.push(current);
      current = '';
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/** 组装消息：范文作为 JSON 数据进 user message，绝不拼进 system prompt（规范§四.2） */
function buildAnalyzerMessages({ grade, essayText }, context) {
  const payload = JSON.stringify({ grade, essay: essayText });
  return [
    { role: 'system', content: buildAnalyzerPrompt(grade, context) },
    { role: 'user', content: payload },
  ];
}

/**
 * 拆解的 max_tokens。
 *
 * 与导演同因：当前可用的模型全是推理模型，2048 预算下 reasoning 会吃光、
 * 正文 0 字、finish_reason=length。8192 是实测能稳定吐出完整 JSON 的值。
 */
const ANALYZER_MAX_TOKENS = 8192;

/** 单次 LLM 拆解。任何不合规都抛出，错误消息就是具体的拒绝原因 */
async function directAnalyze(request, context) {
  const message = await chatCompletion({
    messages: buildAnalyzerMessages(request, context),
    maxTokens: ANALYZER_MAX_TOKENS,
  });

  const analysis = parseJsonLoose(message?.content);
  if (!analysis) throw new Error('返回的内容无法解析为 JSON');

  const problem = isValidAnalysis(analysis, request.essayText);
  if (problem) throw new Error(problem);
  return analysis;
}

/**
 * 降级拆解：只做能确定做对的事。
 *
 * 切段是确定性的，原文还回去也是确定性的；**招式列表留空**。
 * "这一招为什么好"没有本地算法，硬凑就是让规则引擎编造——
 * 规范和模型输出一样不可信，所以宁可空着。
 */
export function localAnalyze({ essayText }) {
  return {
    paragraphs: splitParagraphs(essayText).map((text, index) => ({
      index,
      text,
      role: '',
      note: '',
    })),
    moves: [],
    freshWords: [],
  };
}

/**
 * 拆解入口。
 *
 * 危机路径先于 LLM：范文可能是孩子自己粘贴的文字，里面可能出现自伤表达。
 * 规则引擎拥有结论，就必须拥有回应的确定性——直接返回固定话术，不调模型。
 *
 * @param {Object} request
 * @param {number} request.grade 3-6
 * @param {string} request.essayText 范文原文
 * @param {number} [request.collectedCount] 孩子收藏册里已有的招数，支架撤除的依据
 */
export async function buildAnalysis(request) {
  const crisis = detectCrisis(request.essayText);
  if (crisis.level === 'crisis') {
    logger.warn('范文命中危机规则，返回固定引导话术', { matched: crisis.matched });
    return { crisis: true, analysis: null, degraded: false, crisisReply: CRISIS_REPLY };
  }

  // 第一步：检索。按年级取学段要求与教学法依据，作为生成的上下文。
  // 取不到就传空，prompt 会明确告诉模型"本次没有可依据的资料，不要提"。
  const standardsText = renderStandards(lookupStandards(request.grade));

  if (config.llmReady) {
    let retryReason = '';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const analysis = await directAnalyze(request, { standardsText, retryReason, collectedCount: request.collectedCount });
        if (attempt > 1) {
          logger.info('拆解自纠错成功', { attempt });
        }
        return { crisis: false, analysis, degraded: false, attempts: attempt };
      } catch (error) {
        // 降级不是异常，重试更不是：记下来，把具体原因喂给下一轮
        retryReason = error.message;
        logger.warn('LLM 拆解未通过校验', { attempt, reason: retryReason });
      }
    }
  }

  return {
    crisis: false,
    analysis: localAnalyze(request),
    degraded: true,
    attempts: 0,
  };
}
