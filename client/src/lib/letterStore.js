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
 *
 * ## 追问与「关上就锁」（2026-11-02 加）
 *
 * 一封信可以是**活的**（`live: true`）：孩子在 modal 里能接着问，读者当场答，
 * 问答都记在 `followUps` 里。**关上那一刻它就锁了**（`live: false`）——
 * 之后从顶栏或 dock 再打开，只能读，不能再问。
 *
 * 为什么这么设计：用户要的是「引起兴趣」加「让孩子们把握当下」。
 * 回信来了那一刻是孩子最想说话的瞬间，那个瞬间过去了就不再补票——
 * 否则「回头再聊」等于永远不聊，而追问本来是产品里最能撬动写作的那一下。
 * 锁只是不再增长，已经问过答过的都还在，随时能翻回去看。
 */

const KEY = 'fw.letters';
const MAX_LETTERS = 60;
/** 追问里最多存几轮。够聊了，也防一个停不下来的孩子把这封信撑爆 */
const MAX_FOLLOW_UPS = 20;

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
 *
 * 新收的信是**活的**：能追问。关上那一刻由 sealLetter 锁掉。
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
      // 追问的记录，也证明这封信被聊过。旧数据没有这个字段，统一按空数组读
      followUps: [],
      live: true,
    },
  ];
  write(next.length > MAX_LETTERS ? next.slice(next.length - MAX_LETTERS) : next);
  return next.length > MAX_LETTERS ? next.slice(next.length - MAX_LETTERS) : next;
}

/**
 * 往一封**活的**信里加一轮追问。返回新的数组。
 *
 * 已经锁了的信加不进去（返回原数组）——锁了就是锁了，没有后门。
 * 超过 MAX_FOLLOW_UPS 也不再长：那一信已经聊透了，该去写下一句了。
 *
 * @param {string} letterId 信 id
 * @param {{ask: string, answer: string}} turn 这一轮问的和答的
 */
export function addFollowUp(letterId, turn) {
  const letters = read();
  const index = letters.findIndex((item) => item.id === letterId);
  if (index < 0) return letters;

  const letter = letters[index];
  if (letter.live !== true) return letters;
  const existing = Array.isArray(letter.followUps) ? letter.followUps : [];
  if (existing.length >= MAX_FOLLOW_UPS) return letters;

  const ask = String(turn?.ask ?? '').trim();
  const answer = String(turn?.answer ?? '').trim();
  if (ask.length === 0 || answer.length === 0) return letters;

  const next = [...letters];
  next[index] = { ...letter, followUps: [...existing, { ask, answer, at: Date.now() }] };
  write(next);
  return next;
}

/**
 * 把一封信锁上：关上它的那一刻调用。锁了之后只能读，不能再追问。
 *
 * 已经锁过的再锁一次没影响（幂等）——从历史里打开又关上不该报错。
 */
export function sealLetter(letterId) {
  const letters = read();
  const index = letters.findIndex((item) => item.id === letterId);
  if (index < 0) return letters;
  if (letters[index].live === false) return letters;
  const next = [...letters];
  next[index] = { ...next[index], live: false };
  write(next);
  return next;
}

export function letterCount() {
  return read().length;
}
