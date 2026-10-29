/**
 * 范文拆解：把一篇范文交给 LLM，拿回结构化的"这一段干什么"和"用了什么招"。
 *
 * 结构照搬绘本导演那套经过实战的四件套（见 git 历史里的 agent/storyboard.js）：
 *   parseJsonLoose → isValidXxx → directXxx → buildXxx 入口包降级。
 * 理由：那是本工程唯一跑通过的"LLM 出结构化 JSON → 服务端校验 → 前端渲染"闭环，
 * 没有理由为同一形状重发明一套。
 *
 * 与导演不同的是**降级策略**。导演可以本地按关键词匹配素材，因为任务本身可算法化；
 * "这一段在整篇里干什么""这一招为什么好"没有可靠的本地算法。所以降级只做
 * **能确定做对的事**：按标点切段、把原文还回去，招式列表留空，
 * 并明确标 degraded。规则引擎和模型受同一条约束——不许编造。
 */

import { config } from '../config.js';
import { chatCompletion } from '../model/client.js';
import { logger } from '../lib/logger.js';
import { buildAnalyzerPrompt } from './prompts/index.js';
import { detectCrisis, CRISIS_REPLY } from '../safety/crisis-rules.js';

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
 * 确定性切段。
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

/**
 * 校验拆解结果。判据沿用分镜那套"恰好覆盖 + 不重复 + 白名单"，
 * 外加本条最重要的断言：**引用必须逐字出自原文**。
 *
 * 导出是为了让评测用例能直接断言这条边界——它是规范§五"不允许凭空编造"
 * 在拆解功能里的唯一机械守卫，必须在有用例锁着的前提下才敢改 prompt。
 */
export function isValidAnalysis(analysis, essayText) {
  if (!analysis || typeof analysis !== 'object') return false;
  if (!Array.isArray(analysis.moves)) return false;
  if (analysis.moves.length === 0) return false;

  const seenIds = new Set();
  const movesOk = analysis.moves.every((move) => {
    if (!move || typeof move !== 'object') return false;
    if (typeof move.id !== 'string' || move.id.length === 0) return false;
    if (seenIds.has(move.id)) return false;
    seenIds.add(move.id);
    // 四处文本缺一不可：缺了哪一处，前端那一块就渲染不出来
    if (typeof move.name !== 'string' || move.name.trim().length === 0) return false;
    if (typeof move.why !== 'string' || move.why.trim().length === 0) return false;
    if (typeof move.tryThis !== 'string' || move.tryThis.trim().length === 0) return false;
    // 核心断言：招式指着的那一句，必须真的在这一篇里
    return isVerbatimSubstring(move.quote, essayText);
  });
  if (!movesOk) return false;

  if (!Array.isArray(analysis.paragraphs) || analysis.paragraphs.length === 0) return false;
  const paragraphsOk = analysis.paragraphs.every((paragraph, position) => {
    if (!paragraph || typeof paragraph !== 'object') return false;
    if (paragraph.index !== position) return false;
    return typeof paragraph.text === 'string' && paragraph.text.trim().length > 0;
  });
  if (!paragraphsOk) return false;

  if (analysis.freshWords !== undefined) {
    if (!Array.isArray(analysis.freshWords)) return false;
    const wordsOk = analysis.freshWords.every((item) => {
      if (!item || typeof item !== 'object') return false;
      // 同样逐字校验：亮出来的词必须真在原文里
      return isVerbatimSubstring(item.word, essayText) && typeof item.sentence === 'string';
    });
    if (!wordsOk) return false;
  }

  return true;
}

/** 组装消息：范文作为 JSON 数据进 user message，绝不拼进 system prompt（规范§四.2） */
function buildAnalyzerMessages({ grade, essayText }) {
  const payload = JSON.stringify({ grade, essay: essayText });
  return [
    { role: 'system', content: buildAnalyzerPrompt(grade) },
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

/** LLM 拆解。任何失败都抛出，由上层走降级 */
async function directAnalyze(request) {
  const message = await chatCompletion({
    messages: buildAnalyzerMessages(request),
    maxTokens: ANALYZER_MAX_TOKENS,
  });

  const analysis = parseJsonLoose(message?.content);
  if (!analysis) throw new Error('拆解返回的内容无法解析为 JSON');

  if (!isValidAnalysis(analysis, request.essayText)) {
    throw new Error(`拆解结果不合法: ${JSON.stringify(analysis).slice(0, 300)}`);
  }
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
 * 与 kernel 的 crisis 分支同一处理，见 eval safety-003。
 */
export async function buildAnalysis(request) {
  const crisis = detectCrisis(request.essayText);
  if (crisis.level === 'crisis') {
    logger.warn('范文命中危机规则，返回固定引导话术', { matched: crisis.matched });
    return { crisis: true, analysis: null, degraded: false, crisisReply: CRISIS_REPLY };
  }

  if (config.llmReady) {
    try {
      const analysis = await directAnalyze(request);
      return { crisis: false, analysis, degraded: false };
    } catch (error) {
      // 降级不是异常：记 warn，前端照常渲染，只是这一篇拆不出招式
      logger.warn('LLM 拆解失败，使用确定性降级', { reason: error.message });
    }
  }

  return {
    crisis: false,
    analysis: localAnalyze(request),
    degraded: true,
  };
}
