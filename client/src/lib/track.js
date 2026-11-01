/**
 * 行为埋点的前端一半。**只计数，不带身份。**
 *
 * 四条设计约束：
 *
 * 1. **绝不抛异常、绝不拦交互。** 埋点是附属功能，它没有资格让孩子的点击失败。
 *    所有失败路径都静默吞掉——网络不通、服务端 500、事件不在白名单里，
 *    对孩子来说都应该是"什么都没发生"。
 * 2. **批量发送。** 一次漏斗要走七八步，一步步发是七八个请求；
 *    攒一小批再发，弱网下也不会把产品拖慢。队列上限 10 条或 2 秒。
 * 3. **会话 id 是随机数，不由任何个人信息派生**，只活在 sessionStorage 里——
 *    关掉标签页就换一个。它的唯一用途是让服务端能算漏斗
 *    （多少会话走到了第三步），它不是身份。
 * 4. **不传任何原文。** 孩子写了什么、范文是哪篇，一律不进入这里。
 *    只传档位、来源、布尔和耗时。
 *
 * 权威的事件清单在 `server/src/analytics.js` 的 EVENTS 白名单里——
 * 两边必须对得上，加事件时两边一起改。
 */

const SID_KEY = 'fw.sid';
const FLUSH_MS = 2000;
const MAX_QUEUE = 10;

let queue = [];
let timer = null;
let sid = null;

function randomSid() {
  // 16 字节随机数的十六进制。不用 crypto.getRandomValues 之外的任何熵源，
  // 不掺时间戳——掺了就有了"可关联"的性质，而这里要的就是不可关联。
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function sessionId() {
  if (sid !== null) return sid;
  try {
    const cached = window.sessionStorage.getItem(SID_KEY);
    if (cached) {
      sid = cached;
      return sid;
    }
    sid = randomSid();
    window.sessionStorage.setItem(SID_KEY, sid);
  } catch {
    // sessionStorage 被禁用（隐私模式 / 存储策略）时每次会话发一个临时的，
    // 漏斗会少算几次重复访问，但计数本身仍然正确
    sid = randomSid();
  }
  return sid;
}

function flush() {
  timer = null;
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];

  const body = JSON.stringify({ events: batch });
  // sendBeacon 在页面卸载时仍然发得出去，fetch+keepalive 是它的退化路径。
  // 两者都不等响应——埋点不该让孩子等一个 ack。
  try {
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/v3/track', new Blob([body], { type: 'application/json' }));
      return;
    }
  } catch {
    // 落到下面的 fetch
  }
  fetch('/api/v3/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // 发不出去就这一次不发。见文件头第 1 条
  });
}

function schedule() {
  if (timer !== null) return;
  timer = window.setTimeout(flush, FLUSH_MS);
}

/**
 * 记一条行为事件。
 *
 * @param {string} event 事件名，必须在服务端白名单里（server/src/analytics.js）
 * @param {Object} [props] 属性，键同样必须在白名单里
 */
export function track(event, props = {}) {
  try {
    queue.push({ event, sid: sessionId(), props });
    if (queue.length >= MAX_QUEUE) flush();
    else schedule();
  } catch {
    // 见文件头第 1 条：埋点失败对产品不可见
  }
}

/** 页面要走了，把手里这批发出去。卸载时 setTimeout 不可靠，只有 beacon 靠谱。 */
export function flushNow() {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  flush();
}

if (typeof document !== 'undefined') {
  // visibilitychange 而不是 pagehide/unload：移动端和现代浏览器常常
  // 根本不触发 unload，而切到后台一定会触发 visibilitychange。
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
  });
}
