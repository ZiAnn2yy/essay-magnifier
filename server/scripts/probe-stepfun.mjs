/**
 * 探针：StepFun step-5-preview 现在通不通、思考能不能关。
 *
 * 为什么单独一个脚本：HANDOFF 记的核心难题是"推理模型 reasoning 长度不可预测"，
 * 预算小了正文 0 字、给大了想一万多 token 被截断。今天要试的是**关闭思考的参数**，
 * 那把探测昨晚被叫停。逐档跑，每档报耗时/正文/reasoning/finish，好判断值不值得继续用。
 *
 * 用法：node --no-warnings scripts/probe-stepfun.mjs [variant]
 *   variant: reach | base | effort-low | no-think | thinking-off | all
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, '..', '.env');

// 只解析这一个文件里我们关心的几个键，不引 dotenv（工程没装）
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
);

const endpoint = `${env.LLM_API_URL.replace(/\/$/, '')}/chat/completions`;

const MESSAGES = [
  { role: 'system', content: '你是一位小学语文范文拆解老师。只输出 JSON，不要解释。' },
  {
    role: 'user',
    content: JSON.stringify({
      grade: 4,
      essay:
        '清晨的校园里，我看见一只蜗牛趴在篮球架的底座上。它背着小房子，' +
        '触角伸了又缩，缩了又伸。我等了它很久，它只爬过一枚硬币的距离。' +
        '那天上课铃响了，我第一次觉得，慢也是一种本领。',
    }),
  },
];

const VARIANTS = {
  reach: { label: '连通性（64 token）', body: { max_tokens: 64 } },
  base: { label: '基线（8192，不关思考）', body: { max_tokens: 8192 } },
  'effort-low': { label: 'reasoning_effort=low', body: { max_tokens: 8192, reasoning_effort: 'low' } },
  'no-think': { label: 'enable_thinking=false', body: { max_tokens: 8192, enable_thinking: false } },
  'thinking-off': { label: 'thinking.type=disabled', body: { max_tokens: 8192, thinking: { type: 'disabled' } } },
};

async function run(name) {
  const variant = VARIANTS[name];
  const body = {
    model: env.LLM_MODEL,
    messages: MESSAGES,
    temperature: 1,
    ...variant.body,
  };

  const started = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.LLM_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    });
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const raw = await response.text();

    if (!response.ok) {
      console.log(`[${name}] ${variant.label} → HTTP ${response.status} ${elapsed}s`);
      console.log(`  ${raw.slice(0, 300).replace(/\s+/g, ' ')}`);
      return;
    }

    const data = JSON.parse(raw);
    const message = data.choices?.[0]?.message ?? {};
    const usage = data.usage ?? {};
    const content = typeof message.content === 'string' ? message.content : '';
    console.log(
      `[${name}] ${variant.label} → ${elapsed}s finish=${data.choices?.[0]?.finish_reason} ` +
        `正文=${content.length}字 reasoning=${usage.completion_tokens_details?.reasoning_tokens ?? '?'} ` +
        `completion=${usage.completion_tokens ?? '?'}`,
    );
    console.log(`  正文前 120 字：${content.slice(0, 120).replace(/\s+/g, ' ')}`);
  } catch (error) {
    console.log(`[${name}] ${variant.label} → 失败 ${((Date.now() - started) / 1000).toFixed(1)}s: ${error.message}`);
  }
}

const only = process.argv[2];
const names = only && only !== 'all' ? [only] : ['reach', 'base', 'effort-low', 'no-think', 'thinking-off'];
for (const name of names) await run(name);
