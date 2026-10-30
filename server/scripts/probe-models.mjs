/**
 * 模型发现 + 真实任务基准。
 *
 * 背景：2026-10-29 实测这把 StepFun key 只有 step-5-preview 能用（其余全 404，
 * GET /v1/models 返 401）。但 10-30 平台上出现了新模型——Step 3.7 Flash
 * （三档推理强度 low/medium/high）和 Step 3.5 Flash 2603（Agent 优化、
 * 支持低推理模式）。这两个特性和我们的用法正对得上，值得重新探一遍。
 *
 * 两段式：先用极小请求探哪些模型 ID 真的能用（便宜），再对能用的跑**真实拆解任务**
 * （同一个 prompt、同一篇范文、同一个 max_tokens），报耗时和招式数。
 * 只用小请求探活是不够的——探针那次就量出过 6.8s vs 15.1s 的假差异，
 * 真正说明问题的只有真实任务上的对比。
 *
 * 用法：node --no-warnings scripts/probe-models.mjs
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const env = Object.fromEntries(
  readFileSync(path.join(here, '..', '.env'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
);

const base = env.LLM_API_URL.replace(/\/$/, '');
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` };

/** 候选模型 ID。大小写和连字符的几种写法都试，平台的命名不总是一致的。 */
const CANDIDATES = [
  'step-3.7-flash',
  'step-3-7-flash',
  'step-3.7',
  'step-3.5-flash',
  'step-3-5-flash',
  'step-3.5-flash-2603',
  'step-3-5-flash-2603',
  'step-5-preview',
];

// ---- 第一段：探活 ----
console.log('== 1. GET /v1/models ==');
try {
  const response = await fetch(`${base}/models`, { headers });
  console.log(`  HTTP ${response.status}`);
  if (response.ok) {
    const data = await response.json();
    const ids = (data.data ?? []).map((item) => item.id);
    console.log(`  可用 ${ids.length} 个：${ids.join(', ')}`);
  } else {
    console.log(`  ${(await response.text()).slice(0, 160).replace(/\s+/g, ' ')}`);
  }
} catch (error) {
  console.log(`  失败: ${error.message}`);
}

console.log('\n== 2. 逐个探活（64 token，只看通不通） ==');
const alive = [];
for (const model of CANDIDATES) {
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '说"ok"两个字' }],
        max_tokens: 64,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (response.ok) {
      console.log(`  ok    ${model}`);
      alive.push(model);
    } else {
      const detail = (await response.text()).slice(0, 90).replace(/\s+/g, ' ');
      console.log(`  ${response.status}   ${model}  ${detail}`);
    }
  } catch (error) {
    console.log(`  ERR   ${model}  ${error.message}`);
  }
}

if (alive.length === 0) {
  console.log('\n没有可用模型，结束。');
  process.exit(0);
}

// ---- 第二段：真实任务 ----
const { buildAnalyzerPrompt } = await import('../src/agent/prompts/index.js');
const { lookupForAnalysis, renderStandards } = await import('../src/agent/standards.js');
const { isValidAnalysis } = await import('../src/agent/analyze.js');

const ESSAY =
  '爸爸的手很大，掌心有好几条硬硬的茧。\n' +
  '我的自行车链条掉了，他蹲下来，先把手在裤子上擦了两下，然后用两根手指捏住链条，' +
  '一下一下往齿轮上送。油污爬上他的指缝，他没有皱眉。\n' +
  '那天晚上，我看见他坐在灯下，用一块抹布慢慢擦自己的手。那箱子旧旧的，' +
  '打开的时候，会有一股铁锈和机油混在一起的味道。\n' +
  '现在我自己会修车了。可我还是会闻一下那个箱子的味道。';

const standards = lookupForAnalysis(4, '写人');
const prompt = buildAnalyzerPrompt(4, { standardsText: renderStandards(standards), topic: '写人' });

console.log(`\n== 3. 真实拆解任务（prompt ${prompt.length} 字，各跑 2 轮） ==`);
console.log('   指标：耗时 / 正文长度 / 招式数 / 是否通过逐字校验\n');

async function realTask(model, effort) {
  const body = {
    model,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: JSON.stringify({ grade: 4, essay: ESSAY }) },
    ],
    max_tokens: 8192,
    temperature: 1,
  };
  if (effort) body.reasoning_effort = effort;

  const started = Date.now();
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    });
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    if (!response.ok) {
      console.log(`  HTTP ${response.status} ${elapsed}s  ${(await response.text()).slice(0, 120).replace(/\s+/g, ' ')}`);
      return;
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    let moves = -1;
    let valid = 'JSON 解析失败';
    try {
      const parsed = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
      moves = parsed.moves?.length ?? 0;
      const problem = isValidAnalysis(parsed, ESSAY);
      valid = problem ?? '通过';
    } catch {
      /* 保持 -1 */
    }
    console.log(
      `  ${elapsed.padStart(5)}s  正文 ${String(content.length).padStart(4)} 字  ` +
        `招式 ${String(moves).padStart(2)}  校验：${valid}  [${model}${effort ? ' effort=' + effort : ''}]`,
    );
  } catch (error) {
    console.log(`  失败 ${((Date.now() - started) / 1000).toFixed(1)}s: ${error.message}  [${model}]`);
  }
}

for (const model of alive) {
  // 3.7 Flash 明确支持三档推理强度，所以 low 和 medium 都试；
  // 其余模型只试 low（不传就是它自己的默认档）
  const efforts = model.includes('3.7') ? ['low', 'medium'] : ['low'];
  for (const effort of efforts) {
    await realTask(model, effort);
    await realTask(model, effort);
  }
}
