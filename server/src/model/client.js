import { config } from '../config.js';
import { logger } from '../lib/logger.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 构造上游错误。
 * 不用自定义错误类——这里只需要"消息 + 是否值得重试"两个信息，
 * 加一层类层级是仪式。retryable 由调用方按 HTTP 状态码判定。
 */
function upstreamError(message, retryable) {
  const error = new Error(message);
  error.name = 'UpstreamError';
  error.retryable = retryable;
  return error;
}

/**
 * 默认 max_tokens。
 *
 * 2048 是骨架期的值，对**推理模型不够**：实测 kimi-k2.6 跑绘本导演时
 * `reasoning_tokens` 吃掉 2047/2048，正文 0 字、finish_reason=length，
 * 上层只能走降级。所以调用方可以按需传 maxTokens，导演这类任务传 8192。
 */
const DEFAULT_MAX_TOKENS = 2048;

async function callOnce({ messages, tools, toolChoice, maxTokens = DEFAULT_MAX_TOKENS, timeoutMs }) {
  const body = {
    model: config.llm.model,
    messages,
    max_tokens: maxTokens,
    temperature: config.llm.temperature,
  };

  // 思考强度。见 config.js 里那组实测数字：同一个真实拆解任务下
  // 不传 45.9s/49.3s，low 36.1s/32.3s——稳定快四分之一，不是探针暗示的 2.2 倍
  // （那个数主要是输出长短造成的）。只在配了的时候传——不是所有上游都认识
  // 这个参数，而"传了被忽略"和"传了报错"是两种完全不同的故障。
  if (config.llm.reasoningEffort) {
    body.reasoning_effort = config.llm.reasoningEffort;
  }

  if (Array.isArray(tools) && tools.length > 0) {
    // tools 由调用方按线上协议形状传入（唯一整形点是 agent/tools.js 的 toWireFormat）。
    // 这里不再二次包装：曾在这里又 map 一层、读 tool.name，而传入的已经是
    // {type:'function', function:{...}}，于是 name 变成 undefined，
    // 上游直接报 "function name is invalid"。这个 bug 由评测集抓出来——
    // 之前没有 .env，llmReady 恒为 false，降级路径把它遮住了。
    body.tools = tools;

    // 注：推理模型的 thinking 模式不兼容 tool_choice: specified，强制工具调用不可用。
    // 见 agent/kernel.js 的调用处。这里保留给需要它的调用方。
    if (toolChoice) {
      body.tool_choice = { type: 'function', function: { name: toolChoice } };
    }
  }

  let response;
  try {
    // OpenAI 兼容协议的聊天端点是 {base}/chat/completions。
    // 允许 LLM_API_URL 只填到 /v1 为止（常见写法），这里统一补全后缀。
    const endpoint = config.llm.apiUrl.endsWith('/chat/completions')
      ? config.llm.apiUrl
      : `${config.llm.apiUrl.replace(/\/$/, '')}/chat/completions`;

    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify(body),
      // 规范§五：每次调用设置超时，不允许前端无限转圈。
      // 调用方按任务覆盖：拆解 90 秒（ANALYZER_TIMEOUT_MS）、读者回应 90 秒
      // （READER_TIMEOUT_MS）——实测两者中位数都在 31 秒左右、长尾到 60 秒以上，
      // 输出长短不决定耗时，推理长度才决定。用同一个短预算必然有一个被冤杀。
      // **新增任务时记得覆盖**，别吃 config.timeoutMs 那个地板值。
      signal: AbortSignal.timeout(timeoutMs ?? config.timeoutMs),
    });
  } catch (error) {
    // 超时**不重试**。这不是保守，是算过账的：当前模型一次调用实测中位数 31 秒、
    // 长尾 60 秒以上，而重试意味着孩子先等满一轮、再等第二轮，
    // 实测把 45 秒的拆解拖成 113 秒。宁可这次就降级、把"再试一次"的按钮
    // 还给孩子按，也不让他干等两轮。
    // 网络错误和 5xx/429 仍然重试：那些失败得快，重试几乎不增加等待。
    const retryable = error?.name !== 'TimeoutError' && error?.name !== 'AbortError';
    return Promise.reject(upstreamError(`请求模型失败: ${error.message}`, retryable));
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // 5xx 与限流值得重试；其余 4xx 是请求本身的问题，重试无意义
    const retryable = response.status >= 500 || response.status === 429;
    return Promise.reject(
      upstreamError(`上游返回 ${response.status}: ${detail.slice(0, 200)}`, retryable),
    );
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message;
  if (!message) {
    return Promise.reject(upstreamError('上游响应缺少 message 字段', false));
  }
  return message;
}

/**
 * 调用模型，带超时与最多 maxRetries 次重试。
 * 全部失败后抛出，由上层决定怎么降级——这里不吞错误。
 *
 * @param {Object} options
 * @param {number} [options.timeoutMs] 单次超时，覆盖全局配置
 */
export async function chatCompletion({ messages, tools, toolChoice, maxTokens, timeoutMs }) {
  let lastError = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    try {
      return await callOnce({ messages, tools, toolChoice, maxTokens, timeoutMs });
    } catch (error) {
      lastError = error;
      if (error.retryable !== true) break;

      logger.warn('模型调用失败，准备重试', {
        attempt: attempt + 1,
        maxRetries: config.maxRetries,
        reason: error.message,
      });

      if (attempt < config.maxRetries) {
        await sleep(300 * (attempt + 1));
      }
    }
  }

  throw lastError ?? upstreamError('模型调用失败: 未知原因', false);
}
