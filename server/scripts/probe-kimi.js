/**
 * Kimi 能力探测：这个 Key 到底能干什么。
 *
 * 为什么需要它：整个"激励"方向押在"能把作文变成动画/绘本/漫画"上。
 * 如果 Kimi 只能出文本，那第二页的多模态就得全走代码渲染，
 * 三个视觉方向的设计前提要重新评估。所以先探清楚，再决定第二页怎么盖。
 *
 * 用法：
 *   cd server && node --no-warnings scripts/probe-kimi.js
 *
 * 本脚本**不打印 Key**，只打印每个端点的状态与响应摘要。
 */

import { config } from '../src/config.js';

const KEY = config.llm.apiKey;
const TIMEOUT_MS = 45000;

const BASES = [
  'https://api.moonshot.cn/v1',
  'https://api.moonshot.ai/v1',
];

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function tryFetch(url, options = {}) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started,
      body: text.slice(0, 600),
    };
  } catch (error) {
    return { ok: false, status: 0, ms: Date.now() - started, body: `!! ${error.message}` };
  }
}

function line(label, result) {
  const flag = result.ok ? '✓' : '✗';
  console.log(`  ${flag} ${label.padEnd(38)} HTTP ${String(result.status).padEnd(4)} ${result.ms}ms`);
  if (!result.ok && result.body) {
    console.log(`      ${result.body.replace(/\s+/g, ' ').slice(0, 220)}`);
  }
}

async function main() {
  if (!KEY) {
    console.error('没有读到 LLM_API_KEY。先在 server/.env 填好。');
    process.exit(1);
  }

  console.log(`\n探测目标：${BASES.join('  +  ')}`);
  console.log(`模型配置：${config.llm.model}\n`);

  /* ---------- 1. 列出可用模型 ---------- */
  console.log('一、模型列表（确认 Key 有效 + 有哪些模型）');
  for (const base of BASES) {
    const result = await tryFetch(`${base}/models`, { headers: authHeaders() });
    line(`GET /models  ${base}`, result);
    if (result.ok) {
      try {
        const data = JSON.parse(result.body.length < 600 ? result.body : '{}');
        const ids = (data.data ?? []).map((m) => m.id);
        if (ids.length > 0) console.log(`      ${ids.join(', ')}`);
      } catch {
        /* 响应被截断，忽略 */
      }
    }
  }

  /* ---------- 2. 文本对话 ---------- */
  console.log('\n二、文本对话（OpenAI 兼容 chat completions）');
  for (const base of BASES) {
    const result = await tryFetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model: config.llm.model,
        messages: [{ role: 'user', content: '回复"ok"两个字就行' }],
        max_tokens: 16,
      }),
    });
    line(`POST /chat/completions  ${base}`, result);
    if (result.ok) {
      try {
        const data = JSON.parse(result.body);
        console.log(`      回复：${data.choices?.[0]?.message?.content ?? '（无内容）'}`);
      } catch {
        /* 忽略 */
      }
    }
  }

  /* ---------- 3. 生图 ---------- */
  console.log('\n三、生图（决定"绘本/漫画"是走 API 还是走代码渲染）');
  for (const base of BASES) {
    const result = await tryFetch(`${base}/images/generations`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model: 'kimi-image',
        prompt: '一只橘猫坐在窗台上，儿童绘本风格',
        n: 1,
      }),
    });
    line(`POST /images/generations  ${base}`, result);
  }

  /* ---------- 4. 生视频 ---------- */
  console.log('\n四、生视频（决定"动画"是走 API 还是走代码渲染）');
  const videoEndpoints = [
    ['/videos/generations', { model: 'kimi-video', prompt: '阳光照进爷爷的工坊', duration: 5 }],
    ['/video/generations', { model: 'kimi-video', prompt: '阳光照进爷爷的工坊' }],
    ['/video/generate', { prompt: '阳光照进爷爷的工坊' }],
  ];
  for (const base of BASES) {
    for (const [path, payload] of videoEndpoints) {
      const result = await tryFetch(`${base}${path}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      line(`POST ${path}  ${base}`, result);
    }
  }

  /* ---------- 5. 音频 ---------- */
  console.log('\n五、语音合成（第二页"读给他们听"可能用到）');
  for (const base of BASES) {
    const result = await tryFetch(`${base}/audio/speech`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'alloy',
        input: '阳光从唯一那扇窗户照进来。',
      }),
    });
    line(`POST /audio/speech  ${base}`, result);
  }

  console.log('\n探测结束。\n');
}

main();
