/**
 * 招式收藏册（localStorage）。
 *
 * 这是产品"越攒越多"的那一半：学到一招收进去，自己写的句子里被认出一招也收进去。
 * 存本机就够——不需要账号，也不收集任何身份信息（规范§四.5）。
 * 容器重新部署会重置服务端会话，但收藏册在浏览器里，不受影响。
 */

const KEY = 'fw.moveBook';

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    //  localStorage 可能被禁用或写坏过——收藏册不是核心流程，坏了不该挡住孩子写作文
    return [];
  }
}

function write(entries) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // 同上：存不下去就只是这一台设备不留痕，不报错、不打断
  }
}

/** 同一招在同一篇里只收一次——重复收藏会让"攒了多少"变成假的 */
function keyOf(entry) {
  return `${entry.essayId}::${entry.moveId}::${entry.from}`;
}

export function loadBook() {
  return read();
}

export function addMove(entry) {
  const entries = read();
  if (entries.some((item) => keyOf(item) === keyOf(entry))) return entries;
  const next = [...entries, { ...entry, at: Date.now() }];
  write(next);
  return next;
}

export function clearBook() {
  write([]);
  return [];
}
