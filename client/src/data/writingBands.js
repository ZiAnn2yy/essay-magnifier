/**
 * 学段定义与教学姿态。
 *
 * 这份文件的依据是《义务教育语文课程标准（2022 年版）》的学段要求，
 * 以及两条产品级的取舍（均由用户 2026-10-29 提供的研究资料确认）：
 *
 * 1. **低段不亮"好词"。** 课标第一学段（1-2 年级）的要求是
 *    "在写话中乐于运用阅读和生活中学到的词语"——教研材料明确解释为
 *    "树立起运用词语的意识"，不是"精准、灵活、巧妙地运用"。
 *    高亮"好词"等于向孩子传递"有些词更值得被看见"，那是质量标准前置。
 *    所以 `pickWordsFromGrade` 定在 3——课标把"有新鲜感的词句"
 *    明确放在第二学段（3-4 年级）。
 *
 * 2. **产品的脊柱是交际语境写作（荣维东），不是作后讲评（管建刚）。**
 *    管建刚反对作前指导的理由是"没号脉就开药"。产品的对应物不是
 *    "即时回应"，而是"预判"——问孩子下一句该写什么。
 *    所以 dock 的问题必须满足一条判据（见 `canAnswerFromOwnSentence`）：
 *    **能不能只靠孩子刚写出的那句回答出来。**
 *
 * 管建刚在这里是约束，不是理论依据；荣维东才是依据。
 * 相关取舍的完整讨论见本次会话，不要再翻回去按"即时讲评"设计。
 */

export const BANDS = [
  {
    id: 'lower',
    label: '一到三年级',
    grades: [1, 2, 3],
    // 一二年级是写话，三年级正式进入习作
    note: '敢写、愿意写，比写得对重要。这个阶段不挑毛病。',
  },
  {
    id: 'upper',
    label: '四到六年级',
    grades: [4, 5, 6],
    note: '写具体、有细节，并且开始在乎看的人能不能读懂。',
  },
];

/** 课标分水岭：从几年级开始才值得亮"有新鲜感的词句"。 */
export const PICK_WORDS_FROM_GRADE = 3;

export function getBandByGrade(grade) {
  return BANDS.find((band) => band.grades.includes(grade)) ?? null;
}

export function getBandById(bandId) {
  return BANDS.find((band) => band.id === bandId) ?? null;
}

/** 这个年级要不要亮好词。按年级，不按学段带——三年级是课标的分水岭。 */
export function shouldPickWords(grade) {
  return grade >= PICK_WORDS_FROM_GRADE;
}

/**
 * 判据：这个问题是"读者在回应"，还是"老师在预判该写什么"。
 *
 * 这是产品唯一的提问红线，来源是管建刚的"号脉"论证：
 * 没看到学生写出的东西就指导，一切指导都是假想。
 * 产品里对应的坏行为不是"即时回应"，而是**预判**。
 *
 * 两类合格：
 *   A. 接着孩子自己写的内容往下问（"你写了'粗糙'，摸起来什么感觉"）
 *   B. 读者陈述自己的阅读状态（"读到这里我想知道后来呢"）
 *
 * 一类不合格：
 *   C. 替孩子决定该写什么（"下一句写阳光落在哪儿"）
 *
 * 规则版只能做模式匹配，很粗。真模型接上之后，这条判据必须写进
 * system prompt 让模型自己保证，这里的匹配降级为兜底。
 *
 * @param {string} question 智能体的问题
 * @param {string} sentence 孩子刚写出的那句
 * @returns {boolean} true = 合格
 */
export function isReaderQuestion(question, sentence) {
  if (typeof question !== 'string' || question.trim().length === 0) return false;

  // C 类：替孩子决定内容。句型填空也归在这类——用户明确否决过
  // 「It smells like ______」那种模板，一眼就是填空游戏不是智能体。
  const prescriptive = [
    /下一[句段]?\s*写/,
    /应该\s*写/,
    /(?:试|尝)着?写/,
    /把剩下的/,
    /补完/,
    /填空/,
    /用\s*[^，。？！]{0,12}\s*\.{2,}|_+/,
  ];
  if (prescriptive.some((pattern) => pattern.test(question))) return false;

  // A 类：引用了孩子句子里的实词
  const fragments =
    typeof sentence === 'string' ? sentence.match(/[一-龥]{2,}|[A-Za-z]{3,}/g) ?? [] : [];
  if (fragments.some((fragment) => question.includes(fragment))) return true;

  // B 类：读者在说自己的阅读状态
  const readerVoice = [
    '我想知道', '我在想', '我读到这里', '我看不懂', '我没看懂', '我好奇',
    '我想问', '我注意到', '我读到这儿',
  ];
  return readerVoice.some((marker) => question.includes(marker));
}
