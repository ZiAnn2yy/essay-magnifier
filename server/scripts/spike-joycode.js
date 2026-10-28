/**
 * JoyCode 平台能力 spike。
 *
 * 为什么需要它：整个上层建筑——双环可见、引用溯源、suggestions、记忆写回——
 * 全压在"能可靠拿到结构化输出"这一个未验证的假设上。如果 JoyCode 的
 * OpenAI 兼容层不支持 response_format，或者静默忽略它，M2 和 M4 的每项
 * 工作量都要加一半。所以上层怎么盖，取决于这个脚本的输出。
 *
 * 用法（需要先在 server/.env 填好 Key）：
 *   cd server && node --no-warnings scripts/spike-joycode.js
 *
 * 本脚本只打印探测结果，不打印 Key。
 */

import { config } from '../src/config.js';

const TIMEOUT_MS = 30000;

async function rawCall(body) {
  const response = await fetch(config.llm.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({ model: config.llm.model, ...body }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // 保留原文前 200 字，足以判断错误形状
  }

  return { status: response.status, json, raw: json ? null : text.slice(0, 200) };
}

function describe(result) {
  if (result.status !== 200) {
    return { ok: false, detail: `HTTP ${result.status} ${result.raw ?? JSON.stringify(result.json).slice(0, 200)}` };
  }
  const message = result.json?.choices?.[0]?.message;
  if (!message) return { ok: false, detail: '响应缺少 message' };
  return { ok: true, message };
}

async function probe(name, body) {
  const start = Date.now();
  try {
    const result = describe(await rawCall(body));
    return { name, ok: result.ok, ms: Date.now() - start, message: result.message, detail: result.detail };
  } catch (error) {
    return { name, ok: false, ms: Date.now() - start, detail: error.message };
  }
}

const FINAL_ANSWER_TOOL = {
  type: 'function',
  function: {
    name: 'final_answer',
    description: '提交最终回答',
    parameters: {
      type: 'object',
      properties: {
        analysis: { type: 'string', description: '分析环：观察到了什么' },
        steps: { type: 'array', items: { type: 'string' }, description: '求解环：推理步骤' },
        reply: { type: 'string', description: '给学习者的话' },
        citations: { type: 'array', items: { type: 'string' } },
      },
      required: ['analysis', 'steps', 'reply', 'citations'],
    },
  },
};

if (!config.llmReady) {
  console.error('模型未配置：请先在 server/.env 填好 LLM_API_URL / LLM_API_KEY / LLM_MODEL');
  process.exit(2);
}

console.log(`目标: ${config.llm.apiUrl}`);
console.log(`模型: ${config.llm.model}\n`);

const results = [];

// 1. 基本连通
results.push(
  await probe('1 基本连通', {
    messages: [{ role: 'user', content: '回复一个字：好' }],
    max_tokens: 32,
  }),
);

// 2. Function Calling 是否真的吐 tool_calls
results.push(
  await probe('2 工具调用', {
    messages: [{ role: 'user', content: '帮我查一下二元一次方程组的定义' }],
    tools: [
      {
        type: 'function',
        function: {
          name: 'lookup_knowledge',
          description: '检索学科知识库',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
      },
    ],
    max_tokens: 256,
  }),
);

// 3. response_format: json_object 是被支持还是被静默忽略
results.push(
  await probe('3 json_object', {
    messages: [{ role: 'user', content: '用 JSON 返回：{"ok":true}' }],
    response_format: { type: 'json_object' },
    max_tokens: 64,
  }),
);

// 4. 保底方案：用 tool_choice 强制模型把最终答案作为一次工具调用返回。
//    任何支持 Function Calling 的接口都吃这一招。如果这条通，
//    双环可见的成本从"两次模型往返"降到"一次"。
results.push(
  await probe('4 强制结构化输出', {
    messages: [{ role: 'user', content: '3x+6=18，引导学生自己解，不要把答案告诉他' }],
    tools: [FINAL_ANSWER_TOOL],
    tool_choice: { type: 'function', function: { name: 'final_answer' } },
    max_tokens: 512,
  }),
);

// 5. 错误形状：故意用不存在的模型名，看上游怎么报错（决定降级话术与重试判定）
results.push(
  await probe('5 错误形状', {
    model: '__definitely_not_a_model__',
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 8,
  }),
);

// 6. 延迟：真实 prompt 跑三次看 p50（决定前端等待体验与视频节奏）
const latencies = [];
for (let i = 0; i < 3; i += 1) {
  const started = Date.now();
  try {
    await rawCall({
      messages: [{ role: 'user', content: '用一句话解释什么是元一次方程' }],
      max_tokens: 128,
    });
    latencies.push(Date.now() - started);
  } catch (error) {
    latencies.push(-1);
    console.error(`  第 ${i + 1} 次延迟探测失败: ${error.message}`);
  }
}
const good = latencies.filter((ms) => ms > 0).sort((a, b) => a - b);
results.push({
  name: '6 延迟 p50',
  ok: good.length > 0,
  ms: good.length > 0 ? good[Math.floor(good.length / 2)] : -1,
  detail: good.length > 0 ? `三次: ${latencies.join(', ')} ms` : '三次全部失败',
});

console.log('\n===== 探测结果 =====');
for (const item of results) {
  const flag = item.ok ? 'OK  ' : 'FAIL';
  console.log(`  ${flag}  ${item.name.padEnd(18)}  ${String(item.ms).padStart(6)} ms  ${item.detail ?? ''}`);

  if (item.name.startsWith('2') && item.message?.tool_calls?.length) {
    const call = item.message.tool_calls[0];
    console.log(`         -> tool_calls 可用，示例: ${call.function.name}(${call.function.arguments})`);
  }
  if (item.name.startsWith('3') && item.message?.content) {
    console.log(`         -> 返回内容: ${item.message.content.slice(0, 80).replace(/\n/g, ' ')}`);
  }
  if (item.name.startsWith('4') && item.message?.tool_calls?.length) {
    const call = item.message.tool_calls[0];
    console.log(`         -> 结构化参数: ${call.function.arguments.slice(0, 200)}`);
  }
}

console.log('\n===== 结论怎么用 =====');
console.log('  · 探测 2 通过 → 工具链可用，M4 的知识检索能走 Function Calling');
console.log('  · 探测 4 通过 → 双环可见用"强制结构化输出"，一次往返，不要做两次模型调用');
console.log('  · 探测 4 失败 → 只能从散文里拆字段，M2 工期要按评审意见加倍');
console.log('  · 探测 5 的错误形状 → 决定 model/client.js 里哪些状态码值得重试');
console.log('  · 探测 6 的 p50 → 超过 8 秒就必须做分阶段等待提示，否则演示现场很难看');
