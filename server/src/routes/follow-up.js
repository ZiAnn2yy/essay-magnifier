/**
 * 追问路由：POST /api/v3/follow-up
 *
 * 孩子读完读者的回信，接着问一个问题，读者当场答。
 *
 * 和 /api/v3/reader 的分工：那一问一答是"这一句写得怎么样"，
 * 这一问一答是"关于它我还想聊"。同一封信里可以追问很多次，
 * 每次都是独立调用，不写会话——上下文由调用方把原句和原回信带进来。
 *
 * 不校验 learnerId：这条路径同样不需要身份（和 reader 一致）。
 */

import { Router } from 'express';
import { ValidationError, errorResponse } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';
import { validateText } from '../lib/validate.js';
import { buildFollowUpReply } from '../agent/reader.js';

const router = Router();

const MAX_MOVE_NAME = 40;
const MAX_TITLE = 40;

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
      // 原句和原回信是上下文，长度按正文字数算——它们是模型输出，
      // 可能比孩子写的长，但不该无限长
      mySentence: validateText(req.body?.mySentence, 'mySentence', config.maxInputLength),
      reply: validateText(req.body?.reply, 'reply', config.maxInputLength),
      question: validateText(req.body?.question, 'question', config.maxInputLength),
    };

    const result = await buildFollowUpReply(request);

    res.json({
      ok: true,
      degraded: result.degraded,
      crisis: result.crisis,
      answer: result.reply,
      // 额度耗尽和"没配 Key"是两种故障，前端要能分别对待
      quota: result.quota === true,
    });
  } catch (error) {
    const { status, body } = errorResponse(error);
    if (status >= 500) logger.error('追问接口异常', { message: error.message });
    res.status(status).json(body);
  }
});

export default router;
