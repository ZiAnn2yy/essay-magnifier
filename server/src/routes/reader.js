/**
 * 读者回应路由：POST /api/v3/reader
 *
 * 一次性旁路调用：不写会话、不进对话历史。读者回应的是"这一句"，
 * 不是一段需要记忆的对话。
 *
 * 注意这里**不校验 learnerId**——读者回应不需要身份。
 * 建档是 /api/chat 那条链路的事，与它无关。
 */

import { Router } from 'express';
import { ValidationError, errorResponse } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';
import { validateText } from '../lib/validate.js';
import { buildReaderReply } from '../agent/reader.js';

const router = Router();

const MAX_MOVE_NAME = 40;
const MAX_TITLE = 40;

function validateChildText(value) {
  return validateText(value, 'childText', config.maxInputLength);
}

function validateShort(value, name, max) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new ValidationError(`${name} 必须是字符串`);
  }
  if (value.trim().length > max) {
    throw new ValidationError(`${name} 过长，最多 ${max} 字`);
  }
  return value.trim();
}

router.post('/', async (req, res) => {
  try {
    const request = {
      moveName: validateShort(req.body?.moveName, 'moveName', MAX_MOVE_NAME),
      essayTitle: validateShort(req.body?.essayTitle, 'essayTitle', MAX_TITLE),
      childText: validateChildText(req.body?.childText),
    };

    const result = await buildReaderReply(request);

    res.json({
      ok: true,
      degraded: result.degraded,
      crisis: result.crisis,
      reply: result.reply,
    });
  } catch (error) {
    const { status, body } = errorResponse(error);
    if (status >= 500) logger.error('读者回应接口异常', { message: error.message });
    res.status(status).json(body);
  }
});

export default router;
