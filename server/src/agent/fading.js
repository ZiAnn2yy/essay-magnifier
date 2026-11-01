/**
 * 支架撤除的判据。**单一事实源。**
 *
 * 2026-10-31 之前这个判据散写在三处，各写一遍 `collectedCount >= 3`：
 * prompt 里决定少标几招、预处理仓决定取哪一档、实时链路决定怎么调模型。
 * 三处必须同口径，否则内置范文（走预处理）和粘贴范文（走实时）
 * 在同一本册子下拿到不同的拆解，孩子感受到的是产品在乱变。
 *
 * ## 为什么是两个数合取，不是一个数
 *
 * 决策 41 把依据从"册子总条目数"改成"只数学来的招"，修掉的是
 * "同一招练十次就触发撤除"——那个修是对的，保留。但"见过多少招"
 * 仍然只是**暴露量**，不是表现。
 *
 * Renkl & Atkinson (2003) 的结论是撤除该按学习者的实际表现走。
 * 两个数各自防一种失败：
 *
 * | 只用"学过的招" | 只用"用出来过" |
 * |---|---|
 * | 学了很多招但从不动笔 → 支架永远不该撤，因为他没地方使力 | 只学一招却反复写它 → 撤了他也没东西可找 |
 *
 * 所以是合取：**见过足够多的招，且真的在几篇里用出来过。**
 *
 * ## 为什么"用出来过"必须按篇目数
 *
 * 同一招写十句，就是决策 41 已经修掉的那种虚高：计数涨十倍，能力没动。
 * 按篇目还有一个好处——它和头衔（决策 48：按"用自己的话接过的篇数"）
 * 是同一个数，两处口径从此不分叉。
 *
 * 依据见 `docs/wiki/07-引导与激励的实证依据.md` 第 1.3 节。
 */

/** 学够几招才算"有素材可找" */
export const FADE_LEARNED = 3;

/** 在几篇里真的用出来过才算"有能力自己找" */
export const FADE_WRITTEN = 2;

/**
 * @param {{learned?: number, written?: number}} seen
 * @returns {'base' | 'scaffolded'} base = 照旧全标好；scaffolded = 撤支架 + 给 challenge
 */
export function fadeTier({ learned = 0, written = 0 } = {}) {
  const seen = Number.isInteger(learned) ? learned : 0;
  const wrote = Number.isInteger(written) ? written : 0;
  return seen >= FADE_LEARNED && wrote >= FADE_WRITTEN ? 'scaffolded' : 'base';
}

/** 撤支架生效时，模型这一篇只标几招。 */
export function movesToLabel(collected) {
  return Math.max(1, 4 - Math.floor((Number(collected) || 0) / 3));
}
