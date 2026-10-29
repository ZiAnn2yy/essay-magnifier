/**
 * 范文库检索层。
 *
 * 三条规则沿用旧题库检索层的形状（见 git 历史里的 data/promptStore.js）：
 *   1. 只暴露 status 为 verified 的条目
 *   2. 返回副本，不把内部引用交出去
 *   3. 空库不是错误——调用方必须能处理"这一年级还没有范文"
 *
 * 与旧层的关键差别是**按年级动态 import**。旧层之所以能静态 import，
 * 是因为一道题只有约 200B；一篇范文连原文带拆解要点要 1.5-3KB。
 * 一百篇就是 150-300KB，全塞进主 chunk 会让首屏白白多背几十万字节。
 * 分片后每个年级一个 chunk，只在选中那个年级时才下载——
 * 演示版仍然是纯静态构建（vite preview 不依赖服务器），不违背
 * "内容放前端不走接口"那条决策。
 */

const cache = new Map();

/** 动态 import 的分片表。Vite 会把每个都打成独立 chunk。 */
const SHARDS = {
  3: () => import('./essays/grade-3.json'),
  4: () => import('./essays/grade-4.json'),
  5: () => import('./essays/grade-5.json'),
  6: () => import('./essays/grade-6.json'),
};

/**
 * 取某个年级的范文。
 *
 * @param {number} grade 3-6
 * @returns {Promise<Array>} 该年级的范文副本；没有这一年级的分片时返回空数组
 */
export async function loadEssaysByGrade(grade) {
  const load = SHARDS[grade];
  if (!load) return [];

  const cached = cache.get(grade);
  if (cached) return cached;

  const module = await load();
  const list = (module.default?.essays ?? [])
    .filter((essay) => essay.status === 'verified')
    .map((essay) => ({ ...essay }));

  cache.set(grade, list);
  return list;
}

/** 全库篇数（用于"库里现在有多少篇"的展示，不加载正文） */
export async function countEssays() {
  let total = 0;
  for (const grade of Object.keys(SHARDS)) {
    total += (await loadEssaysByGrade(Number(grade))).length;
  }
  return total;
}
