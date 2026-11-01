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
import { isVerbatimSubstring } from '../lib/text.js';
import { getPrecomputedAnalysis } from './precomputed.js';
import { fadeTier } from './fading.js';
import { lookupForAnalysis, renderStandards } from './standards.js';

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
 *
 * 实现已挪到 lib/text.js：预处理仓复核时也要用它，塞在这里会和它形成环。
 */

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
    // 段落文本也必须逐字出自原文。prompt 一直要求"原样照抄该段原文"，
    // 但 2026-10-30 之前这里只查了非空——于是模型偶尔把段落改写一遍
    // （合并句子、动标点）也能通过，而 EssayPane 渲染的正是这个字段，
    // 孩子看到的就是一篇被改写过、却冒充原文的作文。
    // 补上之后模型会走自纠错，那正是这道闸该有的效果。
    if (!isVerbatimSubstring(paragraph.text, essayText)) {
      return `段落 ${position} 的文本不是原文，必须逐字照抄`;
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

/**
 * 按档位决定 challenge 去留。
 *
 * **base 档一律不给 challenge**，哪怕模型（或预处理仓）给了。原因是 fading 的
 * 方向：challenge 是"支架撤除的补偿"——产品少标几招，才让孩子自己找一句。
 * 支架还没撤就给人挑战，是 fading 的反面；而且"攒够招之后才有的东西"
 * 这个叙事会失真，孩子第一次来就见到它，攒够了反而不觉得有什么变化。
 *
 * 为什么必须在这里过滤、不能只靠 prompt：prompt 里写的是"challenge 字段只在
 * 上面明确要求时才给"，那是风格约束不是硬闸门。预处理仓里有 10 篇
 * （grade-3/4 各 5 篇）的 base 变体带着 challenge——模型当时主动多给的。
 * 判据只在这一处执行，两条路径（预处理仓 / 实时链路）才同口径。
 *
 * @param {Object} analysis 拆解结果，会被原样返回（不修改入参）
 * @param {'base'|'scaffolded'} tier
 * @returns {Object}
 */
function applyChallengePolicy(analysis, tier) {
  if (tier === 'scaffolded' || !analysis?.challenge) return analysis;
  const { challenge: _dropped, ...rest } = analysis;
  return rest;
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

/**
 * 拆解的超时预算。
 *
 * 实测（server/scripts/bench-effort.mjs，同一篇范文、同一份 prompt、各跑两轮）：
 *   不传 reasoning_effort   45.9s / 49.3s
 *   reasoning_effort=low    36.1s / 32.3s
 * 全局的 LLM_TIMEOUT_MS=60000 卡在分布中间——正好是最容易把一次本来会成功的
 * 调用砍掉的位置。砍掉之后旧逻辑还会重试，孩子要等满两轮（实测 113 秒）。
 * 所以这里按实测分布给到 90 秒：覆盖 low 档的常规耗时，也留出余量。
 * 超时不重试那条在 model/client.js，两边配合才有效。
 */
export const ANALYZER_TIMEOUT_MS = 90000;

/** 单次 LLM 拆解。任何不合规都抛出，错误消息就是具体的拒绝原因 */
async function directAnalyze(request, context) {
  const message = await chatCompletion({
    messages: buildAnalyzerMessages(request, context),
    maxTokens: ANALYZER_MAX_TOKENS,
    timeoutMs: ANALYZER_TIMEOUT_MS,
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
 * @param {string} [request.essayId] 内置范文的 id。**只有内置范文有**——
 *   带上它才可能命中预处理结果（提前算好的拆解），粘贴的范文不带
 * @param {string} [request.topic] 这一篇的类型，取值见 agent/standards.js 的 GENRE_TOPICS。
 *   粘贴进来的范文没有类型，留空即可——检索会跳过文体视角卡
 * @param {number} [request.collectedCount] 孩子收藏册里已有的招数，支架撤除的依据之一
 * @param {number} [request.writtenEssays] 孩子真的在几篇里用出来过，支架撤除的另一半依据。
 *   两个数必须都过线才撤，判据和理由见 agent/fading.js
 * @param {boolean} [request.forceLive] 跳过预处理仓，真的去调一次模型。
 *   **只给预处理脚本用**（它要的就是重算）；正常请求不要传
 */
export async function buildAnalysis(request) {
  const crisis = detectCrisis(request.essayText);
  if (crisis.level === 'crisis') {
    logger.warn('范文命中危机规则，返回固定引导话术', { matched: crisis.matched });
    return { crisis: true, analysis: null, degraded: false, crisisReply: CRISIS_REPLY };
  }

  // 第二步之前先查预处理仓。内置范文的拆解已经提前算好并逐字校验过，
  // 不依赖模型在不在线、也不让孩子等 30-60 秒。
  // getPrecomputedAnalysis 内部会拿请求里的原文复核一遍，对不上就返回 null，
  // 那时自然落到下面的实时链路——所以这条路径永远不会给出错的拆解。
  //
  // `forceLive` 只给预处理脚本用：它要的就是真去调一次模型。
  // 没有这个开关，--force 重算时会读到仓里已有的那份，等于什么都没重算。
  const precomputed = request.forceLive
    ? null
    : getPrecomputedAnalysis(
        request.grade,
        request.essayId,
        request.collectedCount ?? 0,
        request.writtenEssays ?? 0,
        request.essayText,
      );
  if (precomputed) {
    return {
      crisis: false,
      analysis: applyChallengePolicy(precomputed.analysis, precomputed.tier),
      degraded: false,
      attempts: precomputed.attempts,
      basis: precomputed.basis,
      // 前端必须显示这一条。预处理是"提前算好并核对过"，
      // 不是"这次 AI 现拆的"——混为一体就是冒充。
      precomputed: true,
    };
  }

  // 第一步：检索。按年级取学段要求与教学法依据，作为生成的上下文。
  // 同时按这一篇的类型取文体视角卡——同一篇范文拆出来的东西和它的类型有关，
  // 《爷爷的木工房》和《雨后的花园》不该拿到同一套看点。
  // 走 lookupForAnalysis 而不是 lookupStandards(grade, topic)：后者是单值
  // 等式过滤，传了类型名就把课标卡和教学法卡全滤掉（2026-10-30 犯过）。
  // 显式限定 analyze 阶段：不限定就会把只作约束的卡片（管建刚"反对作前指导"）
  // 也当成"可依据的资料"喂给 prompt。
  // 取不到就传空，prompt 会明确告诉模型"本次没有可依据的资料，不要提"。
  const standards = lookupForAnalysis(request.grade, request.topic);
  const standardsText = renderStandards(standards);

  if (config.llmReady) {
    let retryReason = '';
    /** 最后一次失败的具体原因。降级时要带回给调用方，见下面的 degradeReason。 */
    let lastReason = '';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const analysis = await directAnalyze(request, {
          standardsText,
          retryReason,
          collectedCount: request.collectedCount,
          writtenEssays: request.writtenEssays,
          topic: request.topic,
        });
        const tier = fadeTier({
          learned: request.collectedCount,
          written: request.writtenEssays,
        });
        if (attempt > 1) {
          logger.info('拆解自纠错成功', { attempt });
        }
        return {
          crisis: false,
          analysis: applyChallengePolicy(analysis, tier),
          degraded: false,
          attempts: attempt,
          // 这次拆解照的是什么依据。**必须回给前端并显示出来**——
          // 智能体不能只把活干完，还要让人看见它是照什么干的（规范§五：
          // 事实性内容必须给出处；也是评分框架里"知识库在 agent 设计中的用途"）。
          basis: describeBasis(standards, request.topic),
        };
      } catch (error) {
        // 降级不是异常，重试更不是：记下来，把具体原因喂给下一轮
        retryReason = error.message;
        lastReason = error.message;
        logger.warn('LLM 拆解未通过校验', { attempt, reason: retryReason });
      }
    }

    // 两次都没过。带上**为什么**降级——调用方需要区分"额度耗尽"和
    // "模型两次都没给出合规结果"：前者重试一万遍也没用，后者补跑就行。
    // 2026-10-30 预处理脚本就因为拿不到这个区分，把普通的校验失败
    // 当成额度耗尽，整轮误中止。
    return {
      crisis: false,
      analysis: localAnalyze(request),
      degraded: true,
      attempts: 0,
      degradeReason: classifyDegrade(lastReason),
      basis: [],
    };
  }

  return {
    crisis: false,
    analysis: localAnalyze(request),
    degraded: true,
    attempts: 0,
    // 没配 Key 和配了 Key 但调不通是两件事，话术要分开
    degradeReason: 'llm_not_configured',
    // 降级时没有模型判断，也就没有"照什么拆"可言——明说没有依据，
    // 不拿规则切段冒充有依据的拆解
    basis: [],
  };
}

/**
 * 把最后一次失败的原因归成一类。
 *
 * 只区分"调用层面就没通"和"模型回来了但不合规"——前者是环境问题
 * （额度、网络、超时），后者是模型输出问题。两者的处置完全不同。
 */
function classifyDegrade(reason) {
  const text = String(reason ?? '');
  if (/quota|billing|余额|欠费|402/i.test(text)) return 'quota_exceeded';
  if (/超时|timeout|abort/i.test(text)) return 'timeout';
  if (/请求模型失败|上游返回 5\d\d|ECONN|fetch failed/i.test(text)) return 'upstream_unreachable';
  if (text.length === 0) return 'unknown';
  return 'invalid_output';
}

/**
 * 把检索到的依据压成一句人能懂的话 + 可展示的短标签。
 *
 * @param {import('./standards.js').StandardCard[]} standards 这次检索到的卡
 * @param {string} [topic] 这一篇的文体类型。**必须传**：文体卡在数组里按
 *   写人/记事/写景/状物/想象固定排序，用 find 抓"第一张文体卡"会抓到记事，
 *   于是给孩子的 basis 写着"这一篇是记事"而他拆的明明是写人的文章。
 *   2026-10-30 真犯过这个错，界面上看不出来，只有对着 topic 才发现的。
 */
export function describeBasis(standards, topic) {
  const curriculum = standards.find((card) => card.topic === '学段要求');
  const methods = standards.filter((card) => card.topic === '教学法依据');
  // 只认请求的那一个类型。topic 为空（粘贴的范文）时不给文体判断——
  // 那一次是模型自己猜的，猜完没有回传，产品不能把猜测说成依据。
  const genre = topic ? standards.find((card) => card.topic === topic) : undefined;

  const parts = [];
  if (genre) {
    parts.push(`这一篇是${genre.topic}，照着这一类文章的看点拆的`);
  }
  if (curriculum) {
    // "第二学段（3-4 年级）" 这种说法对家长和孩子都太术语，
    // 直接用年级说：三四年级
    const grades = curriculum.grades.join('、');
    parts.push(`照着语文课标对${grades}年级的要求拆的`);
  }
  if (methods.length > 0) {
    parts.push(`参考了 ${methods.length} 条写作教学方法`);
  }
  return {
    summary: parts.join('，') || '这次没有检索到可依据的资料',
    curriculum: curriculum ? { grades: curriculum.grades, source: curriculum.source, verified: curriculum.verified } : null,
    methodCount: methods.length,
    // 文体视角卡是产品自拟的教学判断，必须单独标出来——
    // 它和王荣生、布鲁纳那些文献转述不是一个可信度，混在一起讲就是冒充
    genre: genre ? { topic: genre.topic, source: genre.source, verified: genre.verified } : null,
  };
}
