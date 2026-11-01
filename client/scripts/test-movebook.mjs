/**
 * 册子检索层的单元测试。
 *
 * 为什么值得单独立一个脚本：2026-10-30 出过一个只在演示时才会暴露的 bug——
 * 招式的 id 是 m1/m2/m3 按次生成的，册子存储用复合键 essayId::moveId::from（对的），
 * 但读回来时只比了 moveId。于是孩子在任何一篇里收过 m1，每一篇的 m1 都显示
 * "已收进册子"；写过一句的那招更糟，别的篇目同一个序号显示"已经收进作文本了"
 * 且按钮禁用，他新写的这句存不进去。册子里明明没有，界面上却说有。
 *
 * 这类"存的时候对、读的时候松"的不对称，只有把读写两边并排断言才抓得到。
 * 这里每条都同时给"应当命中"和"应当不命中"两侧。
 *
 * 用法：node scripts/test-movebook.mjs
 * 退出码非 0 表示有用例没过。
 */

import {
  entryKey,
  hasEntry,
  countLearnedMoves,
  countOwnEssays,
  favouriteMove,
} from '../src/lib/moveBook.js';

let failed = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  期望 ${expected}，实得 ${actual}`}`);
}

console.log('\n册子检索层');

// ---- 读写对称：存进去的键，必须原样读得回来 ----
const stored = [
  { essayId: 'g4-54183', moveId: 'm1', from: 'essay', name: '把动作拆成一步一步写', at: 1 },
  { essayId: 'g4-54183', moveId: 'm1', from: 'own', mySentence: '爷爷切苹果…', at: 2 },
];

check(
  '同一篇、同一招、同一种来源 → 命中',
  hasEntry(stored, { essayId: 'g4-54183', moveId: 'm1', from: 'essay' }),
  true,
);
check(
  '同一篇、同一招，换成另一种来源 → 不命中（收过招不等于写过句）',
  hasEntry(stored, { essayId: 'g4-54183', moveId: 'm1', from: 'own' }) &&
    !hasEntry([stored[0]], { essayId: 'g4-54183', moveId: 'm1', from: 'own' }),
  true,
);

// ---- 本次 bug 的核心：不同篇目、同一个 moveId，绝不能算命中 ----
const otherEssaySameMoveId = [
  { essayId: 'g4-54183', moveId: 'm1', from: 'essay', name: '把动作拆成一步一步写', at: 1 },
];
check(
  '只在一篇里收过 m1，另一篇的 m1 不显示已收',
  hasEntry(otherEssaySameMoveId, { essayId: 'g4-78041', moveId: 'm1', from: 'essay' }),
  false,
);
check(
  '只在一篇里用 m1 写过，另一篇的 m1 不显示已写',
  hasEntry(
    [{ essayId: 'g4-54183', moveId: 'm1', from: 'own', mySentence: '…', at: 1 }],
    { essayId: 'g4-78041', moveId: 'm1', from: 'own' },
  ),
  false,
);

// ---- 粘贴篇：两篇不同的粘贴范文也不能互相认 ----
check(
  '两篇不同的粘贴篇（id 不同）互不干扰',
  hasEntry(
    [{ essayId: 'pasted-abc-1', moveId: 'm2', from: 'essay', at: 1 }],
    { essayId: 'pasted-abc-2', moveId: 'm2', from: 'essay' },
  ),
  false,
);

// ---- 键的三要素缺一不可 ----
check('键带上三个要素', entryKey({ essayId: 'a', moveId: 'b', from: 'c' }), 'a::b::c');
check(
  '缺 essayId 的查询一律不命中（宁可漏，不可错认成别人的）',
  hasEntry(stored, { moveId: 'm1', from: 'essay' }),
  false,
);
check('册子不是数组时不炸', hasEntry(null, { essayId: 'a', moveId: 'b', from: 'c' }), false);

// ---- 计数只数从范文学来的招 ----
check(
  'countLearnedMoves 只数 from=essay',
  countLearnedMoves([
    { from: 'essay', moveId: 'm1' },
    { from: 'essay', moveId: 'm2' },
    { from: 'own', moveId: 'm1' },
    { from: 'own', moveId: 'm3' },
  ]),
  2,
);

// ---- 2026-10-31 新增：用出来过的篇目数 ----
// 这个数是支架撤除的另一半依据（另一半是 countLearnedMoves，合取）。
// 它必须按**篇目**去重，不能按句子条数：同一招写十句就是 2026-10-30
// 修掉的那种虚高——计数涨十倍，能力没动。
check(
  '同一篇里写三句只算一篇（去重）',
  countOwnEssays([
    { from: 'own', essayId: 'a', moveId: 'm1' },
    { from: 'own', essayId: 'a', moveId: 'm2' },
    { from: 'own', essayId: 'a', moveId: 'm3' },
  ]),
  1,
);

check(
  '不同篇目各算一篇',
  countOwnEssays([
    { from: 'own', essayId: 'a', moveId: 'm1' },
    { from: 'own', essayId: 'b', moveId: 'm1' },
    { from: 'own', essayId: 'c', moveId: 'm1' },
  ]),
  3,
);

// 关键边界：看出来不等于用出来过。
// from: 'spotted' 是 articulation 的产物，它证明的是"他看得见"，
// 不是"他写得出来"。fading 的表现信号只能收 own。
check(
  'spotted 不算用出来过（看出来 ≠ 写出来）',
  countOwnEssays([
    { from: 'essay', essayId: 'a', moveId: 'm1' },
    { from: 'spotted', essayId: 'a', moveId: 'spot-把动作放慢写' },
    { from: 'spotted', essayId: 'b', moveId: 'spot-把动作放慢写' },
    { from: 'own', essayId: 'a', moveId: 'm1' },
  ]),
  1,
);

check('countOwnEssays 不吃非数组', countOwnEssays(null), 0);

// ---- 最常用的一招 ----
// 同样按篇目数，不按条目数：一篇里把同一招写三遍，
// 不如在两篇里各写一遍更能说明"他偏好这一招"。
check(
  'favouriteMove 按篇目数算，不按条目数',
  (() => {
    const fav = favouriteMove([
      { from: 'own', essayId: 'a', name: '把动作放慢写' },
      { from: 'own', essayId: 'a', name: '把动作放慢写' },
      { from: 'own', essayId: 'a', name: '把动作放慢写' },
      { from: 'own', essayId: 'b', name: '先写声音' },
      { from: 'own', essayId: 'c', name: '先写声音' },
    ]);
    return fav ? `${fav.name}/${fav.essays}` : 'null';
  })(),
  '先写声音/2',
);

check(
  'favouriteMove 只数 from=own（学来的招不算偏好）',
  (() => {
    const fav = favouriteMove([
      { from: 'essay', essayId: 'a', name: '从范文看来的' },
      { from: 'essay', essayId: 'b', name: '从范文看来的' },
      { from: 'spotted', essayId: 'a', name: '自己看出来的' },
      { from: 'own', essayId: 'z', name: '真正常用的' },
    ]);
    return fav ? fav.name : 'null';
  })(),
  '真正常用的',
);

check('favouriteMove 空册子返回 null', favouriteMove([]), null);

console.log(
  failed === 0
    ? '\n全部通过：存进去的读得回来，别篇同一序号的不误判为自己收过的。\n'
    : `\n有 ${failed} 条没过，请先修复。\n`,
);
process.exit(failed === 0 ? 0 : 1);
