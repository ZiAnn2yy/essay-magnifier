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
  // 思考强度。2026-10-30 实测（server/scripts/probe-stepfun.mjs）：
  //   step-5-preview 不传      15.1s  finish=stop  正文 2393 字
  //   reasoning_effort=low      6.8s  finish=stop  正文  605 字
  // 这是"推理模型 reasoning 长度不可预测"那条难题的解法——不是加大预算
  // 去赌它想多久，而是让它少想。**默认 low**：拆解是孩子点一下就要等的事，
  // 44 秒的拆解没有人能等。留空则不传这个参数（换不接受它的模型时用）。
  reasoningEffort: readStr('LLM_REASONING_EFFORT', 'low'),
};

export const config = {
  port: readInt('PORT', 3000),
  env: readStr('NODE_ENV', 'development'),

  llm,

  // 三者缺一就视为未配置：此时服务照常启动，/api/health 可用，
  // /api/chat 直接走降级话术，不发起任何上游请求。
  llmReady: Boolean(llm.apiUrl && llm.apiKey && llm.model),

  // 单次模型调用的兜底超时。两个真实任务都自己覆盖（analyze.js 的
  // ANALYZER_TIMEOUT_MS、reader.js 的 READER_TIMEOUT_MS，都是 90 秒），
  // 所以这个值只是"忘了覆盖时的地板"。
  // 30000 是骨架期的值，对推理模型不够：实测读者回应 6 次里
  // 4.2/9.3/30.6/31.4/40.8/60+ 秒，中位数就在 31 秒——
  // 30 秒会砍掉其中一半，孩子收到的是"模型没有连上"的兜底话术。
  // 部署时即使忘了在环境变量里填 LLM_TIMEOUT_MS，也不该因此冤杀调用。
  timeoutMs: readInt('LLM_TIMEOUT_MS', 60000),
  maxRetries: readInt('LLM_MAX_RETRIES', 2),
  maxTurns: readInt('AGENT_MAX_TURNS', 8),

  // 规范§四.2：用户输入必须限长，超长直接拒绝而不是截断了事
  maxInputLength: readInt('MAX_INPUT_LENGTH', 500),

  // 范文正文的上限。一篇 3-6 年级记叙文 400-600 字，留到 2000 是给"粘贴一篇长文"用的。
  // 与 maxInputLength 分开：后者管对话轮次（要短），前者管整篇文本（要长）。
  maxEssayLength: readInt('MAX_ESSAY_LENGTH', 2000),

  // 访问门槛：设了就要求输入这个密码才能用（页面和 API 一起挡）。
  // 留空 = 不设门槛，本地开发和录屏走这条。
  // 值只从环境变量来，**不写进代码**——提交历史属于作品内容，见规范§〇红线一。
  accessCode: readStr('ACCESS_CODE'),
};
