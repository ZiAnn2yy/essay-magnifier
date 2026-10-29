/**
 * 临时数据层（接真接口后整个删掉）。
 *
 * 为什么现在是 mock：第一页要的是"孩子写一句 → 有人回应 → 变成一格"的完整闭环，
 * 而 `POST /api/chat` 目前只返回一段裸 `text`，是按聊天记录模型设计的。
 * 契约改造是下一步。在交互经确认之前先改内核，等于改两遍。
 *
 * 接真接口时只做一件事：把 `Workbench.jsx` 里对 `mockRespond` 的调用换成
 * `fetch('/api/v2/frame')`。**这个文件的形状就是契约的形状。**
 *
 * ── 提问的立场（重要，2026-10-29 定）────────────────────────────────────
 * 智能体在这里**不是老师，是在读你东西的人**。依据是交际语境写作
 * （荣维东）：写作是特定语境中的表达和交流，产品要给孩子一个真实的读者。
 * "变成绘本放给他们看"就是这个读者的落地。
 *
 * 因此问题只有两种合格形态（见 `isReaderQuestion`）：
 *   A. 接着孩子自己写的内容往下问
 *   B. 读者陈述自己的阅读状态
 * 不合格的那种：替孩子决定下一句写什么。那是管建刚说的"没号脉就开药"，
 * 而管建刚在这个产品里是约束、不是理论依据。
 *
 * 同理：**不许出现句型填空**（`它______得像______` 这种）。用户明确否决过——
 * 一眼就是填空游戏，不是智能体。
 */

import { pickWords } from './lexicon.js';
import { shouldPickWords, isReaderQuestion } from './writingBands.js';

export const STAGES = [
  {
    id: 'lower',
    label: '一到三年级',
    grades: [1, 2, 3],
    blurb: '敢写、愿意写，比写得对重要',
  },
  {
    id: 'upper',
    label: '四到六年级',
    grades: [4, 5, 6],
    blurb: '写具体、有细节，让看的人读懂',
  },
];

/**
 * 一格 = 孩子写下并完成的一句话。
 *
 * @typedef {Object} Frame
 * @property {string} id
 * @property {string} text      孩子写的中文原句，银幕的主角
 * @property {string[]} picks   智能体挑出的"有新鲜感的词"。
 *                               **低年级恒为空数组**——课标第一学段只要
 *                               "乐于运用词语"，不要质量标准前置。
 * @property {number} revision  第几版。0 = 原稿，1 = 第一次改。
 *                               课标把"修改自己的习作"放在核心位置，
 *                               所以改前改后都要留着，"我改了什么"要看得见。
 * @property {string|null} previous 上一版的原文，用于在银幕上并排对比
 */

/**
 * 智能体的回应。
 *
 * @typedef {Object} Question
 * @property {string} text   读者的问题（合格形态见文件头）
 * @property {string} kind    'cheer' 只庆祝 / 'reader' 读者提问 / 'revise' 请孩子改
 */

const seedFrames = [
  {
    id: 'f1',
    text: '我们家房子后面有一间小工坊，是爷爷的。',
    picks: [],
    revision: 0,
    previous: null,
  },
  {
    id: 'f2',
    text: '一推门进去，全是木头和旧茶的味道。',
    picks: [],
    revision: 0,
    previous: null,
  },
  {
    id: 'f3',
    text: '阳光从唯一那扇窗户照进来，落在爷爷粗糙的手背上。',
    picks: ['唯一', '粗糙'],
    revision: 0,
    previous: null,
  },
];

const seedQuestion = {
  id: 'q1',
  text: '你写到"落在爷爷粗糙的手背上"——他的手摸上去到底是什么感觉？',
  kind: 'reader',
};

export const seedFilm = {
  title: '爷爷的工坊',
  frames: seedFrames,
  question: seedQuestion,
  payoff: 'picturebook',
};

/**
 * 按年级取初始状态。
 *
 * 为什么要有这个函数而不是直接导出一个常量：低年级的第一句话**不能是
 * 读者提问**。课标第一学段只要"乐于运用"，一上来就问"粗糙摸起来什么
 * 感觉"是在施加质量标准。所以一二年级的开场是一句纯粹的庆祝。
 */
export function getSeedFilm(grade) {
  return {
    ...seedFilm,
    question:
      grade <= 2
        ? { id: 'q1', text: CHEERS[0], kind: 'cheer' }
        : seedQuestion,
  };
}

/* ==========================================================================
   临时应答器：用规则模拟"有人读了这句，并且回应"
   ========================================================================== */

/**
 * 从孩子句子里取一个可引用的片段。
 * 优先取词库命中的好词（高年级），否则退到按标点切第一小节。
 */
function quoteFrom(sentence, grade) {
  if (shouldPickWords(grade)) {
    const hits = pickWords(sentence);
    if (hits.length > 0) return hits[0];
  }

  const clause = sentence.split(/[，。！？、；,.!?;]/).find((part) => part.trim().length >= 2);
  return clause ? clause.trim().slice(0, 8) : sentence.trim().slice(0, 8);
}

/** A 类问题：接着孩子写的内容往下问 */
const READER_QUESTIONS = [
  (w) => `你写到"${w}"——那个时候你自己身上是什么感觉？`,
  (w) => `你写到"${w}"——它看起来是什么样子的？`,
  (w) => `读到你写"${w}"，我想知道它旁边还有什么？`,
  (w) => `你写到"${w}"——这个你是怎么发现的？`,
  (w) => `你写"${w}"的时候，你自己站在哪儿？`,
];

/** B 类问题：读者说自己的阅读状态 */
const READER_VOICE = [
  '读到这里我想知道，后来呢？',
  '我读到这儿有点好奇，接下来谁会出现？',
  '我在想，这件事是什么时候发生的？',
];

/** 低年级：只庆祝，不挑毛病。课标第一学段要的是"乐于运用"的意识 */
const CHEERS = [
  '这句我记下了，写得很有意思。',
  '这句我喜欢，读起来像真的发生过。',
  '嗯，这句有画面。',
];

/** 高年级：请孩子自己改，而不是替他改 */
const REVISE_ASKS = [
  '这句里有个词还能更准——你回去看看，是哪个词在偷懒？',
  '这句读起来有点赶。哪一句可以拆成两句，让它慢下来？',
  '这句里"很好"两个字，能换成看得见的样子吗？',
];

/**
 * 模拟一次"提交句子 → 得到回应 + 新的一格"。
 *
 * @param {string} sentence 孩子写的中文句子
 * @param {number} grade    年级，决定挑不挑词、用什么语气
 * @param {number} turn     第几轮，用于轮换避免重复
 */
export function mockRespond(sentence, grade, turn) {
  const text = sentence.trim();
  const picks = shouldPickWords(grade) ? pickWords(text) : [];
  const quote = quoteFrom(text, grade);

  let question;

  if (grade <= 2) {
    // 低段：纯庆祝。资料里那篇《毁掉孩子写作灵气的往往是"好词好句"》
    // 说得直白——这个阶段施加质量标准是负资产。
    question = { id: `q${turn}`, text: CHEERS[turn % CHEERS.length], kind: 'cheer' };
  } else if (turn % 5 === 4) {
    // 偶尔请孩子回看自己写的，而不是一直往前赶
    question = { id: `q${turn}`, text: REVISE_ASKS[turn % REVISE_ASKS.length], kind: 'revise' };
  } else if (turn % 3 === 2) {
    question = { id: `q${turn}`, text: READER_VOICE[turn % READER_VOICE.length], kind: 'reader' };
  } else {
    question = {
      id: `q${turn}`,
      text: READER_QUESTIONS[turn % READER_QUESTIONS.length](quote),
      kind: 'reader',
    };
  }

  // 兜底：万一模板撞上了预判形态，退到读者自述，不放行一句"下一句写XX"
  if (!isReaderQuestion(question.text, text)) {
    question = { id: `q${turn}`, text: READER_VOICE[0], kind: 'reader' };
  }

  return {
    frame: {
      id: `f${turn}`,
      text,
      picks,
      revision: 0,
      previous: null,
    },
    question,
  };
}

/** 孩子改了某一格之后调用：旧原文退到 previous，版次加一。 */
export function makeRevision(frame, newText) {
  return {
    ...frame,
    text: newText.trim(),
    picks: pickWords(newText),
    revision: frame.revision + 1,
    previous: frame.text,
  };
}
