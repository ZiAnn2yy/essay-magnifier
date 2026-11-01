/**
 * 读者的回信。**存在本机，不上传。**
 *
 * 为什么要存：回信放大镜收回之后，dock 里不再留信纸（用户 10-31 问定的），
 * 那么多封回信就得有个地方能翻回去看——否则"收回"就成了"再也找不到"。
 * 顶栏那个回信入口读的就是这里。
 *
 * 和册子（moveBook.js）的分工：册子存**孩子自己的产出**（学来的招、用上的句），
 * 这里存**读者对他说的话**以及引出这封信的那一句。两者都是 localStorage，
 * 都不过服务端——产品立场是不收集身份，也不把孩子的文字传出本机。
 *
 * 上限 60 封，超出丢最旧的。不设上限的话，一个用得很久的孩子会让这个数组
 * 无限增长，而每次读回来都要整个 JSON.parse。
 */

const KEY = 'fw.letters';
const MAX_LETTERS = 60;

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // 存储可能被手改坏或来自旧版本。回信不是核心流程，坏了不该挡住孩子写作文
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) => item && typeof item.reply === 'string' && typeof item.id === 'string',
    );
  } catch {
    return [];
  }
}

function write(letters) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(letters));
  } catch {
    // 隐私模式下 localStorage 可能写不进去。信还在模态里读得到，只是刷新后没了
  }
}

/** 全部回信，按时间正序（最早的在前面，最新的是最后一封）。 */
export function loadLetters() {
  return read();
}

/**
 * 收一封新回信，返回新的数组。
 *
 * 同一篇里对同一句重复提交会拿到不同的回信（temperature=1），所以不去重——
 * 两封都是真发生过的。上限按时间砍最旧的。
 */
export function addLetter(entry) {
  const letters = read();
  const next = [
    ...letters,
    {
      id: `L${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(),
      moveName: String(entry.moveName ?? ''),
      essayTitle: String(entry.essayTitle ?? ''),
      mySentence: String(entry.mySentence ?? ''),
      reply: String(entry.reply ?? ''),
      degraded: entry.degraded === true,
    },
  ];
  write(next.length > MAX_LETTERS ? next.slice(next.length - MAX_LETTERS) : next);
  return next.length > MAX_LETTERS ? next.slice(next.length - MAX_LETTERS) : next;
}

export function letterCount() {
  return read().length;
}
