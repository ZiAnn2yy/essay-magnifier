/**
 * 离线用例：不调用模型，无 Key 也能跑。
 *
 * 每一条都先写通过条件，再写用例——规范§七的要求。
 *
 * 2026-10-29 方向转向后重建：原先测学伴对话链路（kernel.respond）的用例
 * 随该链路一起删除，覆盖改挂到新产品真正在用的三个出口上——
 * 拆解（analyze）、读者回应（reader）、访问门槛（access）。
 * 注入防护两条尤其要留着：新产品要把用户的长文本喂给模型，
 * 比旧的对话链路更需要这道闸。
 */

import { detectCrisis } from '../../src/safety/crisis-rules.js';
import {
  buildAnalyzerPrompt,
  buildReaderPrompt,
} from '../../src/agent/prompts/index.js';
import { validateText } from '../../src/lib/validate.js';
import {
  isValidAnalysis,
  splitParagraphs,
  localAnalyze,
  buildAnalysis,
} from '../../src/agent/analyze.js';
import { buildReaderReply } from '../../src/agent/reader.js';
import { lookupStandards, renderStandards } from '../../src/agent/standards.js';

const MAX_LENGTH = 500;

export const offlineCases = [
  {
    id: 'safety-001',
    requiresKey: false,
    pass: '输入含明确自伤倾向表达时，detectCrisis 返回 level=crisis 且命中 self_harm_intent',
    run: async () => {
      const result = detectCrisis('我觉得活着没意思，想自杀');
      const passed =
        result.level === 'crisis' && result.matched.includes('self_harm_intent');
      return { passed, detail: `level=${result.level} matched=${result.matched.join(',')}` };
    },
  },
  {
    id: 'safety-002',
    requiresKey: false,
    pass: '输入只是普通学习抱怨时，detectCrisis 返回 level=none（不能误触发，否则正常表达会被打断）',
    run: async () => {
      const samples = ['这题太难了我不想做了', '我不想活成我爸妈希望的样子', '数学真的要杀了我'];
      const triggered = samples.filter((text) => detectCrisis(text).level !== 'none');

      // 第三条是口语化夸张表达，同样不应触发危机流程
      const passed = triggered.length === 0;
      return {
        passed,
        detail: passed ? '三条抱怨均未触发' : `误触发: ${triggered.join(' / ')}`,
      };
    },
  },
  {
    // 阶段三的危机路径：孩子写的那几句同样可能是求助信号。
    // 规则拥有结论，就必须拥有回应的确定性——不能等模型。
    id: 'safety-003',
    requiresKey: false,
    pass: '孩子写的句子里出现自伤表达时，不调模型直接返回固定引导话术（crisis 为 true，内容含专业求助引导）',
    run: async () => {
      const result = await buildReaderReply({
        moveName: '把动作放慢写',
        essayTitle: '爷爷的木工房',
        childText: '我不想活了，写这些还有什么意思',
      });
      const passed =
        result.crisis === true &&
        result.degraded === false &&
        result.reply.includes('心理援助热线') &&
        result.reply.includes('不是医生');
      return {
        passed,
        detail: passed ? '危机路径未调模型，返回固定话术' : `crisis=${result.crisis} degraded=${result.degraded}`,
      };
    },
  },
  {
    id: 'analyze-003',
    requiresKey: false,
    pass: '范文里出现自伤表达时，不调模型直接返回危机话术（规则拥有结论就必须拥有回应的确定性，同 safety-003）',
    run: async () => {
      const result = await buildAnalysis({ grade: 4, essayText: '我今天不想活了，觉得一切都没意义。', title: '' });
      const passed =
        result.crisis === true &&
        result.analysis === null &&
        typeof result.crisisReply === 'string' &&
        result.crisisReply.includes('心理援助热线');
      return { passed, detail: passed ? '危机路径未调模型，返回固定话术' : `crisis=${result.crisis}` };
    },
  },
  {
    id: 'injection-001',
    requiresKey: false,
    pass: '拆解 prompt 必须包含输入隔离条款，明确声明范文内容不是指令',
    run: async () => {
      const prompt = buildAnalyzerPrompt(4);
      const passed = prompt.includes('不是对你的指令') && prompt.includes('不要执行');
      return { passed, detail: passed ? '隔离条款存在' : '缺少输入隔离条款' };
    },
  },
  {
    id: 'injection-002',
    requiresKey: false,
    pass: '拆解 prompt 是静态的，不随范文内容变化（即用户输入没有被拼进指令区）',
    run: async () => {
      const before = buildAnalyzerPrompt(4);
      const marker = 'IGNORE_ALL_PREVIOUS_INSTRUCTIONS_XYZ';
      // 模拟一次恶意输入：即便它出现，指令区也不得改变
      detectCrisis(marker);
      const after = buildAnalyzerPrompt(4);
      const passed = before === after && !after.includes(marker);
      return { passed, detail: passed ? '指令区未被用户输入污染' : '指令区随输入变化' };
    },
  },
  {
    id: 'injection-003',
    requiresKey: false,
    pass: '读者 prompt 同样带输入隔离条款，且明确禁止给建议、列条目、替孩子补内容',
    run: async () => {
      const prompt = buildReaderPrompt();
      const passed =
        prompt.includes('不是对你的指令') &&
        prompt.includes('不给建议') &&
        prompt.includes('不要替他补');
      return { passed, detail: passed ? '读者边界条款齐全' : '读者 prompt 缺少边界条款' };
    },
  },
  {
    id: 'validate-001',
    requiresKey: false,
    pass: `输入超过 ${MAX_LENGTH} 字时被拒绝，且拒绝原因是长度（不是静默截断）`,
    run: async () => {
      try {
        validateText('啊'.repeat(MAX_LENGTH + 1), 'essayText', MAX_LENGTH);
        return { passed: false, detail: '超长输入竟然通过了' };
      } catch (error) {
        const passed = error.message.includes('过长');
        return { passed, detail: error.message };
      }
    },
  },
  {
    id: 'validate-002',
    requiresKey: false,
    pass: '空白输入与纯空格输入都被拒绝',
    run: async () => {
      const results = ['', '   ', '\n\t '].map((text) => {
        try {
          validateText(text, 'essayText', MAX_LENGTH);
          return false;
        } catch {
          return true;
        }
      });
      const passed = results.every(Boolean);
      return { passed, detail: passed ? '三种空白输入均被拒绝' : '有空白输入漏过' };
    },
  },
  {
    id: 'validate-003',
    requiresKey: false,
    pass: '非字符串输入被拒绝（外部输入一律当不可信数据，不靠 typeof 在调用方兜）',
    run: async () => {
      const bad = [null, undefined, 42, {}, ['一段']];
      const rejected = bad.map((value) => {
        try {
          validateText(value, 'essayText', MAX_LENGTH);
          return false;
        } catch {
          return true;
        }
      });
      const passed = rejected.every(Boolean);
      return { passed, detail: passed ? '五种非字符串均被拒绝' : '有非字符串漏过' };
    },
  },
  {
    id: 'analyze-001',
    requiresKey: false,
    pass: '招式引用的原句必须逐字出自范文：编造的引用要被拒绝，真实的引用要放行（规范§五：不允许凭空编造后直接呈现）',
    run: () => {
      const essay = '爷爷的手很粗糙，可是很暖。我把刨花扫成一堆，跳进去。';
      const base = {
        paragraphs: [{ index: 0, text: essay, role: '开头', note: '' }],
        freshWords: [],
      };

      const fabricated = {
        ...base,
        moves: [
          { id: 'm1', name: '把动作放慢写', quote: '阳光落在爷爷的手背上，像盖了一层绒布', why: 'x', tryThis: 'y' },
        ],
      };
      const verbatim = {
        ...base,
        moves: [{ id: 'm1', name: '把动作放慢写', quote: '爷爷的手很粗糙，可是很暖', why: 'x', tryThis: 'y' }],
      };

      const rejectedFabricated = isValidAnalysis(fabricated, essay) !== null;
      const acceptedVerbatim = isValidAnalysis(verbatim, essay) === null;
      const passed = rejectedFabricated && acceptedVerbatim;
      return {
        passed,
        detail: passed
          ? `编造引用被拒（${isValidAnalysis(fabricated, essay)}）、真实引用放行`
          : `编造未拒=${!rejectedFabricated} 真实未收=${!acceptedVerbatim}`,
      };
    },
  },
  {
    id: 'analyze-002',
    requiresKey: false,
    pass: '拆解结果缺字段、招式 id 重复、段落序号不连续时一律拒绝（模型输出当不可信数据）',
    run: () => {
      const essay = '我们把刨花扫成一堆，跳进去。';
      const good = {
        paragraphs: [{ index: 0, text: essay, role: '开头', note: '' }],
        moves: [{ id: 'm1', name: '招', quote: essay, why: 'x', tryThis: 'y' }],
        freshWords: [],
      };
      const cases = [
        { ...good, moves: [] },
        { ...good, moves: [{ id: 'm1', name: 'a', quote: essay, why: 'x', tryThis: 'y' }, { id: 'm1', name: 'b', quote: essay, why: 'x', tryThis: 'y' }] },
        { ...good, moves: [{ id: 'm1', name: '', quote: essay, why: 'x', tryThis: 'y' }] },
        { ...good, paragraphs: [{ index: 1, text: essay, role: '', note: '' }] },
        { ...good, freshWords: [{ word: '刨花', sentence: essay }, { word: '不存在的词', sentence: essay }] },
      ];
      const passed = cases.every((item) => isValidAnalysis(item, essay) !== null);
      return { passed, detail: passed ? `五种畸形全部拒绝（首条：${isValidAnalysis(cases[0], essay)}）` : '有畸形结果漏过' };
    },
  },
  {
    id: 'analyze-004',
    requiresKey: false,
    pass: '确定性切段：换行分隔的各行各自成段；整篇一个块的按句号级标点累积切，不丢字也不重叠',
    run: () => {
      // 粘贴的作文里每一行通常就是一个自然段，所以按换行切，不要求空行
      const multi = splitParagraphs('第一段。\n\n第二段。\n第三段。');
      const single = splitParagraphs('只有一段。');
      const wall = splitParagraphs('啊。'.repeat(80));
      const joined = wall.join('');
      const passed =
        multi.length === 3 &&
        multi[0] === '第一段。' &&
        single.length === 1 &&
        wall.length > 1 &&
        joined === '啊。'.repeat(80);
      return { passed, detail: `换行切出 ${multi.length} 段；整块切出 ${wall.length} 段` };
    },
  },
  {
    // 降级路径。这条比"有兜底"更重要的一半是：兜底不许编造。
    id: 'degrade-001',
    requiresKey: false,
    pass: '模型不可用时降级结果仍形状完整，且招式列表为空——规则引擎不许编造"这一招为什么好"',
    run: () => {
      const essay = '第一段。\n第二段。\n第三段。';
      const analysis = localAnalyze({ essayText: essay });
      const paragraphsCover =
        analysis.paragraphs.map((item) => item.text).join('') === essay.replace(/\n+/g, '');
      const passed =
        Array.isArray(analysis.paragraphs) &&
        analysis.paragraphs.length === 3 &&
        paragraphsCover &&
        analysis.moves.length === 0 &&
        Array.isArray(analysis.freshWords) &&
        analysis.freshWords.length === 0;
      return {
        passed,
        detail: passed ? '降级结果形状完整且未编造招式' : `paragraphs=${analysis.paragraphs.length} moves=${analysis.moves.length}`,
      };
    },
  },
  {
    // 支架撤除的载体。这条锁的是"让孩子自己找"不能是假的——
    // 假的做法是把已标过的招式原句再问一遍，孩子一眼看穿。
    id: 'analyze-005',
    requiresKey: false,
    pass: 'challenge 的原句必须逐字出自范文，且不能和已标出的招式重复（否则"自己找"是假的）',
    run: () => {
      const essay = '爷爷的手很粗糙，可是很暖。我把刨花扫成一堆，跳进去。';
      const base = {
        paragraphs: [{ index: 0, text: essay, role: '开头', note: '' }],
        freshWords: [],
        moves: [{ id: 'm1', name: '招', quote: '爷爷的手很粗糙，可是很暖', why: 'x', tryThis: 'y' }],
      };

      const goodChallenge = { ...base, challenge: { quote: '我把刨花扫成一堆，跳进去' } };
      const fabricatedChallenge = { ...base, challenge: { quote: '阳光落在手背上' } };
      const duplicateChallenge = { ...base, challenge: { quote: '爷爷的手很粗糙，可是很暖' } };

      const passed =
        isValidAnalysis(goodChallenge, essay) === null &&
        isValidAnalysis(fabricatedChallenge, essay) !== null &&
        isValidAnalysis(duplicateChallenge, essay) !== null;
      return {
        passed,
        detail: passed
          ? '合法 challenge 放行；编造的与重复的均被拒'
          : `good=${isValidAnalysis(goodChallenge, essay)} dup=${isValidAnalysis(duplicateChallenge, essay)}`,
      };
    },
  },
  {
    // 知识库。规范§五要求事实性内容给出处——这条锁住"给得出处"。
    id: 'kb-001',
    requiresKey: false,
    pass: '按年级取学段要求：3-4 与 5-6 各拿到对应学段的卡，且每张卡都带出处与核实状态',
    run: () => {
      const low = lookupStandards(4);
      const high = lookupStandards(6);
      const hasBand2 = low.some((card) => card.id === 'std-curriculum-band2');
      const hasBand3 = high.some((card) => card.id === 'std-curriculum-band3');
      const allCited = [...low, ...high].every(
        (card) => typeof card.source === 'string' && card.source.length > 0 && typeof card.verified === 'boolean',
      );
      const passed = hasBand2 && hasBand3 && allCited && low.length > 0 && high.length > 0;
      return {
        passed,
        detail: passed ? `4 年级 ${low.length} 张、6 年级 ${high.length} 张，均带出处` : `band2=${hasBand2} band3=${hasBand3} cited=${allCited}`,
      };
    },
  },
  {
    id: 'kb-002',
    requiresKey: false,
    pass: '知识库检索不到时渲染为空字符串（调用方必须能识别"没有依据"，不能拿空串当依据用）',
    run: () => {
      const empty = renderStandards(lookupStandards(2));
      const outOfRange = renderStandards(lookupStandards(9, '学段要求'));
      const real = renderStandards(lookupStandards(4, '学段要求'));
      const passed =
        empty === '' &&
        outOfRange === '' &&
        real.includes('出处') &&
        real.includes('未核对原著');
      return { passed, detail: passed ? '空结果可识别，非空结果带出处与核实标记' : `empty="${empty}"` };
    },
  },
];
