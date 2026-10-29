import dotenv from 'dotenv';

dotenv.config();

/**
 * 读取正整数配置。
 * 配置写错时回退默认值而不是让服务起不来——比赛期间服务挂掉的代价远高于用错一个参数。
 */
function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function readStr(name, fallback = '') {
  const raw = process.env[name];
  return raw === undefined ? fallback : raw.trim();
}

const llm = {
  apiUrl: readStr('LLM_API_URL'),
  apiKey: readStr('LLM_API_KEY'),
  model: readStr('LLM_MODEL'),
  // 当前模型只接受 temperature=1；做成可配置，换模型时不必改代码
  temperature: Number(readStr('LLM_TEMPERATURE', '1')) || 1,
};

export const config = {
  port: readInt('PORT', 3000),
  env: readStr('NODE_ENV', 'development'),

  llm,

  // 三者缺一就视为未配置：此时服务照常启动，/api/health 可用，
  // /api/chat 直接走降级话术，不发起任何上游请求。
  llmReady: Boolean(llm.apiUrl && llm.apiKey && llm.model),

  timeoutMs: readInt('LLM_TIMEOUT_MS', 30000),
  maxRetries: readInt('LLM_MAX_RETRIES', 2),
  maxTurns: readInt('AGENT_MAX_TURNS', 8),

  // 规范§四.2：用户输入必须限长，超长直接拒绝而不是截断了事
  maxInputLength: readInt('MAX_INPUT_LENGTH', 500),
};
