/**
 * 访问门槛。
 *
 * 形态是**一个共享访问密码**，不是"管理员账号"——本产品没有可管理的东西
 * （无后台、无用户列表，产品立场就是不收集姓名学校，learnerId 随机生成）。
 * 为挡人而建一套账号体系，是拿最贵的方案办最便宜的事。
 *
 * 三条设计约束：
 *
 * 1. **密码不进代码。** 只从 `ACCESS_CODE` 环境变量读。代码、git 历史、README
 *    都属于"作品内容"（规范§〇红线一），提交历史里的秘密永远删不掉。
 * 2. **API 和页面一起挡。** 只挡页面的话，别人可以直接打 /api/chat 烧模型额度。
 *    所以中间件挂在 /api 下，只放行 /api/health 与 /api/access。
 * 3. **不设锁定。** 输错不计数、不锁人。评审专家卡在门外是要扣分的，
 *    而"防爆破"对一个共享密码没有意义——它本来就会告诉所有评委。
 *
 * 会话用无状态签名 cookie：`<nonce>.<hmac(nonce)>`，密钥就是 ACCESS_CODE 本身。
 * 不落库、不需要 session 存储，容器重启不失效。
 */

import crypto from 'node:crypto';
import { config } from '../config.js';

const COOKIE_NAME = 'fw_access';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 评委不该被要求反复输入

/** 先哈希再比较，耗时与内容长度无关——避免靠响应时间试密码 */
function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest();
  const right = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

function sign(nonce) {
  return crypto.createHmac('sha256', config.accessCode).update(nonce).digest('hex');
}

export function isRequired() {
  return config.accessCode.length > 0;
}

/** 签发会话 cookie 的 Set-Cookie 值。HttpOnly 让 JS 读不到，SameSite=Lax 挡 CSRF。 */
export function issueCookie() {
  const nonce = crypto.randomBytes(16).toString('hex');
  // 不设 Secure：部署还没上 HTTPS，设了 cookie 根本存不进去，评委会被锁在门外
  return `${COOKIE_NAME}=${nonce}.${sign(nonce)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

/** 校验输入的密码。未设门槛时恒为 false——没有门槛就无所谓"解锁"。 */
export function tryUnlock(code) {
  if (!isRequired() || typeof code !== 'string') return false;
  return safeEqual(code, config.accessCode);
}

/** 当前请求是否已解锁。未设门槛时恒为 true。 */
export function isUnlocked(req) {
  if (!isRequired()) return true;

  const header = req.headers?.cookie ?? '';
  for (const part of header.split(';')) {
    const separator = part.trim().indexOf('=');
    if (separator <= 0) continue;
    if (part.trim().slice(0, separator) !== COOKIE_NAME) continue;

    const value = part.trim().slice(separator + 1);
    const dot = value.indexOf('.');
    if (dot <= 0) return false;
    return safeEqual(value.slice(dot + 1), sign(value.slice(0, dot)));
  }
  return false;
}

/** /api 的守卫：挡 API，不挡静态页面——页面由前端据此显示密码页。 */
export function requireAccess(req, res, next) {
  if (isUnlocked(req)) {
    next();
    return;
  }
  res.status(401).json({ ok: false, code: 'locked', message: '需要访问密码' });
}
