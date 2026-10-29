/**
 * 教学设计知识库。
 *
 * 这是产品"依据从哪来"的单一事实源。规范§五要求：涉及事实性内容必须给出处，
 * 不允许模型凭空编造后直接呈现。拆解功能里最容易被编造的正是
 * "这一招为什么好""这个年级该学到什么"——所以它们不能由模型裸说，
 * 要从这里取，取不到就明说没有依据。
 *
 * 三条使用规则：
 *
 * 1. **每条都带 source 与 verified 标记。** `verified: false` 表示这是用户提供的
 *    二手转述、尚未核对原著。产品里引用它时要带这个限定，PPT 的风险识别页
 *    也要如实写——冒充"已核实"比没有依据更糟。
 * 2. **不引入向量检索。** 本机缺 tesseract/poppler 等系统依赖，且这个库只有几十条、
 *    按学段和主题精确匹配比语义检索更确定。判分要能确定性断言（规范§七）。
 * 3. **代码侧检索，不由模型自己决定调不调。** 当前推理模型与 tool_choice 不兼容，
 *    自主工具调用这条路实测走不通。所以是"代码编排的 agent"：
 *    检索、核对、重试都由代码决定，模型只负责生成。
 */

/** @typedef {{id:string, topic:string, grades:number[], content:string, source:string, verified:boolean}} StandardCard */

/** @type {StandardCard[]} */
export const STANDARD_CARDS = [
  {
    id: 'std-curriculum-band2',
    topic: '学段要求',
    grades: [3, 4],
    content:
      '第二学段（3-4 年级）习作要求：不拘形式地写下自己的见闻、感受和想象，' +
      '愿意与他人分享习作的快乐。尝试运用有新鲜感的词句。',
    source: '《义务教育语文课程标准（2022 年版）》第二学段"表达与交流"',
    // 用户提供的研究资料为二手转述，标注未核对原著
    verified: false,
  },
  {
    id: 'std-curriculum-band3',
    topic: '学段要求',
    grades: [5, 6],
    content:
      '第三学段（5-6 年级）习作要求：懂得写作是为了自我表达和与人交流。' +
      '修改自己的习作，并主动与他人交换修改。做到语句通顺，行款正确，书写规范、整洁。',
    source: '《义务教育语文课程标准（2022 年版）》第三学段"表达与交流"',
    verified: false,
  },
  {
    id: 'std-rong-weidong',
    topic: '教学法依据',
    grades: [3, 4, 5, 6],
    content:
      '交际语境写作：写作是作者在特定语境中进行的表达和交流活动，五要素为' +
      '作者、读者、目的、话题、语言。写作动机来自内在的表达需要，以达成交际功能为宗旨。',
    source: '荣维东·交际语境写作理论（据用户提供的研究资料转述）',
    verified: false,
  },
  {
    id: 'std-wang-rongsheng',
    topic: '教学法依据',
    grades: [3, 4, 5, 6],
    content:
      '语文课程内容的选文可分四类：定篇、例文、样本、用件。其中"例文"的价值不在于' +
      '被欣赏或模仿，而在于让学生看到"这一类文章是怎么写成的"，从而获得"怎么写"的知识。',
    source: '王荣生·语文课程内容层次理论（据用户提供的研究资料转述）',
    verified: false,
  },
  {
    id: 'std-bruner-scaffold',
    topic: '教学法依据',
    grades: [3, 4, 5, 6],
    content:
      '支架式教学以最近发展区为基础：教师或学习材料如同建筑脚手架，阶段性提供支撑，' +
      '随学习者能力提升逐步撤除。撤除路径通常从高密度框架到低密度提示再到独立输出。' +
      '本质是撤，不是给——不撤的支架会变成新型的句型填空。',
    source: '布鲁纳·支架式教学（据用户提供的研究资料转述；语文语境下的撤除判据缺实证，是已知缺口）',
    verified: false,
  },
  {
    id: 'std-guan-jiangang',
    topic: '教学法依据',
    grades: [5, 6],
    content:
      '作后讲评：反对作前指导，理由是"还没给病人把脉，也没做化验，想当然地给病人吃药"。' +
      '讲评课三环节为欣赏、挑刺、指导或训练，全部发生在学生完整写完、教师看完之后。',
    source: '管建刚·作后讲评（据用户提供的研究资料转述）',
    verified: false,
  },
  {
    id: 'std-he-jie',
    topic: '教学法依据',
    grades: [3, 4],
    content:
      '百字作文：每天写一句，句句可见，越攒越多。针对的是"没什么好写"——' +
      '学生缺的往往不是技巧而是写作欲望和习惯，解法是天天写、哪怕每天只写一句话。',
    source: '何捷·百字作文（据用户提供的研究资料转述）',
    verified: false,
  },
];

/**
 * 按学段取依据。
 *
 * 先取该年级的学段要求（一定有），再取跨学段的教学法依据。
 * 找不到就返回空数组——调用方必须处理"没有依据"这种情况，
 * 并把它如实告诉模型，而不是让模型换个说法编一个。
 *
 * @param {number} grade 3-6
 * @param {string} [topic] 主题过滤，如"学段要求"
 * @returns {StandardCard[]}
 */
export function lookupStandards(grade, topic) {
  if (!Number.isInteger(grade) || grade < 3 || grade > 6) return [];

  return STANDARD_CARDS.filter((card) => {
    if (!card.grades.includes(grade)) return false;
    if (topic !== undefined && card.topic !== topic) return false;
    return true;
  });
}

/** 把卡片渲染成能塞进 prompt 的文本。出处与核实状态必须一起带上。 */
export function renderStandards(cards) {
  if (cards.length === 0) return '';
  return cards
    .map((card) => `- ${card.content}\n  出处：${card.source}${card.verified ? '' : '（未核对原著，引用时需注明）'}`)
    .join('\n');
}
