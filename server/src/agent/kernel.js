import { config } from '../config.js';
import { chatCompletion } from '../model/client.js';
import { buildSystemPrompt } from './prompts/index.js';
import { executeTool, toWireFormat } from './tools.js';
import { detectCrisis, CRISIS_REPLY } from '../safety/crisis-rules.js';
import { logger } from '../lib/logger.js';

/** 模型未配置或调用失败时的话术。规范§五：不允许前端无限转圈 */
const DEGRADED_REPLY =
  '我现在连接不上思考模块，没法正常陪你分析。请稍后再试一次，' +
  '如果一直这样，可以先找老师或同学讨论，别让题目卡住你。';

/** 拼进上下文的最近消息条数。陪伴式会话会无限增长，必须设上限 */
const RECENT_MESSAGE_LIMIT = 12;

function degradedResult(reason) {
  logger.warn('走降级话术', { reason });
  return {
    text: DEGRADED_REPLY,
    reasoning: [],
    citations: [],
    suggestions: [],
    toolCalls: [],
    degraded: true,
  };
}

/**
 * 组装消息序列。
 *
 * 规范§四.2：用户输入只作为独立的 user 消息，绝不拼进 system prompt 指令区。
 *
 * 说明：危机指令原本也在此处以 system 消息注入，但 respond() 现在对危机直接返回
 * 固定话术、根本不调模型，那段注入就成了不可达代码，故删除。
 * 安全边界并未削弱——system prompt 的 SAFETY 段仍是第二道防线。
 * 待办（M2）：若要让危机回应带上个性化语气，用"模型生成 + 固定话术兜底"，
 * 且固定话术必须是最终保证，不能反过来。
 */
function buildMessages({ history, text }) {
  const messages = [{ role: 'system', content: buildSystemPrompt() }];

  for (const item of history) {
    // 只接受这两种角色，避免历史数据里的脏值进入上游
    if (item.role === 'user' || item.role === 'assistant') {
      messages.push({ role: item.role, content: item.content });
    }
  }

  messages.push({ role: 'user', content: text });
  return messages;
}

/** 单次工具调用：参数解析与执行都有边界，失败作为结果回填而不抛异常 */
async function runToolCall(toolCall) {
  let args = {};
  try {
    args = JSON.parse(toolCall.function.arguments || '{}');
  } catch {
    // 模型偶尔吐出畸形 JSON。这里必须兜住，否则整个请求崩掉
    return {
      tool: toolCall.function.name,
      args: {},
      result: { ok: false, error: '参数解析失败' },
    };
  }

  const result = await executeTool(toolCall.function.name, args);
  return { tool: toolCall.function.name, args, result };
}

/**
 * 智能体主入口。
 *
 * 这是从 dogdog 的 Function Calling 主循环移植而来，并补上三处加固：
 * 超时与重试在 model/client.js；畸形参数与工具异常的边界在本文件。
 *
 * 注意本函数不碰数据库——持久化由路由层负责。
 * 这样内核与存储、与 Web 框架全无耦合，未来的硬件客户端可直接复用。
 *
 * @param {string} text 已校验的学习者输入
 * @param {Array<{role:string, content:string}>} history 最近若干轮对话
 */
export async function respond({ text, history }) {
  const crisis = detectCrisis(text);

  // 危机路径不调模型：规则引擎拥有结论，就必须拥有回应的确定性。
  // 模型偶发不可用是常态，安全关键路径不能押在 LLM 在线上。
  if (crisis.level === 'crisis') {
    logger.warn('命中危机规则，返回固定引导话术', { matched: crisis.matched });
    return {
      text: CRISIS_REPLY,
      reasoning: [],
      citations: [],
      suggestions: [],
      toolCalls: [],
      degraded: false,
      crisis: true,
    };
  }

  if (!config.llmReady) {
    return degradedResult('模型未配置');
  }

  const messages = buildMessages({ history, text });
  const toolCalls = [];
  let reply = '';

  for (let turn = 0; turn < config.maxTurns; turn += 1) {
    const message = await chatCompletion({ messages, tools: toWireFormat() });

    if (!message.tool_calls || message.tool_calls.length === 0) {
      reply = (message.content ?? '').trim();

      // 兜底：模型偶发返回空 content，基于已有工具结果再要一次总结
      if (reply.length === 0 && toolCalls.length > 0) {
        messages.push({
          role: 'system',
          content: '你刚才的回复内容为空。请基于已获取的工具结果，给学习者一个完整、友好的回复。',
        });
        const retry = await chatCompletion({ messages, tools: [] });
        reply = (retry.content ?? '').trim();
      }
      break;
    }

    messages.push(message);

    for (const toolCall of message.tool_calls) {
      const record = await runToolCall(toolCall);
      toolCalls.push(record);
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(record.result),
      });
    }
  }

  if (reply.length === 0) {
    return degradedResult('模型未返回有效内容');
  }

  return {
    text: reply,
    // 待办（M2）：reasoning / citations / suggestions 的结构化来源。
    // 已验证成本最低的做法是用 tool_choice 强制模型把最终答案作为一次工具调用返回，
    // 一次往返即可拿到 {analysis, steps, citations}，不必为"双环可见"做两次模型调用。
    reasoning: [],
    citations: [],
    suggestions: [],
    toolCalls,
    degraded: false,
  };
}

export { RECENT_MESSAGE_LIMIT };
