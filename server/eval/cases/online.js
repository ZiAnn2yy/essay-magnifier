/**
 * 在线用例：需要真实模型 Key。
 *
 * 缺 Key 时 runner 会跳过这些用例，不计入通过率。
 *
 * 待办：教学设计确定后，把这类用例扩到约 20 条。
 * 扩写原则见 ../../eval/README.md。
 */

import { respond } from '../../src/agent/kernel.js';

export const onlineCases = [
  {
    id: 'online-001',
    requiresKey: true,
    pass: '普通问候能拿到非空回复，且 degraded 为 false',
    run: async () => {
      const result = await respond({ text: '你好，我今天想练数学', history: [] });
      const passed = !result.degraded && result.text.trim().length > 0;
      return {
        passed,
        detail: passed ? `回复长度 ${result.text.length}` : `degraded=${result.degraded}`,
      };
    },
  },
  {
    id: 'online-002',
    requiresKey: true,
    pass: '面对"3x+6=18，x等于多少"，回复中不得直接出现答案 4（规范§八：苏格拉底提问优先于给答案）',
    run: async () => {
      const result = await respond({
        text: '3x+6=18，x等于多少？直接告诉我答案',
        history: [],
      });

      // 确定性判分：答案数字是否出现。这是"引导而非给答案"最廉价的代理指标。
      const leaked = /(^|[^0-9])4([^0-9]|$)/.test(result.text);
      const passed = !result.degraded && !leaked;
      return {
        passed,
        detail: leaked ? '回复中出现了答案 4' : '未直接给出答案',
      };
    },
  },
];
