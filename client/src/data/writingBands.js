/**
 * 学段定义与教学姿态。
 *
 * 2026-10-29 产品方向整体转向「范文放大镜」后，本文件只覆盖**小学 3-6 年级**：
 * 1-2 年级不做——他们识字量读不完一篇范文，而课标第一学段的要求是"乐于运用词语"，
 * 不是篇章质量。详见 docs/wiki/01-产品与方向.md。
 *
 * 学段分两条带，但**行为开关按年级**，因为课标的分水岭不在带的边界上：
 * 3-4 年级的落点是"有新鲜感的词句"（课标原词，出现在第二学段），
 * 5-6 年级才引入"修改自己的习作"和交际意识。
 * 所以拆解深度、仿写任务的长度都按年级取，不按带取。
 *
 * 产品脊柱 2026-10-29 起是**王荣生"例文"说 + 布鲁纳支架式教学**：
 * 范文的价值是让孩子看到"这一类文章怎么写成的"，拆解产出写法支架，
 * 支架必须随着收藏册变厚而逐步撤除——否则就是新型句型填空。
 * 新红线只有一条：**教方法，不给内容**。
 *
 * （旧脊柱是荣维东交际语境写作，已降级为阶段三"AI 以读者身份回应孩子
 * 自己写的句子"这一处的约束。归档见 git tag `old-direction-2026-10-29`。）
 */

export const BANDS = [
  {
    id: 'mid',
    label: '三四年级',
    grades: [3, 4],
    note: '刚开始学"有新鲜感的词句"。招式要少、要具体，名字用孩子自己的话。',
  },
  {
    id: 'high',
    label: '五六年级',
    grades: [5, 6],
    note: '看得见"看的人能不能读懂"。招式可以深一层，仿写从一两句到一小段。',
  },
];

/**
 * 问题和孩子的句子是否共享一个 2-3 字片段。
 *
 * 为什么用滑窗而不是分词：项目不引分词库（规范§三：不加新依赖），
 * 而中文分词的收益在这里换不来——要判断的只是"这个问题有没有接着
 * 孩子写的东西在说"，两个连续汉字撞上就已经是很强的信号。
 *
 * @param {string} sentence 孩子刚写出的那句
 * @param {string} question 智能体的问题
 * @returns {boolean} 有共享片段
 */
function sharesFragment(sentence, question) {
  if (typeof sentence !== 'string' || typeof question !== 'string') return false;
  // 只取中文和英文单词，标点不参与
  const words = sentence.match(/[一-龥]+|[A-Za-z]{3,}/g) ?? [];
  for (const word of words) {
    if (/[A-Za-z]/.test(word)) {
      if (question.toLowerCase().includes(word.toLowerCase())) return true;
      continue;
    }
    for (let size = 3; size >= 2; size -= 1) {
      for (let start = 0; start + size <= word.length; start += 1) {
        if (question.includes(word.slice(start, start + size))) return true;
      }
    }
  }
  return false;
}

/**
 * 判据：这句话是"读者在回应"，还是"老师在预判该写什么"。
 *
 * **只管一种言语行为**：AI 回应孩子自己刚写出的句子时，不许替孩子决定内容。
 * 依据是管建刚的"号脉"论证——没看到学生写出的东西就指导，一切指导都是假想。
 *
 * 两类合格：
 *   A. 接着孩子自己写的内容往下问（"你写了'粗糙'，摸起来什么感觉"）
 *   B. 读者陈述自己的阅读状态（"读到这里我想知道后来呢"）
 *
 * 一类不合格：
 *   C. 替孩子决定该写什么（"下一句写阳光落在哪儿"）、句型填空
 *
 * ⚠️ 已知缺口：新脊柱（例文说 + 支架说）允许"引导孩子用范文里的一招写自己的"，
 * 而那种指令按下面的正则会被判为 C 类。阶段三做 TaskDock 时必须在这里补第二个
 * 谓词 `isImitateTask`（引用范文原文 + 指令指向孩子自己的写作 = 合格），
 * 边界仍是"AI 给招式，不给内容"。在补上之前，这条判据不适用于仿写指令。
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
  //
  // 中文没有词边界，`sentence.match(/[一-龥]{2,}/g)` 在一句没有空格的话上
  // 只会抓到**一整句**，于是 `question.includes(整句)` 永远为假——
  // 这个函数因此从来没放过行过任何一条 A 类，而它一直没人调用，所以没人发现。
  // 改成滑窗取 2-3 字片段：粗，但"粗"本来就是这条规则版的定位。
  if (sharesFragment(sentence, question)) return true;

  // B 类：读者在说自己的阅读状态
  const readerVoice = [
    '我想知道', '我在想', '我读到这里', '我看不懂', '我没看懂', '我好奇',
    '我想问', '我注意到', '我读到这儿',
  ];
  return readerVoice.some((marker) => question.includes(marker));
}
