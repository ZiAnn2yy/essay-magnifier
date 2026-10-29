import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { errorResponse } from './lib/errors.js';
import { logger } from './lib/logger.js';
import chatRouter from './routes/chat.js';
import learnerRouter from './routes/learner.js';
import storyboardRouter from './routes/storyboard.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/** 接口契约版本。能力协商见 docs/contract.md；v2 新增绘本分镜端点 */
const CONTRACT_VERSION = 'v2';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  // 能力声明：客户端必须先协商再决定发什么，不得假设服务端支持某种模态。
  // 本期只实现纯文本；audioUrl 字段已预留但未实现，因此不出现在 input 列表里。
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      contract: CONTRACT_VERSION,
      modalities: { input: ['text'], output: ['text'] },
    });
  });

  app.use('/api/chat', chatRouter);
  app.use('/api/learner', learnerRouter);
  app.use('/api/v2/storyboard', storyboardRouter);

  // ===== 生产模式：托管前端构建产物 =====
  // 与 dogdog 同构：单个服务同时提供 API 与页面，避免再开一个端口和一层 CORS
  const distPath = path.join(currentDir, '../../client/dist');
  app.use(express.static(distPath));

  // SPA fallback：非 /api 路径统一返回 index.html
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  // 统一错误出口：只暴露显式标注可外泄的消息，其余一律通用文案
  app.use((error, _req, res, _next) => {
    logger.error('未捕获异常', { message: error.message, stack: error.stack });
    const { status, body } = errorResponse(error);
    res.status(status).json(body);
  });

  return app;
}

export { CONTRACT_VERSION, config };