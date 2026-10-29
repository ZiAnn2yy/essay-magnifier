/**
 * 绘本分镜路由：POST /api/v2/storyboard
 *
 * 与 /api/chat 的关键差异：这是激励功能的独立一次性调用，不写会话、
 * 不进对话历史——分镜只为放映服务，不是学习过程的一部分。
 * 降级发生在路由内部（buildStoryboard 保证永远返回合法分镜），
 * 因此本路由对前端的错误只剩"请求本身不合法"一种。
 */

import { Router } from 'express';
import { ValidationError, errorResponse } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { buildStoryboard } from '../agent/storyboard.js';

const router = Router();

const MAX_FRAMES = 8;
const MAX_FRAME_TEXT = 500;
const MAX_TITLE = 20;

function validateGrade(value) {
  const grade = Number(value);
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) {
    throw new ValidationError('grade 必须是 1-6 的整数');
  }
  return grade;
}

function validateFilmTitle(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError('filmTitle 必须是非空字符串');
  }
  if (value.trim().length > MAX_TITLE) {
    throw new ValidationError(`filmTitle 过长，最多 ${MAX_TITLE} 字`);
  }
  return value.trim();
}

function validateFrames(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError('frames 必须是非空数组');
  }
  if (value.length > MAX_FRAMES) {
    throw new ValidationError(`frames 过多，最多 ${MAX_FRAMES} 格`);
  }
  return value.map((frame) => {
    if (typeof frame?.id !== 'string' || frame.id.length === 0) {
      throw new ValidationError('frame.id 必须是非空字符串');
    }
    if (typeof frame?.text !== 'string' || frame.text.trim().length === 0) {
      throw new ValidationError('frame.text 必须是非空字符串');
    }
    if (frame.text.length > MAX_FRAME_TEXT) {
      throw new ValidationError(`frame.text 过长，最多 ${MAX_FRAME_TEXT} 字`);
    }
    return { id: frame.id, text: frame.text };
  });
}

router.post('/', async (req, res) => {
  try {
    const request = {
      grade: validateGrade(req.body?.grade),
      filmTitle: validateFilmTitle(req.body?.filmTitle),
      frames: validateFrames(req.body?.frames),
    };

    const { storyboard, degraded } = await buildStoryboard(request);

    res.json({ ok: true, degraded, storyboard });
  } catch (error) {
    const { status, body } = errorResponse(error);
    if (status >= 500) logger.error('分镜接口异常', { message: error.message });
    res.status(status).json(body);
  }
});

export default router;