/**
 * 评测集 runner。
 *
 * 规范§七：先写通过条件，再写用例；通过条件必须可检查，
 * 不写"质量好"这类空话。约 20 个用例，每次改动提示词或模型后都重跑。
 *
 * 当前进度（2026-10-30 知识库扩充 + 超时预算修正后）：
 *   - 离线用例 25 条，全部不依赖模型，无 Key 也能跑
 *   - 在线用例 2 条，需要 LLM_API_KEY，缺 Key 时跳过
 *   - 覆盖四个出口：范文拆解、读者回应、模型调用策略、访问门槛（后者靠手工 curl 验，见 docs）
 *   - `budget-001` 锁两个超时预算与调用点——它是确定性的，
 *     替代了原先靠在线用例赌模型心情的那条会抖的断言
 *
 * 判分一律用确定性断言，不上 model-as-judge——判分越确定，重跑越勤，护栏才真有意义。
 *
 * 用法：node --no-warnings eval/run.js
 */

import { offlineCases } from './cases/offline.js';
import { onlineCases } from './cases/online.js';
import { config } from '../src/config.js';

async function runCase(testCase) {
  if (testCase.requiresKey && !config.llmReady) {
    return { id: testCase.id, status: 'SKIP', detail: '需要模型 Key，已跳过' };
  }
  // 反相闸门：测的是"模型不可用"这条路径，有 Key 时它必然不成立。
  // 没有这道闸门，用例的通过条件就会随环境漂移——同一个用例在有 Key 的机器上必挂。
  if (testCase.skipWhenKey && config.llmReady) {
    return { id: testCase.id, status: 'SKIP', detail: '已配置模型 Key，降级路径不适用，已跳过' };
  }

  try {
    const result = await testCase.run();
    // 用例可以自己说"这次不算"：环境原因导致的失败（典型是模型超时）
    // 与提示词/代码回归不是一回事，混成 FAIL 会训练人忽略红色。
    // 只允许显式声明，且必须带原因——跳过数会在报告里单独列出。
    if (result.skipped) {
      return { id: testCase.id, status: 'SKIP', detail: result.skipReason ?? '用例自行跳过' };
    }
    return {
      id: testCase.id,
      status: result.passed ? 'PASS' : 'FAIL',
      detail: result.detail ?? '',
    };
  } catch (error) {
    return { id: testCase.id, status: 'ERROR', detail: error.message };
  }
}

function report(results) {
  const width = Math.max(...results.map((item) => item.id.length)) + 2;

  for (const item of results) {
    const label = item.status.padEnd(5);
    console.log(`  ${label}  ${item.id.padEnd(width)}  ${item.detail}`);
  }

  const executed = results.filter((item) => item.status !== 'SKIP');
  const passed = executed.filter((item) => item.status === 'PASS').length;

  console.log();
  console.log(
    `通过 ${passed}/${executed.length}` +
      `（跳过 ${results.length - executed.length} 条，未计入）`,
  );

  return executed.length > 0 && passed === executed.length;
}

const allCases = [...offlineCases, ...onlineCases];
const results = [];

for (const testCase of allCases) {
  results.push(await runCase(testCase));
}

const ok = report(results);
console.log(ok ? '\n全部通过。' : '\n存在未通过用例，请先修复。');
process.exit(ok ? 0 : 1);
