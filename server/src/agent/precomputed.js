/**
 * 预处理结果仓：内置范文提前算好的拆解。
 *
 * ## 为什么存在
 *
 * 2026-10-30，用户在魔搭上看到**每一篇内置范文都显示"没能拆出招式"**——
 * 部署环境没配模型环境变量，`llmReady` 为 false，全部走了降级路径。
 * 根子上的问题不是"忘了配变量"，是**把产品的核心价值押在了一个外部服务上**：
 * 它会慢（实测一次拆解 32-65 秒）、会没配额、会在演示现场不在线。
 * 用它保证不了"孩子点开一篇范文就能看到招"。
 *
 * 而内置的范文是**已知且固定**的，没有理由在运行时才算。
 * 由 `server/scripts/precompute-analysis.mjs` 用**同一个** `buildAnalysis`
 * 提前算好（含引用逐字校验与自纠错），随工程一起分发。于是：
 *   1. 点开内置范文立刻有招，不依赖模型在不在线
 *   2. 演示现场不可能失败
 *   3. 粘贴任意一篇仍然走实时 agent，产品故事不变
 *
 * ## 诚实性（两条硬规矩）
 *
 * 1. **存的必须是过了同一道闸的结果。** 入库前脚本会再跑一次 `isValidAnalysis`，
 *    这里取用时还会**拿请求里的原文重新复核一遍**——`essayId` 是客户端给的，
 *    文本却可能对不上；那时招式指着原句、段落显示原文，全都不是孩子眼前这一篇。
 *    复核不过就当没有预处理结果，退回实时拆解。
 * 2. **不冒充当场拆的。** 返回里带 `precomputed: true`，前端要把它显示出来。
 *    预处理是"提前算好并逐字核对过"，不是"这次 AI 现拆的"——两者不是一回事。
 *
 * 数据文件不在 src 下（`server/data/precomputed/grade-N.json`），
 * 所以打包脚本要单独拷这个目录，见 scripts/pack-modelscope.mjs。
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isVerbatimSubstring } from '../lib/text.js';
import { isValidAnalysis } from './analyze.js';
import { fadeTier } from './fading.js';

const DEFAULT_DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'data',
  'precomputed',
);

/** 目录 → (年级 → 该年级的预处理仓)。只在第一次用到那个目录时读盘。 */
const cache = new Map();

/**
 * 预处理结果目录。
 *
 * 可以用 `PRECOMPUTED_DIR` 指到别处：运维能把结果放到挂载卷上，
 * 评测能用临时目录跑用例而不污染真仓。不设就是仓库里那一份。
 */
function resolveDataDir() {
  const override = process.env.PRECOMPUTED_DIR?.trim();
  return override ? path.resolve(override) : DEFAULT_DATA_DIR;
}

function load(grade) {
  const dir = resolveDataDir();
  let byGrade = cache.get(dir);
  if (!byGrade) {
    byGrade = new Map();
    cache.set(dir, byGrade);
  }
  if (byGrade.has(grade)) return byGrade.get(grade);

  let store = {};
  const file = path.join(dir, `grade-${grade}.json`);
  if (existsSync(file)) {
    try {
      store = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      // 读不动就当没有：少一条预处理结果只是退回实时拆解，
      // 不该让整个服务起不来。但要让运维看见。
      console.warn(`预处理结果读取失败（${file}）：${error.message}`);
    }
  }
  byGrade.set(grade, store);
  return store;
}

/**
 * 复核这份预处理结果能不能用在这一篇原文上。
 *
 * `isValidAnalysis` 查的是招式引用、新鲜词、challenge；段落原文它只查非空，
 * 不查是否逐字出自范文。而 EssayPane 渲染的正是 `analysis.paragraphs`——
 * 段落文本对不上的话，孩子眼前这一篇和拆出来的内容就是两码事。
 * 所以这里补一段落的逐字校验。
 */
function matchesEssay(entry, essayText) {
  const analysis = entry?.analysis;
  if (!analysis) return false;
  if (isValidAnalysis(analysis, essayText) !== null) return false;
  return (analysis.paragraphs ?? []).every((paragraph) =>
    isVerbatimSubstring(paragraph?.text, essayText),
  );
}

/**
 * 取一篇内置范文的预处理拆解。
 *
 * @param {number} grade 3-6
 * @param {string} essayId 范文 id。**只有内置范文有**，粘贴进来的没有
 * @param {number} collectedCount 册子里已有的招数，决定取哪个变体
 * @param {number} [writtenEssays] 孩子真的在几篇里用出来过。与 collectedCount
 *   合取才取 scaffolded——判据见 agent/fading.js
 * @param {string} essayText 请求里的原文，用于复核
 * @returns {Object|null} 拿不到就返回 null，调用方退回实时拆解
 */
export function getPrecomputedAnalysis(grade, essayId, collectedCount, writtenEssays, essayText) {
  if (typeof essayId !== 'string' || essayId.length === 0) return null;

  const store = load(grade);
  const entry = store[essayId];
  if (!entry) return null;

  // 两个变体的含义见 scripts/precompute-analysis.mjs：
  // base 是册子空的时候；scaffolded 是支架撤除生效时，模型少标几招
  // 并额外给一个 challenge（让孩子自己找的那一句）。
  //
  // **scaffolded 缺失时退回 base，不要退回实时链路。** scaffolded 的约束更严
  // （challenge 不能和已标招式重复），预处理时失败率明显更高；让它落到实时链路
  // 意味着孩子要等 60-90 秒，只为了一个"本可以没有的"挑战句。
  // 退回 base 的代价只是这一篇不撤支架——全部照旧标好，那是诚实的中等结果。
  const wanted = fadeTier({ learned: collectedCount, written: writtenEssays });
  const variant = entry[wanted] ?? entry.base;
  if (!variant) return null;
  if (!matchesEssay(variant, essayText)) return null;

  // tier 一起带回：调用方要按它决定 challenge 的去留（见 analyze.js 的
  // applyChallengePolicy）。**不要在这里剥**——那会让"取档"和"判据"
  // 变成两处逻辑，而判据必须只有一处。
  return { ...variant, tier: wanted };
}

/** 已预处理的篇数。给 /api/health 和运维看一眼，不需要加载正文。 */
export function countPrecomputed() {
  const grades = [3, 4, 5, 6];
  let essays = 0;
  let variants = 0;
  for (const grade of grades) {
    const store = load(grade);
    for (const entry of Object.values(store)) {
      if (entry.base) {
        essays += 1;
        variants += 1;
      }
      if (entry.scaffolded) variants += 1;
    }
  }
  return { essays, variants };
}
