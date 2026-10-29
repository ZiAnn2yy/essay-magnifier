/**
 * 访问门槛路由。
 *
 * GET  /api/access  告诉前端要不要密码页、当前有没有解锁
 * POST /api/access  提交密码，成功则种下会话 cookie
 *
 * 这两个端点本身必须在门槛之外，否则前端永远问不到"要不要密码"。
 */

import { Router } from 'express';
import { ValidationError } from '../lib/errors.js';
import { isRequired, isUnlocked, issueCookie, tryUnlock } from '../auth/access-code.js';

const router = Router();

router.get('/', (req, res) => {
  const required = isRequired();
  res.json({
    ok: true,
    required,
    // 没设门槛时 unlocked 恒为 true，前端据此直接进主界面
    unlocked: required ? isUnlocked(req) : true,
  });
});

router.post('/', (req, res) => {
  const required = isRequired();
  if (!required) {
    // 没设门槛却来解锁，是前端状态错了，不是用户的错
    res.json({ ok: true, required: false, unlocked: true });
    return;
  }

  const code = req.body?.code;
  if (typeof code !== 'string' || code.trim().length === 0) {
    throw new ValidationError('请输入访问密码');
  }

  if (!tryUnlock(code)) {
    throw new ValidationError('密码不对，再试一次');
  }

  res.setHeader('Set-Cookie', issueCookie());
  res.json({ ok: true, required: true, unlocked: true });
});

export default router;
