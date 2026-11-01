/**
 * 埋点路由。
 *
 * POST /api/v3/track   记一批行为事件（只计数，不带身份）
 * GET  /api/v3/stats   看聚合结果
 *
 * 请求体是一批而不是一条：一次漏斗要走七八步，一步步发是七八个请求。
 * 前端攒一小批再发（见 client/src/lib/track.js）。
 *
 * 两个端点都在访问门槛之内（app.js 的中间件只放行 /api/health 和
 * /api/access），所以统计数据不会裸奔在公网上。
 *
 * **track 永远返回 ok，哪怕事件不合法。** 埋点是附属功能，
 * 它没有资格让孩子的点击失败——前端点一下"用这一招"，
 * 不能因为埋点没记上就弹一个错误。非法事件在服务端被丢掉，
 * 和从来没传是一样的。
 */

import { Router } from 'express';
import { ValidationError } from '../lib/errors.js';
import { record, snapshot } from '../analytics.js';

const router = Router();

const MAX_BATCH = 20;

// 挂在 /api/v3 下，所以这里是 '/track' 和 '/stats'
router.post('/track', (req, res) => {
  const events = req.body?.events;
  if (!Array.isArray(events) || events.length === 0 || events.length > MAX_BATCH) {
    throw new ValidationError(`events 必须是 1-${MAX_BATCH} 条的数组`);
  }

  let accepted = 0;
  for (const item of events) {
    if (typeof item?.event !== 'string' || typeof item?.sid !== 'string') continue;
    if (item.props !== undefined && (typeof item.props !== 'object' || item.props === null)) continue;
    if (record(item.event, item.sid, item.props ?? {}).ok) accepted += 1;
  }

  // 一条都没收下也返回 ok——理由见文件头
  res.json({ ok: true, accepted });
});

router.get('/stats', (_req, res) => {
  res.json({ ok: true, ...snapshot() });
});
export default router;
