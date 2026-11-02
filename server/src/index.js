import { createApp, config } from './app.js';
import { logger } from './lib/logger.js';

const app = createApp();

// 缺 Key 不阻止启动：骨架期与演示准备期都需要在无 Key 时验证工程能跑。
// 此时 /api/health 正常，/api/chat 走降级话术。
if (!config.llmReady) {
  logger.warn('模型未配置（LLM_API_URL / LLM_API_KEY / LLM_MODEL 有缺失），对话接口将返回降级话术');
}

// 容器硬性规则：必须绑 0.0.0.0，绑 localhost 在容器外不可达。
// 这条和平台无关——DevCloud 和魔搭都要求
app.listen(config.port, '0.0.0.0', () => {
  logger.info('服务已启动', {
    port: config.port,
    env: config.env,
    modelReady: config.llmReady,
  });
});
