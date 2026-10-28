import { Router } from 'express';
import * as store from '../memory/store.js';
import { errorResponse } from '../lib/errors.js';

const router = Router();

// 建档不收集任何个人信息。规范§〇红线一：学习者标识由服务端随机生成。
router.post('/', (_req, res) => {
  const learnerId = store.createLearner();
  res.status(201).json({ ok: true, learnerId });
});

router.get('/:learnerId', (req, res) => {
  try {
    const learner = store.getLearner(req.params.learnerId);
    if (!learner) {
      res.status(404).json({ ok: false, code: 'not_found', message: '学习者不存在' });
      return;
    }

    res.json({
      ok: true,
      learner: {
        id: learner.id,
        createdAt: learner.created_at,
        lastActiveAt: learner.last_active_at,
      },
      mastery: store.listMastery(learner.id),
    });
  } catch (error) {
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  }
});

export default router;
