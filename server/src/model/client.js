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

async function callOnce({ messages, tools }) {
  const body = {
    model: config.llm.model,
    messages,
    max_tokens: 2048,
    temperature: 0.3,
  };

  if (Array.isArray(tools) && tools.length > 0) {
    body.tools = tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  let response;
  try {
    response = await fetch(config.llm.apiUrl, {
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
export async function chatCompletion({ messages, tools }) {
  let lastError = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    try {
      return await callOnce({ messages, tools });
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
