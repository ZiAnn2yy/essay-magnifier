/**
 * 诊断额度问题：402 是整把 key 没了，还是只针对某些模型。
 *
 * 用户说"我的 Credit 账户是有用量的"，而 API 返回
 * `402 quota_exceeded / You exceeded your current quota`。
 * 这两件事要对上，只有几种可能：
 *   1. 这把 key 属于另一个账户（不是有 Credit 那个）
 *   2. 额度按模型/产品分开计——新模型（3.7-flash）要付费套餐，Credit 只覆盖老模型
 *   3. Credit 是赠送额度，和充值余额是两套，API 报的是其中一套空了
 *   4. Credit 已过期或未激活
 *
 * 1 和 4 我在本地查不了（要登录控制台）。**2 和 3 能测**：用极小请求逐个打模型，
 * 看 402 是全部模型都返回，还是只有一部分。这个区别直接决定用户该去哪儿点。
 *
 * 用法：node --no-warnings scripts/diagnose-quota.mjs
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

/** 逐个模型打一次极小请求。只看状态码，不看内容。 */
const MODELS = ['step-3.7-flash', 'step-3.5-flash', 'step-3.5-flash-2603', 'step-5-preview'];

console.log('== 逐个模型探额度（64 token 的极小请求） ==\n');

const results = [];
for (const model of MODELS) {
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '说 ok' }],
        max_tokens: 64,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();
    let message = '';
    try {
      message = JSON.parse(text)?.error?.message ?? '';
    } catch {
      message = text.slice(0, 120);
    }
    results.push({ model, status: response.status, message });
    const mark = response.ok ? '可用' : `${response.status}`;
    console.log(`  ${mark.padEnd(6)} ${model.padEnd(22)} ${message.slice(0, 110)}`);
  } catch (error) {
    results.push({ model, status: 0, message: error.message });
    console.log(`  网络错 ${model.padEnd(22)} ${error.message}`);
  }
}

const ok = results.filter((item) => item.status === 200);
const quota = results.filter((item) => item.status === 402);
const notFound = results.filter((item) => item.status === 404);

console.log('\n== 结论 ==');
if (quota.length === 0 && ok.length > 0) {
  console.log('  额度已恢复，可以直接重跑预处理。');
} else if (ok.length > 0 && quota.length > 0) {
  console.log('  **额度是按模型/产品分开计的。**');
  console.log(`  可用：${ok.map((i) => i.model).join('、')}`);
  console.log(`  402：${quota.map((i) => i.model).join('、')}`);
  console.log('  → 说明有额度，但覆盖不到上面那些模型。去控制台看 Credit 的适用范围。');
} else if (quota.length === results.length) {
  console.log('  **所有模型都返回 402，是账户层面的额度问题**，不是模型权限问题。');
  console.log('  → 两种可能：这把 key 不是有 Credit 的那个账户；或者 Credit 已过期/未激活。');
  console.log('  → 去 StepFun 控制台确认：① 这把 key 属于哪个账户 ② Credit 的状态和有效期');
} else {
  console.log('  状态不明显，把上面的原始输出发给用户判断。');
}

if (notFound.length > 0) {
  console.log(`\n  另：${notFound.map((i) => i.model).join('、')} 返回 404（这把 key 无权限或无此模型）。`);
}
