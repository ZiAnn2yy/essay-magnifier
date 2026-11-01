/**
 * 行为埋点：**只计数，不带身份**。
 *
 * 为什么需要：官方评分框架要"用户行为趋势"，而在此之前产品一条数据都没有——
 * 答辩时只能说"我们设计了什么"，不能说"孩子实际是怎么走的"。
 * 这不是加分项，是评分框架里明写的一项。
 *
 * 三条约束都是被红线逼出来的，不是洁癖：
 *
 * 1. **属性白名单，不接受任意字段。** 红线一是"作品内容零个人信息"。
 *    如果 props 想传什么就存什么，一次手滑就能把姓名学校写进日志，
 *    而日志本身是要交给评委看的材料。白名单让这件事在结构上不可能，
 *    不靠"我记得别传"。
 * 2. **不存任何原文。** 孩子写了什么、范文是哪篇，一律不落盘，
 *    只存计数、档位和耗时。原文只在请求里流转——这本来就是产品立场
 *    （粘贴的范文不落库），埋点不能破例。
 * 3. **会话 id 是随机数，不是身份。** 要算漏斗（多少会话走到第三步）
 *    就必须有会话概念，所以发一个随机 sid；它不由任何个人信息派生，
 *     只活在 sessionStorage 里，关掉标签页就换一个。
 *
 * 存哪儿：内存聚合 + JSONL 追加。**不引数据库**——项目已经为"会话状态"
 * 删掉过 node:sqlite（决策 19），再为一个计数器把它请回来是本末倒置。
 * 容器文件系统本来就不跨重启保留，JSONL 的定位是"这一次部署期间的行为证据"。
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 事件白名单。key 是允许随事件一起记下来的属性名。
 *
 * 每个属性都要能答上"它驱动什么"：grade 驱动学段对比，source 驱动
 * "内置还是粘贴"这条路径的占比，ms 驱动等待态分档要不要调。
 * 答不上来的属性不要加进来——加一个就是一个要维护的字段。
 */
const EVENTS = {
  // 进到开始屏（门槛通过）
  enter: { keys: [] },
  // 点了"开始"
  start: { keys: [] },
  // 选了年级
  grade_pick: { keys: ['grade'] },
  // 选了一篇范文。source: builtin | pasted
  essay_pick: { keys: ['grade', 'source'] },
  // 拆解返回。precomputed/degraded 是布尔，ms 是耗时
  analyze_done: { keys: ['grade', 'moves', 'precomputed', 'degraded', 'ms'] },
  // 收一招进册子。from: essay | own | spotted
  move_collect: { keys: ['grade', 'from'] },
  // 点了"用这一招"
  move_use: { keys: ['grade'] },
  // 挑战卡：孩子自己看出一招。origin: listed（从标好的里挑）| custom（自己命名）
  spotted: { keys: ['grade', 'origin'] },
  // 挑战卡：选了"这次没看出来"。和 spotted 分开数——它是参与率的另一半
  spotted_skipped: { keys: ['grade'] },
  // 孩子写下自己的句子并交给读者
  written: { keys: ['grade', 'ms'] },
  // 读者回信到达。degraded 是真的降级了（没配上 Key / 超时 / 额度）
  reader_done: { keys: ['grade', 'degraded', 'ms'] },
};

/** 属性值的形状校验。布尔和数字不落字符串，避免"true"/"false"两种写法。 */
const SHAPES = {
  grade: (v) => Number.isInteger(v) && v >= 3 && v <= 6,
  source: (v) => v === 'builtin' || v === 'pasted',
  from: (v) => v === 'essay' || v === 'own' || v === 'spotted',
  origin: (v) => v === 'listed' || v === 'custom',
  moves: (v) => Number.isInteger(v) && v >= 0 && v <= 20,
  ms: (v) => Number.isInteger(v) && v >= 0 && v <= 600000,
  precomputed: (v) => typeof v === 'boolean',
  degraded: (v) => typeof v === 'boolean',
};

const MAX_SID_LENGTH = 64;
/** 会话集合的上限。到顶就停止新增，只继续计数——埋点不该把内存吃光。 */
const MAX_SESSIONS = 20000;

/**
 * 事件日志目录。
 *
 * 路径推导踩过一次：本文件在 `server/src/` 下，不是 `server/src/agent/` 下，
 * 所以只需要**一级** `..`。写成 `../../` 会把日志写到仓库根的 `data/` 里——
 * 既不在服务目录下（部署时那个目录可能不存在），也绕开了 .gitignore 的
 * `server/data/*` 规则。参照 `agent/precomputed.js` 的写法时注意它在多一层。
 */
const logDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'analytics',
);
let logReady = false;

/** 内存聚合。sessions 按事件分桶，用于算漏斗。 */
const state = {
  counts: {},
  byGrade: {},
  byValue: {},
  timings: {},
  sessions: new Set(),
  sessionEvents: {},
};

function bump(bucket, event, key, value) {
  if (!bucket[event]) bucket[event] = {};
  if (!bucket[event][key]) bucket[event][key] = {};
  bucket[event][key][value] = (bucket[event][key][value] ?? 0) + 1;
}

/**
 * 记一条事件。
 *
 * 白名单外的属性**静默丢掉而不是报错**：前端多传一个字段不该让孩子的
 * 点击失败——埋点是附属功能，它没有资格影响主流程。真正的保证在
 * 服务端根本不认那些字段，所以丢和从来没传是一样的。
 *
 * @param {string} event 事件名，必须在 EVENTS 里
 * @param {string} sid 会话 id（随机，非身份）
 * @param {Object} [props] 属性，键必须在白名单里
 * @returns {{ok: boolean, dropped?: string[]}}
 */
export function record(event, sid, props = {}) {
  const schema = EVENTS[event];
  if (!schema) return { ok: false, dropped: [] };
  if (typeof sid !== 'string' || sid.length === 0 || sid.length > MAX_SID_LENGTH) {
    return { ok: false, dropped: [] };
  }

  const kept = {};
  const dropped = [];
  for (const [key, value] of Object.entries(props ?? {})) {
    if (!schema.keys.includes(key) || !SHAPES[key]?.(value)) {
      dropped.push(key);
      continue;
    }
    kept[key] = value;
  }

  state.counts[event] = (state.counts[event] ?? 0) + 1;

  if (state.sessions.size < MAX_SESSIONS) state.sessions.add(sid);
  if (!state.sessionEvents[sid]) state.sessionEvents[sid] = new Set();
  state.sessionEvents[sid].add(event);

  for (const [key, value] of Object.entries(kept)) {
    if (key === 'grade') bump(state.byGrade, event, String(value), value);
    else if (key === 'ms') {
      if (!state.timings[event]) state.timings[event] = { n: 0, sum: 0, max: 0 };
      const slot = state.timings[event];
      slot.n += 1;
      slot.sum += value;
      slot.max = Math.max(slot.max, value);
    } else {
      bump(state.byValue, event, key, String(value));
    }
  }

  appendLine(event, sid, kept);
  return { ok: true, dropped };
}

/**
 * 落一行 JSONL。
 *
 * 失败**不往外抛**：磁盘写满或文件系统只读都不该让孩子点不动。
 * 埋点的价值在内存里那份聚合，磁盘只是留一份可核对的原始记录。
 */
function appendLine(event, sid, props) {
  try {
    if (!logReady) {
      mkdirSync(logDir, { recursive: true });
      logReady = true;
    }
    const line = JSON.stringify({ t: Date.now(), event, sid, ...props });
    appendFileSync(path.join(logDir, 'events.jsonl'), `${line}\n`);
  } catch {
    // 写不进就只在内存里计数，见函数说明
  }
}

/** 当前快照。给 /api/v3/stats 和答辩用。 */
export function snapshot() {
  const funnel = {};
  for (const event of Object.keys(EVENTS)) {
    let reached = 0;
    for (const seen of Object.values(state.sessionEvents)) {
      if (seen.has(event)) reached += 1;
    }
    funnel[event] = reached;
  }

  const timings = {};
  for (const [event, slot] of Object.entries(state.timings)) {
    timings[event] = {
      n: slot.n,
      avgMs: Math.round(slot.sum / slot.n),
      maxMs: slot.max,
    };
  }

  return {
    events: state.counts,
    byGrade: state.byGrade,
    byValue: state.byValue,
    timings,
    funnel,
    sessions: state.sessions.size,
  };
}

/** 已登记的事件名。给 /api/health 和评测用。 */
export function knownEvents() {
  return Object.keys(EVENTS);
}

/** 重置。只给评测用——线上没有"清空数据"这个操作。 */
export function resetAnalytics() {
  state.counts = {};
  state.byGrade = {};
  state.byValue = {};
  state.timings = {};
  state.sessions = new Set();
  state.sessionEvents = {};
}
