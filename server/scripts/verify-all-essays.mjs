/**
 * 终检：逐篇打接口，证明"能选的范文全都有招"。
 *
 * 这不是跑评测，是对着用户的原始要求做一次穷尽验证：
 * **只要是能选的范文，必须有招。** 抽样说明不了问题，69 篇要全过。
 *
 * 同时验三件事：
 *   1. 每一篇都返回非空招式（不是降级后的空列表）
 *   2. 每一招引用的原句都逐字出自那篇范文（靠服务端校验，这里复核一遍）
 *   3. 内置范文全部命中预处理（不调模型、不依赖额度）
 *
 * 用法：先起服务，再 node --no-warnings scripts/verify-all-essays.mjs [port]
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const essayDir = path.join(root, '..', 'client', 'src', 'data', 'essays');
const port = process.argv[2] ?? '3020';
const base = `http://127.0.0.1:${port}`;

const GRADES = [3, 4, 5, 6];

function strip(text) {
  return String(text ?? '').replace(/\s+/g, '');
}

let total = 0;
let withMoves = 0;
let precomputedHits = 0;
let quoteOk = 0;
const problems = [];

for (const grade of GRADES) {
  const essays = JSON.parse(readFileSync(path.join(essayDir, `grade-${grade}.json`), 'utf8')).essays.filter(
    (essay) => essay.status === 'verified',
  );

  for (const essay of essays) {
    total += 1;
    // 两种册子状态都试：base（0 招）和 scaffolded（3 招，支架撤除生效）
    for (const collectedCount of [0, 3]) {
      try {
        const response = await fetch(`${base}/api/v3/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grade,
            title: essay.title,
            topic: essay.topic,
            essayId: essay.id,
            essayText: essay.text,
            collectedCount,
          }),
          signal: AbortSignal.timeout(30000),
        });
        const data = await response.json();

        if (data.crisis) {
          problems.push(`${grade}/${essay.id} 命中危机规则（不该发生，这是示例范文）`);
          continue;
        }
        const moves = data.analysis?.moves ?? [];
        if (data.degraded || moves.length === 0) {
          problems.push(`${grade}/${essay.id} 册子${collectedCount}招：没有招式（degraded=${data.degraded}）`);
          continue;
        }
        if (collectedCount === 0) {
          withMoves += 1;
          if (data.precomputed === true) precomputedHits += 1;
        }
        // 每一招的原句都必须逐字在这一篇里
        const stripped = strip(essay.text);
        for (const move of moves) {
          if (!stripped.includes(strip(move.quote))) {
            problems.push(`${grade}/${essay.id} 招式「${move.name}」的原句不在范文里`);
          } else {
            quoteOk += 1;
          }
        }
      } catch (error) {
        problems.push(`${grade}/${essay.id} 册子${collectedCount}招：请求失败 ${error.message}`);
      }
    }
  }
  console.log(`  ${grade} 年级 ${essays.length} 篇验完`);
}

console.log('');
console.log(`可选范文：${total} 篇`);
console.log(`有招式的：${withMoves}/${total}`);
console.log(`命中预处理（不调模型）：${precomputedHits}/${total}`);
console.log(`引用原句逐字核对通过：${quoteOk} 处`);
console.log('');

if (problems.length === 0) {
  console.log('✅ 全部通过：每一篇能选的范文都有招，每一招都指着这篇里真有的句子。');
} else {
  console.log(`❌ ${problems.length} 个问题：`);
  for (const problem of problems.slice(0, 30)) console.log('   - ' + problem);
  process.exit(1);
}
