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

/**
 * 册子条目的唯一键。
 *
 * **必须带 essayId。** 招式的 id 是 `m1/m2/m3`，按次拆解生成，不是全局唯一的——
 * 每一篇范文的第一招都叫 m1。只比 moveId 的话，孩子在任何一篇里收过 m1，
 * 每一篇的 m1 都会显示"已收进册子"；写过一句的那招更糟，
 * 别的篇目同一个序号会显示"已经收进作文本了"且按钮禁用，他新写的这句存不进去。
 *
 * 2026-10-30 真犯过：存储用的是这个复合键（对的），读回来时只 map 了 moveId（错的），
 * 于是册子里明明没有这一招，卡片上写着已收。用户在演示时抓到的。
 *
 * @param {{essayId: string, moveId: string, from: string}} entry
 * @returns {string}
 */
export function entryKey(entry) {
  return `${entry.essayId}::${entry.moveId}::${entry.from}`;
}

/**
 * 册子里有没有这一条——同一篇、同一招、同一种来源，三者全对上才算。
 *
 * @param {Array} entries 册子条目，传 loadBook() 的结果
 * @param {{essayId: string, moveId: string, from: string}} wanted
 * @returns {boolean}
 */
export function hasEntry(entries, wanted) {
  if (!wanted?.essayId || !wanted?.moveId || !wanted?.from) return false;
  const key = entryKey(wanted);
  return (Array.isArray(entries) ? entries : []).some((item) => entryKey(item) === key);
}

/** 同一招在同一篇里只收一次——重复收藏会让"攒了多少"变成假的 */
function keyOf(entry) {
  return entryKey(entry);
}

/**
 * 学来的招数：只数 `from: 'essay'`，不数自己写过的句子。
 *
 * 这个数是**支架撤除**的一半依据（服务端按它决定这一篇还直接标几招、
 * 要不要给 challenge）。所以它必须只反映"见过多少招"。
 *
 * 2026-10-30 之前调用方传的是 `loadBook().length`——册子里混着两种条目，
 * 于是孩子在十篇范文里反复用同一招写十句，册子厚到 10，服务端判定该撤支架，
 * prompt 还会跟他说"你已经自己攒下 10 招了"。他并没有更会自己找招，
 * 只是同一招练了十次。**撤除的依据是见过多少招，不是写过多少字。**
 *
 * 2026-10-31 起它只是合取的一半，另一半是 countOwnEssays——见那个函数的说明。
 *
 * @param {Array} entries 册子条目，传 loadBook() 的结果
 * @returns {number} 从范文学来的招数
 */
export function countLearnedMoves(entries) {
  return (Array.isArray(entries) ? entries : []).filter((entry) => entry.from === 'essay').length;
}

/**
 * 自己用出来过的**篇目数**：只数 `from: 'own'`，且按 essayId 去重。
 *
 * 这是支架撤除的另一半依据，和 countLearnedMoves 是**合取**，不是替换：
 * 见过很多招但从不动笔的孩子，支架永远不该撤（他没地方使力）；
 * 只学过一招却反复写它的孩子，撤了他也没东西可找。
 * Renkl & Atkinson (2003) 的结论是撤除该按表现走，而"在几篇里真的用出来过"
 * 是这个产品能拿到的最接近表现的信号。
 *
 * **必须按篇目去重，不能按句子条数。** 同一招写十句就是 2026-10-30
 * 修掉的那种虚高：计数涨了十倍，能力没动。按篇目还有一个好处——
 * 它和头衔（决策 48：按"用自己的话接过的篇数"算）是同一个数，
 * 两处口径从此不再分叉。
 *
 * @param {Array} entries 册子条目，传 loadBook() 的结果
 * @returns {number} 真正动笔写过的篇目数
 */
export function countOwnEssays(entries) {
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry?.from === 'own' && entry.essayId) seen.add(entry.essayId);
  }
  return seen.size;
}

/**
 * 用得最多的一招，以及它出现在几篇里。
 *
 * 兴趣个体化的最轻一层（Hidi & Renninger 四阶段的第三阶段）：册子原来按时间
 * 倒序，孩子在里面只看到"我收过什么"，看不到"我"。把分布算出来告诉他
 * "你最常用这一招"，是从"每篇都有新东西"走到"我知道自己擅长什么"的那一步。
 *
 * 数据本来就在 localStorage 里，这一层不新增任何采集。
 *
 * @param {Array} entries 册子条目，传 loadBook() 的结果
 * @returns {{name: string, essays: number} | null} 没有记录时返回 null
 */
export function favouriteMove(entries) {
  const tally = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry?.from !== 'own' || !entry.name) continue;
    const key = entry.name;
    if (!tally.has(key)) tally.set(key, new Set());
    tally.get(key).add(entry.essayId);
  }
  let best = null;
  for (const [name, essays] of tally) {
    if (!best || essays.size > best.essays) best = { name, essays: essays.size };
  }
  return best;
}

/**
 * 头衔。按"**用自己的话接过的篇数**"算。
 *
 * 这个数和支架撤除的 countOwnEssays 是**同一个**，别再另算一套——
 * 两处口径分叉比没有更糟（决策 51）。
 *
 * 为什么不按技巧种类：招式名没有分类法。257 个名字对应约 260 招，
 * 存在「把快动作拆成小步骤写」「把动作放慢成小步骤写」「把动作拆成小步骤写」
 * 这种同一技术三个字符串的情况，数它等于数字符串。而篇数有界（≤79）、
 * 刷不动（每篇走完整个闭环才计一次）、且真实。
 *
 * 阈值是产品自拟的教学判断，不是某种量表——名字要说的是"你已经走到这儿了"，
 * 不是"你得了多少分"。别加进度条：进度条暗示有个终点，而这个产品没有。
 */
const TITLE_TIERS = [
  { min: 10, label: '停不下来的写手' },
  { min: 6, label: '有自己的招式的人' },
  { min: 3, label: '越写越顺的人' },
  { min: 1, label: '敢写自己的人' },
  { min: 0, label: '写作初学者' },
];

export function titleFor(entries) {
  const essays = countOwnEssays(entries);
  return TITLE_TIERS.find((tier) => essays >= tier.min).label;
}

/**
 * 在几种文体里写过。广度这一轴，和深度（同一招练了几次）分开。
 *
 * 文体来自条目里的 `topic`（写人/记事/写景/状物/想象），最多 5 种。
 * 粘贴进来的范文没有类型，那些篇目不计——不知道的事不猜。
 * 旧数据没有这个字段时返回 0，调用方据此不显示这一行，不显示成"0 种"。
 *
 * @param {Array} entries 册子条目
 * @returns {number} 文体种类数
 */
export function countGenres(entries) {
  const genres = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry?.from === 'own' && entry.topic) genres.add(entry.topic);
  }
  return genres.size;
}

/**
 * 证据墙：按招式名把自己的句子分组。
 *
 * **句子就是证据，零判定。** 不评分、不排名、不说好不好、不和朋友比——
 * 追加任何评价都会让孩子追评价而不是追写法（决策 42：激励是证据不是奖励）。
 * 把它按招式分组，是为了让他看见"这一招我用过三次，这是那三次"——
 * 从"我写过一些句子"变成"我在练这一招"。
 *
 * @param {Array} entries 册子条目
 * @returns {Array<{name: string, sentences: Array}>} 最近用过的招式在前
 */
export function ownSentencesByMove(entries) {
  const groups = new Map();
  const list = Array.isArray(entries) ? entries : [];
  // 倒着走，让最近用过的招式排在最前面——册子是给孩子回头看自己的，
  // 不是档案馆
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const entry = list[i];
    if (entry?.from !== 'own' || !entry.mySentence) continue;
    const name = entry.name || '自己用的一招';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(entry);
  }
  return [...groups].map(([name, sentences]) => ({ name, sentences }));
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
