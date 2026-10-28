import { Router } from 'express';
import { config } from '../config.js';
import { validateLearnerId, validateText } from '../lib/validate.js';
import { ValidationError, errorResponse } from '../lib/errors.js';
import * as store from '../memory/store.js';
import { respond, RECENT_MESSAGE_LIMIT } from '../agent/kernel.js';
import { logger } from '../lib/logger.js';

const router = Router();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveSessionId(rawSessionId, learnerId) {
  if (rawSessionId === undefined || rawSessionId === null || rawSessionId === '') {
    return store.createSession(learnerId);
  }

  if (typeof rawSessionId !== 'string' || !UUID_PATTERN.test(rawSessionId)) {
    throw new ValidationError('sessionId 格式不正确');
  }

  const session = store.getSession(rawSessionId);
  // 会话不存在或不属于这个学习者，都当不存在处理，避免越权读到别人的会话
  if (!session || session.learner_id !== learnerId) {
    throw new ValidationError('会话不存在或不属于当前学习者');
  }
  return session.id;
}

router.post('/', async (req, res) => {
  try {
    const learnerId = validateLearnerId(req.body?.learnerId);
    const text = validateText(req.body?.text, config.maxInputLength);
    const sessionId = resolveSessionId(req.body?.sessionId, learnerId);

    store.touchLearner(learnerId);
    const history = store.getRecentMessages(sessionId, RECENT_MESSAGE_LIMIT);

    const result = await respond({ text, history });

    store.appendMessage(sessionId, 'user', text);
    store.appendMessage(sessionId, 'assistant', result.text);

    res.json({
      ok: true,
      sessionId,
      text: result.text,
      reasoning: result.reasoning,
      citations: result.citations,
      suggestions: result.suggestions,
      degraded: result.degraded,
    });
  } catch (error) {
    const { status, body } = errorResponse(error);
    if (status >= 500) logger.error('对话接口异常', { message: error.message });
    res.status(status).json(body);
  }
});

export default router;
