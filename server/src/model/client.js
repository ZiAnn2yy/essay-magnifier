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

async function callOnce({ messages, tools, toolChoice, maxTokens = DEFAULT_MAX_TOKENS }) {
  const body = {
    model: config.llm.model,
    messages,
    max_tokens: maxTokens,
    temperature: config.llm.temperature,
  };

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
      // 规范§五：每次调用设置超时，不允许前端无限转圈
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    // 网络失败与超时都在这里汇合，统一按可重试处理
    return Promise.reject(upstreamError(`请求模型失败: ${error.message}`, true));
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
 */
export async function chatCompletion({ messages, tools, toolChoice, maxTokens }) {
  let lastError = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    try {
      return await callOnce({ messages, tools, toolChoice, maxTokens });
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
