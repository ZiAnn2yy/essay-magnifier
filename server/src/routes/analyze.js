/**
 * 范文拆解路由：POST /api/v3/analyze
 *
 * 与 /api/chat 的关键差异：这是一次性旁路调用，不写会话、不进对话历史——
 * 拆解是"看清这一篇"的动作，不是一段对话。
 * 降级发生在 agent 层（buildAnalysis 保证永远返回合法结果），
 * 因此本路由对前端的错误只剩"请求本身不合法"一种。
 *
 * 与分镜路由的另一个差异：**grade 只接受 3-6**。
 * 1-2 年级不做——识字量读不完一篇范文，且课标第一学段的要求是"乐于运用词语"，
 * 不是篇章质量。入口就按 3-6 收窄，见 client/src/data/writingBands.js。
 */

import { Router } from 'express';
import { ValidationError, errorResponse } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';
import { validateText } from '../lib/validate.js';
import { buildAnalysis } from '../agent/analyze.js';

const router = Router();

const MIN_GRADE = 3;
const MAX_GRADE = 6;
const MAX_TITLE = 40;
const MAX_COLLECTED = 999;

function validateGrade(value) {
  const grade = Number(value);
  if (!Number.isInteger(grade) || grade < MIN_GRADE || grade > MAX_GRADE) {
    throw new ValidationError(`grade 必须是 ${MIN_GRADE}-${MAX_GRADE} 的整数`);
  }
  return grade;
}

/** 收藏册里已有的招数。支架撤除的依据：册子越厚，这一篇越少直接标好。 */
function validateCollectedCount(value) {
  if (value === undefined || value === null) return 0;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0 || count > MAX_COLLECTED) {
    throw new ValidationError(`collectedCount 必须是 0-${MAX_COLLECTED} 的整数`);
  }
  return count;
}

function validateEssay(value) {
  // 超长直接拒绝，不截断了事——截断会拆出半篇文章，孩子看到的是残缺的范文
  return validateText(value, 'essayText', config.maxEssayLength);
}

function validateTitle(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new ValidationError('title 必须是字符串');
  }
  if (value.trim().length > MAX_TITLE) {
    throw new ValidationError(`title 过长，最多 ${MAX_TITLE} 字`);
  }
  return value.trim();
}

router.post('/', async (req, res) => {
  try {
    const request = {
      grade: validateGrade(req.body?.grade),
      essayText: validateEssay(req.body?.essayText),
      title: validateTitle(req.body?.title),
      collectedCount: validateCollectedCount(req.body?.collectedCount),
    };

    const result = await buildAnalysis(request);

    res.json({
      ok: true,
      degraded: result.degraded,
      crisis: result.crisis,
      analysis: result.analysis,
      // 自纠错用了几轮。1 = 一次通过；2 = 第一次被拒、带原因重试后通过。
      // 给前端和评测看：这个数字是"agent 真的在自我修正"的证据。
      attempts: result.attempts,
      // 只在命中危机时出现：前端展示这段固定话术，不展示任何拆解结果
      ...(result.crisis ? { crisisReply: result.crisisReply } : {}),
    });
  } catch (error) {
    const { status, body } = errorResponse(error);
    if (status >= 500) logger.error('拆解接口异常', { message: error.message });
    res.status(status).json(body);
  }
});

export default router;
