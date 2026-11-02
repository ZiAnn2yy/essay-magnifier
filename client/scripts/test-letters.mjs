/**
 * 读者回信的单元测试。
 *
 * 为什么值得单独立一个脚本：2026-11-02 加了追问和「关上就锁」之后，
 * 这个模块有了真正的状态机——一封信要么活着（能追问），要么锁了（只能读），
 * 而锁是**不可逆**的。这类规则最容易出现"存的时候对、读的时候松"：
 * 锁写进去了，读的时候却还当它活着，追问入口就一直挂着。
 *
 * 用法：node scripts/test-letters.mjs
 * 退出码非 0 表示有用例没过。
 */

import {
  loadLetters,
  addLetter,
  addFollowUp,
  sealLetter,
  letterCount,
} from '../src/lib/letterStore.js';

/**
 * letterStore 走 `window.localStorage`，Node 里没有，补一个内存实现。
 * 只实现这个库真正用到的那三个方法。
 */
const backing = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => (backing.has(key) ? backing.get(key) : null),
    setItem: (key, value) => backing.set(key, String(value)),
    removeItem: (key) => backing.delete(key),
  },
};

/** 清空回信，让每条用例都从零开始。 */
function resetLetters() {
  backing.clear();
}

/** 收一封活信，返回它。 */
function freshLetter(overrides = {}) {
  addLetter({
    moveName: '把声音写出来',
    essayTitle: '爱转笔的同桌',
    mySentence: '他一上课就开始转笔。',
    reply: '这句我想再读一遍。',
    ...overrides,
  });
  return loadLetters()[loadLetters().length - 1];
}

let failed = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  期望 ${expected}，实得 ${actual}`}`);
}

console.log('\n回信：追问与关上就锁');

// ---- 新收的信是活的 ----
resetLetters();
const letter = freshLetter();
check('新收的信是活的', letter.live, true);
check('新收的信没有追问记录', Array.isArray(letter.followUps) && letter.followUps.length, 0);
check('信有 id', typeof letter.id, 'string');
check('读回来的还是那一封', loadLetters()[0].reply, '这句我想再读一遍。');

// ---- 活的信能加追问 ----
resetLetters();
const live = freshLetter();
const afterAsk = addFollowUp(live.id, { ask: '你也转过笔吗？', answer: '转过，上课被没收过三支。' });
check('加了一轮追问', afterAsk[0].followUps.length, 1);
check('追问记的是问', afterAsk[0].followUps[0].ask, '你也转过笔吗？');
check('追问记的是答', afterAsk[0].followUps[0].answer, '转过，上课被没收过三支。');
check('追问落盘了', loadLetters()[0].followUps.length, 1);
check('追问不改变原来的回信', loadLetters()[0].reply, '这句我想再读一遍。');
check('追问不把信锁掉', loadLetters()[0].live, true);

// 同一封信里可以追问很多次
addFollowUp(live.id, { ask: '后来呢？', answer: '后来我改转橡皮。' });
check('同一封信能追问两轮', loadLetters()[0].followUps.length, 2);
check('两轮按顺序排', loadLetters()[0].followUps[1].ask, '后来呢？');

// ---- 锁了就加不进 ----
resetLetters();
const toSeal = freshLetter();
const sealed = sealLetter(toSeal.id);
check('锁上了', sealed[0].live, false);
check('锁落盘了', loadLetters()[0].live, false);
const blocked = addFollowUp(toSeal.id, { ask: '还能问吗？', answer: '不能了。' });
check('锁了的信加不进追问', blocked[0].followUps.length, 0);
check('锁了之后册子没被动', loadLetters()[0].followUps.length, 0);

// ---- 锁是幂等的 ----
const sealedTwice = sealLetter(toSeal.id);
check('再锁一次没影响', sealedTwice[0].live, false);
check('再锁一次不会多出记录', sealedTwice[0].followUps.length, 0);

// ---- 锁之前问过的还在 ----
resetLetters();
const chatty = freshLetter();
addFollowUp(chatty.id, { ask: '你也转过笔吗？', answer: '转过。' });
sealLetter(chatty.id);
check('锁了之后问过的还在', loadLetters()[0].followUps.length, 1);
check('锁了之后答过的也还在', loadLetters()[0].followUps[0].answer, '转过。');

// ---- 不存在的 id：不动，也不炸 ----
resetLetters();
freshLetter();
check('给不存在的 id 加追问，册子不动', addFollowUp('没有这封', { ask: '在吗', answer: '在' }).length, 1);
check('给不存在的 id 上锁，册子不动', sealLetter('没有这封')[0].live, true);

// ---- 空问或空答不加 ----
resetLetters();
const guard = freshLetter();
check('空问不加', addFollowUp(guard.id, { ask: '   ', answer: '答了' })[0].followUps.length, 0);
check('空答不加', addFollowUp(guard.id, { ask: '问了', answer: '' })[0].followUps.length, 0);
check('两个都空也不加', addFollowUp(guard.id, {})[0].followUps.length, 0);
check('加完之后还是活的', loadLetters()[0].live, true);

// ---- 追问有上限 ----
resetLetters();
const many = freshLetter();
for (let i = 0; i < 25; i += 1) {
  addFollowUp(many.id, { ask: `第 ${i} 问`, answer: `第 ${i} 答` });
}
check('追问有上限，不会把这封信撑爆', loadLetters()[0].followUps.length, 20);
check('到上限之后信还在', loadLetters().length, 1);

// ---- 多封信各自独立 ----
resetLetters();
const first = freshLetter();
const second = freshLetter({ mySentence: '另一句。', reply: '另一封。' });
addFollowUp(first.id, { ask: '问第一封', answer: '答第一封' });
check('只问第一封，第二封没有追问', loadLetters()[1].followUps.length, 0);
check('第一封有追问', loadLetters()[0].followUps.length, 1);
sealLetter(first.id);
check('锁第一封，第二封还是活的', loadLetters()[1].live, true);
check('锁第一封不影响第二封的追问入口', loadLetters()[1].live, true);

// ---- 计数 ----
resetLetters();
check('空的时候是 0 封', letterCount(), 0);
freshLetter();
freshLetter();
check('两封就是 2', letterCount(), 2);

console.log(
  failed === 0
    ? '\n全部通过：活的信能追问，锁了的信只能读，锁是不可逆的。\n'
    : `\n有 ${failed} 条没过，请先修复。\n`,
);
process.exit(failed === 0 ? 0 : 1);
