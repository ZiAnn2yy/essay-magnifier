/**
 * 在线用例：需要真实模型 Key。
 *
 * 缺 Key 时 runner 会跳过这些用例，不计入通过率。
 *
 * 2026-10-29 方向转向后只剩两条，都挂在真正在用的链路上：
 * 拆解（analyze）与读者回应（reader）。
 * 原先测学伴对话的两条已随 /api/chat 一起删除。
 */

import { buildAnalysis } from '../../src/agent/analyze.js';
import { buildReaderReply } from '../../src/agent/reader.js';

const ESSAY =
  '我们家房子后面有一间小工坊，是爷爷的。一推门进去，全是木头和旧茶的味道。\n' +
  '阳光从唯一那扇窗户照进来，落在爷爷粗糙的手背上。他刨木头的时候，刨花一片一片卷起来，像卷起的信纸。\n' +
  '我把刨花扫成一堆，跳进去。刨花凉凉的，从我的领口滑下去。\n' +
  '那天回家的时候，我的衣服上全是木头的香味。';

const CHILD_TEXT = '爷爷切苹果的时候，一刀一刀下去，皮连成一条垂下来，像一根红绳子。';

export const onlineCases = [
  {
    id: 'online-001',
    requiresKey: true,
    pass: '真实模型能拆出一篇范文：返回合法结果、招式非空、未走降级',
    run: async () => {
      const result = await buildAnalysis({ grade: 4, essayText: ESSAY, title: '爷爷的木工房' });
      const moves = result.analysis?.moves ?? [];
      const passed = !result.degraded && !result.crisis && moves.length > 0;
      return {
        passed,
        detail: passed ? `拆出 ${moves.length} 招、${result.analysis.paragraphs.length} 段` : `degraded=${result.degraded}`,
      };
    },
  },
  {
    // 锁的是"是读者不是老师"。这条最容易被 prompt 漂移破坏：
    // 一放松就回到讲课口吻，而产品对外说的是"有真实读者"。
    id: 'online-002',
    requiresKey: true,
    pass: '读者回应必须引用孩子原句、保持简短、且不给建议不列条目不教学（荣维东"真实读者"）',
    run: async () => {
      const result = await buildReaderReply({
        moveName: '把动作放慢，一片一片写',
        essayTitle: '爷爷的木工房',
        childText: CHILD_TEXT,
      });

      const reply = result.reply ?? '';
      const quoted = CHILD_TEXT.match(/[一-龥]{2,}/g)?.some((fragment) => reply.includes(fragment)) ?? false;
      const teaching = ['你可以', '建议', '试试', '下一句', '改成', '加点'].some((word) => reply.includes(word));
      const listy = /\*\*|^\s*1[.、]|^\s*[-•]\s/m.test(reply);
      const passed =
        !result.degraded &&
        reply.length > 0 &&
        reply.length < 400 &&
        quoted &&
        !teaching &&
        !listy;
      return {
        passed,
        detail: passed
          ? `长度 ${reply.length}，引用了原句，无说教`
          : `len=${reply.length} quoted=${quoted} teaching=${teaching} listy=${listy}`,
      };
    },
  },
];
