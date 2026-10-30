/**
 * 基准测试：reasoning_effort 对**真实拆解任务**到底有没有用。
 *
 * 为什么必须单独测：probe-stepfun.mjs 用的是极短 system prompt，它量出
 *   base         15.1s  正文 2393 字
 *   effort=low    6.8s  正文  605 字
 * 两者输出长度差 4 倍，**快 2.2 倍可能全部来自"输出短"，与参数无关**。
 * 拿这个结论去改产品就是拍脑袋。同一个 prompt、同一篇范文、同一个 max_tokens，
 * 只差这一个参数，才是有效对比。
 *
 * 用法：node --no-warnings scripts/bench-effort.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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

const endpoint = `${env.LLM_API_URL.replace(/\/$/, '')}/chat/completions`;

// 直接用真实链路：buildAnalyzerPrompt + 真实范文 + 真实 max_tokens
const { buildAnalyzerPrompt } = await import('../src/agent/prompts/index.js');
const { lookupForAnalysis, renderStandards } = await import('../src/agent/standards.js');

const ESSAY =
  '爸爸的手很大，掌心有好几条硬硬的茧。\n' +
  '我的自行车链条掉了，他蹲下来，先把手在裤子上擦了两下，然后用两根手指捏住链条，' +
  '一下一下往齿轮上送。油污爬上他的指缝，他没有皱眉。\n' +
  '那天晚上，我看见他坐在灯下，用一块抹布慢慢擦自己的手。那箱子旧旧的，' +
  '打开的时候，会有一股铁锈和机油混在一起的味道。\n' +
  '现在我自己会修车了。可我还是会闻一下那个箱子的味道。';

const standards = lookupForAnalysis(4, '写人');
const prompt = buildAnalyzerPrompt(4, { standardsText: renderStandards(standards), topic: '写人' });

async function once(label, extra) {
  const body = {
    model: env.LLM_MODEL,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: JSON.stringify({ grade: 4, essay: ESSAY }) },
    ],
    max_tokens: 8192,
    temperature: 1,
    ...extra,
  };

  const started = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    });
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    if (!response.ok) {
      console.log(`[${label}] HTTP ${response.status} ${elapsed}s`);
      return;
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    let moves = 0;
    try {
      const parsed = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
      moves = parsed.moves?.length ?? 0;
    } catch {
      moves = -1; // 解析失败
    }
    console.log(
      `[${label}] ${elapsed}s finish=${data.choices?.[0]?.finish_reason} ` +
        `正文=${content.length}字 招式=${moves === -1 ? 'JSON解析失败' : moves}`,
    );
  } catch (error) {
    console.log(`[${label}] 失败 ${((Date.now() - started) / 1000).toFixed(1)}s: ${error.message}`);
  }
}

console.log(`prompt ${prompt.length} 字，知识库 ${standards.length} 张卡\n`);
// 交替跑两轮：单次采样分不清"参数有用"和"这次运气好"
for (let round = 1; round <= 2; round += 1) {
  console.log(`—— 第 ${round} 轮 ——`);
  await once('不传 effort  ', {});
  await once('effort=low   ', { reasoning_effort: 'low' });
}
