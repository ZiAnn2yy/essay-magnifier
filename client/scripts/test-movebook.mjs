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
  addMove,
  loadBook,
  removeFromBook,
  restoreToBook,
  countLearnedMoves,
  countOwnEssays,
  favouriteMove,
  titleFor,
  countGenres,
  ownSentencesByMove,
} from '../src/lib/moveBook.js';

/**
 * moveBook 的读写走 `window.localStorage`，Node 里没有。
 * 补一个内存的最小实现——只实现这个库真正用到的那三个方法。
 * 有了它才能测"存进去 → 读回来"这条完整的往返，
 * 而 2026-10-30 那个 bug 恰恰只在这一段露头（存的时候对、读的时候松）。
 */
const backing = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => (backing.has(key) ? backing.get(key) : null),
    setItem: (key, value) => backing.set(key, String(value)),
    removeItem: (key) => backing.delete(key),
  },
};

/** 清空册子，让每条用例都从空开始。 */
function resetBook() {
  backing.clear();
}

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
  '自己写的那一句，要连句子一起比才命中',
  hasEntry(stored, {
    essayId: 'g4-54183',
    moveId: 'm1',
    from: 'own',
    mySentence: '爷爷切苹果…',
  }),
  true,
);
check(
  '只问"这一招收过没有"、不带句子 → 不命中。按钮就是照这个改的：问句不问招',
  hasEntry(stored, { essayId: 'g4-54183', moveId: 'm1', from: 'own' }),
  false,
);
check(
  '同一篇、同一招，换成另一种来源 → 不命中（收过招不等于写过句）',
  !hasEntry([stored[0]], { essayId: 'g4-54183', moveId: 'm1', from: 'own', mySentence: '爷爷切苹果…' }),
  true,
);

// ---- 同一招在同一篇里可以收几句（2026-11-02 修的死路）----
const twoSentences = [
  { essayId: 'g4-54183', moveId: 'm1', from: 'own', mySentence: '爷爷切苹果…', at: 1 },
  { essayId: 'g4-54183', moveId: 'm1', from: 'own', mySentence: '苹果皮连成一条，没断。', at: 2 },
];
check(
  '同一招在同一篇里写了两句，两句各自命中',
  twoSentences.every((entry) =>
    hasEntry(twoSentences, {
      essayId: entry.essayId,
      moveId: entry.moveId,
      from: 'own',
      mySentence: entry.mySentence,
    }),
  ),
  true,
);
check(
  '两句不同，键就不同——不会互相把对方顶掉',
  new Set(twoSentences.map((entry) => entryKey(entry))).size,
  2,
);
check(
  '同一句存两次，键相同——去重仍然有效',
  entryKey({ essayId: 'a', moveId: 'm1', from: 'own', mySentence: '同一句' }) ===
    entryKey({ essayId: 'a', moveId: 'm1', from: 'own', mySentence: '同一句' }),
  true,
);
check(
  '从范文学来的招，键还是三要素（不带句子）',
  entryKey({ essayId: 'a', moveId: 'm1', from: 'essay', mySentence: '不该进键' }),
  'a::m1::essay',
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
  '只在一篇里用 m1 写过，另一篇的同一句也不显示已写',
  hasEntry(
    [{ essayId: 'g4-54183', moveId: 'm1', from: 'own', mySentence: '爷爷切苹果…', at: 1 }],
    { essayId: 'g4-78041', moveId: 'm1', from: 'own', mySentence: '爷爷切苹果…' },
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

// ---- 头衔：按篇数，不按技巧种类 ----
// 阈值是产品自拟的教学判断。这几条锁的是"头衔跟着动过的篇目走"，
// 以及"学来的招再多也不涨头衔"——否则孩子会为了头衔去点收藏而不是去写。
check('头衔 0 篇 → 写作初学者', titleFor([]), '写作初学者');
check(
  '头衔 1 篇 → 敢写自己的人',
  titleFor([{ from: 'own', essayId: 'a' }]),
  '敢写自己的人',
);
check(
  '头衔 3 篇 → 越写越顺的人',
  titleFor([{ from: 'own', essayId: 'a' }, { from: 'own', essayId: 'b' }, { from: 'own', essayId: 'c' }]),
  '越写越顺的人',
);
check(
  '头衔 6 篇 → 有自己的招式的人',
  titleFor(Array.from({ length: 6 }, (_, i) => ({ from: 'own', essayId: `e${i}` }))),
  '有自己的招式的人',
);
check(
  '头衔 10 篇 → 停不下来的写手',
  titleFor(Array.from({ length: 10 }, (_, i) => ({ from: 'own', essayId: `e${i}` }))),
  '停不下来的写手',
);
check(
  '头衔只数 from=own：学来 20 招也还是初学者',
  titleFor(Array.from({ length: 20 }, (_, i) => ({ from: 'essay', essayId: `e${i}`, moveId: `m${i}` }))),
  '写作初学者',
);
check(
  '头衔按篇目去重：同一篇写十句算一篇',
  titleFor(Array.from({ length: 10 }, (_, i) => ({ from: 'own', essayId: 'same', moveId: `m${i}` }))),
  '敢写自己的人',
);

// ---- 文体广度：只数带 topic 的 own 条目 ----
check('文体广度 空册子 0', countGenres([]), 0);
check(
  '文体广度按 topic 去重',
  countGenres([
    { from: 'own', essayId: 'a', topic: '写人' },
    { from: 'own', essayId: 'b', topic: '写人' },
    { from: 'own', essayId: 'c', topic: '记事' },
  ]),
  2,
);
check(
  '文体广度只数 from=own',
  countGenres([
    { from: 'essay', essayId: 'a', topic: '写人' },
    { from: 'spotted', essayId: 'b', topic: '写景' },
  ]),
  0,
);
check(
  '文体广度没有 topic 的条目不计（粘贴篇没有类型，不猜）',
  countGenres([{ from: 'own', essayId: 'a', topic: '' }, { from: 'own', essayId: 'b' }]),
  0,
);

// ---- 证据墙：按招式分组，最近用过的在前，零判定 ----
const wallEntries = [
  { from: 'own', essayId: 'e1', moveId: 'm1', name: '把动作放慢写', mySentence: '第一句', at: 1 },
  { from: 'own', essayId: 'e2', moveId: 'm1', name: '把动作放慢写', mySentence: '第二句', at: 2 },
  { from: 'own', essayId: 'e3', moveId: 'm2', name: '用味道开头', mySentence: '第三句', at: 3 },
  { from: 'essay', essayId: 'e1', moveId: 'm9', name: '学来的招', at: 4 },
  { from: 'spotted', essayId: 'e1', moveId: 'spot-x', name: '看出来的招', at: 5 },
];
const wall = ownSentencesByMove(wallEntries);
check('证据墙组数 = 用过的招式种数', wall.length, 2);
check('证据墙最近用过的招式在前', wall[0].name, '用味道开头');
check(
  '证据墙同组句子齐全',
  ownSentencesByMove(wallEntries).find((g) => g.name === '把动作放慢写').sentences.length,
  2,
);
check('证据墙不含学来的招', wall.some((g) => g.name === '学来的招'), false);
check('证据墙不含看出来的招', wall.some((g) => g.name === '看出来的招'), false);
check('证据墙空册子返回空数组', ownSentencesByMove([]).length, 0);
check(
  '证据墙没有 mySentence 的 own 条目不进场（防御脏数据）',
  ownSentencesByMove([{ from: 'own', essayId: 'a', moveId: 'm1', name: 'x', at: 1 }]).length,
  0,
);

// ---- 拿出来 / 放回去（2026-11-02 用户要的逃生口）----
resetBook();
addMove({ moveId: 'm1', name: '把声音写出来', essayId: 'g3-73483', from: 'essay' });
addMove({ moveId: 'm2', name: '把快动作拆成小步骤写', essayId: 'g3-73483', from: 'essay' });
addMove({
  moveId: 'm1',
  name: '把声音写出来',
  essayId: 'g3-73483',
  from: 'own',
  mySentence: '弟弟一拼乐高，手指就动得飞快。',
});
addMove({
  moveId: 'm1',
  name: '把声音写出来',
  essayId: 'g3-73483',
  from: 'own',
  mySentence: '那支笔转得像小风车。',
});

check('收进去的读得回来', loadBook().length, 4);

const first = loadBook()[0];
const taken = removeFromBook(first);
check('拿出来之后册子里少一条', taken.entries.length, 3);
check('拿出来之后落盘了（读回来也是 3 条）', loadBook().length, 3);
check('带回原来的位置，撤销要靠它放回原样', taken.index, 0);
check('拿出来的那条真的不在了', hasEntry(loadBook(), first), false);

// 放回原位：顺序必须还原。放回末尾会让孩子刚整理的顺序又乱掉，
// 而"撤销"就该像没发生过
const restored = restoreToBook(first, taken.index);
check('放回原位之后条数回来', restored.length, 4);
check('放回原位之后顺序还原', restored[0], first);
check('放回之后落盘了（读回来的还是那一条）', entryKey(loadBook()[0]), entryKey(first));

// 同篇、同招、另一句——按句子区分，不能连坐
const other = loadBook()[2];
const takenOther = removeFromBook(other);
check('同招另一句不受连坐', loadBook().length, 3);
check('同招另一句拿出来带的是它自己的位置', takenOther.index, 2);
restoreToBook(other, takenOther.index);

// 册子里没有的那条：不动，也不该弹撤销
check('拿一条不存在的，位置是 -1', removeFromBook({ moveId: 'zz', essayId: 'no', from: 'essay' }).index, -1);
check('拿一条不存在的，册子没被动', loadBook().length, 4);

// 重复放回不重复塞
restoreToBook(first, taken.index);
check('同一条放回两次不会变两条', loadBook().length, 4);

// 拿走一条，支架撤除的两个数跟着变——它们是被册子推导出来的，没有第二套逻辑
resetBook();
addMove({ moveId: 'm1', name: 'a', essayId: 'e1', from: 'essay' });
addMove({ moveId: 'm2', name: 'b', essayId: 'e1', from: 'essay' });
addMove({ moveId: 'm1', name: 'a', essayId: 'e1', from: 'own', mySentence: '一句' });
check('拿走前：学来的 2 招', countLearnedMoves(loadBook()), 2);
check('拿走前：在 1 篇里写过', countOwnEssays(loadBook()), 1);
removeFromBook(loadBook()[0]);
check('拿走学来的招，学来的招数少一招', countLearnedMoves(loadBook()), 1);
check('拿走学来的招，写过的篇数不变', countOwnEssays(loadBook()), 1);

resetBook();
addMove({ moveId: 'm1', name: 'a', essayId: 'e1', from: 'essay' });
addMove({ moveId: 'm1', name: 'a', essayId: 'e1', from: 'own', mySentence: '一句' });
addMove({ moveId: 'm1', name: 'a', essayId: 'e2', from: 'own', mySentence: '两句' });
removeFromBook(loadBook()[1]);
check('拿走自己写的那句，学来的招数不变', countLearnedMoves(loadBook()), 1);
check('拿走自己写的那句，写过的篇数少一篇', countOwnEssays(loadBook()), 1);

console.log(
  failed === 0
    ? '\n全部通过：存进去的读得回来，别篇同一序号的不误判为自己收过的。\n'
    : `\n有 ${failed} 条没过，请先修复。\n`,
);
process.exit(failed === 0 ? 0 : 1);