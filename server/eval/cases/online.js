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

/**
 * 环境性失败 → 让用例自己跳过，不计入通过率。
 *
 * 为什么要有这个：online-002 长期被记成"temperature=1 下偶发失败，重跑即可"。
 * 2026-10-30 复盘发现真因是**稳定超时**——读者回应此前没有自己的超时预算，
 * 吃全局 30/60 秒，而实测耗时中位数就在 31 秒、长尾过 60 秒。
 * 一个因为模型慢而变红的用例，和因为提示词写坏而变红的用例，
 * 在报告里长得一模一样，于是人开始忽略红色。
 *
 * 判据必须窄：只有明确归类为 timeout 的才跳。额度耗尽、上游不可达、
 * 输出不合规，全都照旧算 FAIL——那些是真问题。
 *
 * **两个出口的字段名不一样**：analyze 回 `degradeReason`，reader 回 `reason`。
 * 2026-11-02 发现这条不一致让读者路径的超时一直跳不掉、全记成 FAIL——
 * 恰好是这个函数要防的那件事（因为模型慢而红的用例，看起来和提示词写坏一样）。
 * 所以两个字段都读，`budget-002` 锁着它。
 */
export function skipIfTimeout(result) {
  const reason = result.degradeReason ?? result.reason;
  if (result.degraded && reason === 'timeout') {
    return { skipped: true, skipReason: '模型本次超时（环境因素），不计入通过率' };
  }
  return null;
}

export const onlineCases = [
  {
    id: 'online-001',
    requiresKey: true,
    pass: '真实模型能拆出一篇范文：返回合法结果、招式非空、未走降级',
    run: async () => {
      const result = await buildAnalysis({ grade: 4, essayText: ESSAY, title: '爷爷的木工房' });
      const skip = skipIfTimeout(result);
      if (skip) return skip;

      const moves = result.analysis?.moves ?? [];
      const passed = !result.degraded && !result.crisis && moves.length > 0;
      return {
        passed,
        detail: passed
          ? `拆出 ${moves.length} 招、${result.analysis.paragraphs.length} 段`
          : `degraded=${result.degraded} 原因=${result.degradeReason ?? '未标注'}`,
      };
    },
  },
  {
    // 锁的是"是读者不是老师"，也锁"是回应不是复述"。
    // 第二类是后来才发现的：prompt 里"引用原话说你看见什么"这条指令，
    // 会把模型教成逐句镜像——"你写A让我看见X；你写B让我感觉到Y；
    // 你写到的那个A吗？"。那是照镜子加阅读理解题，不是回应。
    id: 'online-002',
    requiresKey: true,
    pass: '读者回应必须有真实反应、不逐句镜像、不问回头确认式的问题、不说教不列表',
    run: async () => {
      const result = await buildReaderReply({
        moveName: '把动作放慢，一片一片写',
        essayTitle: '爷爷的木工房',
        childText: CHILD_TEXT,
      });

      // 超时是环境事件，不是提示词回归。见文件顶部 skipIfTimeout 的说明。
      const skip = skipIfTimeout(result);
      if (skip) return skip;

      const reply = result.reply ?? '';
      const quoted = CHILD_TEXT.match(/[一-龥]{2,}/g)?.some((fragment) => reply.includes(fragment)) ?? false;

      // 说教与列表
      const teaching = ['你可以', '建议', '试试', '下一句', '改成', '加点'].some((word) => reply.includes(word));
      const listy = /\*\*|^\s*1[.、]|^\s*[-•]\s/m.test(reply);

      // 逐句镜像：以"你写"开头的分句超过一处，就是在翻译他的话
      const mirrors = (reply.match(/你写/g) || []).length;

      // 回头确认式的提问：考孩子有没有读懂自己刚写的话。
      // **不能只匹配裸的"是不是"**——它同样出现在开放式提问里：
      // "爷爷是不是正想着别的事？"是在打开新写法，不是在让他确认自己写了什么。
      // 2026-10-30 就因为这个裸词表，一次完全合格的读者回应被判成说教，
      // 而这条用例在 temperature=1 下时过时不过。所以判据收紧成
      // "冲着孩子的本意去的确认"：你(说/写)的…(是不是|就是指|是指)…(意思|想表达)，
      // 或"是不是就是这个意思"。
      const CONFIRM_ASK =
        /(你说|你写|你的)[^。！？]{0,12}(是不是|就是指|是指)[^。！？]{0,12}(意思|想表达|指的是)/;
      const CONFIRM_ASK_SHORT = /(是不是|就是指)[^。！？]{0,6}(这个意思|想表达)/;
      const pedantic = CONFIRM_ASK.test(reply) || CONFIRM_ASK_SHORT.test(reply);

      // 反向对照：收紧之后的判据必须还抓得住它本来要抓的东西。
      // 没有这一条，"把用例改宽"和"把用例改对"看起来一模一样。
      const stillCatchesRealOnes = [
        '你说的"红绳子"是不是就是这个意思？',
        '你写这句话是不是想表达你很感动？',
        '你的意思是不是想表达爷爷很辛苦？',
        '是不是这个意思？',
      ].every((sample) => CONFIRM_ASK.test(sample) || CONFIRM_ASK_SHORT.test(sample));

      // 真实反应：回复里必须有第一人称的感知或情绪。
      // 判据走结构不走词表——前两版列白名单（"我想再读/我停下/…"），
      // 模型换个说法就漏，temperature=1 下用例时过时不过，
      // 而一个会抖的用例比没有用例更糟：它训练人忽略红色。
      // 改成"我 + 近距离内出现感知/情绪动词"，靠结构判断。
      const reaction = /我[^。！？]{0,10}(看见|听见|感觉到|感觉|觉得|在想|想|笑|停下|停下来|跟着|差点|读完|读了|暖|愣)/.test(reply);

      const passed =
        !result.degraded &&
        reply.length > 0 &&
        reply.length < 400 &&
        quoted &&
        !teaching &&
        !listy &&
        mirrors <= 1 &&
        !pedantic &&
        stillCatchesRealOnes &&
        reaction;
      return {
        passed,
        detail: passed
          ? `长度 ${reply.length}，引用了原句，有真实反应`
          : `len=${reply.length} quoted=${quoted} teaching=${teaching} listy=${listy} 镜像数=${mirrors} 回头确认=${pedantic} 反向对照=${stillCatchesRealOnes} 有反应=${reaction} 降级原因=${result.degraded ? (result.reason ?? '未标注') : '无'}`,
      };
    },
  },
];
