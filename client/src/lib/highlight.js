/**
 * 把一段文本按"要高亮的词"切成有序片段，交给调用方决定怎么渲染。
 *
 * 中文没有空格，所以不能按词切分，只能**子串定位**：拿要高亮的词回文本里
 * 找第一次出现的位置，把那一截标出来。两个细节：
 *
 * 1. **区间去重**——「金黄」和「金灿灿」可能压在同一处，也可能一个套在
 *    另一个里。先占住的区间不让后面的词再切进去，否则会切出嵌套的高亮。
 * 2. **按出现顺序输出**——高亮要顺着读文本的方向依次亮，不是按词库顺序。
 *
 * 顺带好处：英文也不再需要拆标点，「window.」只会命中「window」，
 * 句号天然留在高亮外面。
 *
 * 为什么返回纯数据而不返回 React 节点：一是 `.js` 里写 JSX 靠不住，
 * 二是纯数据函数能在评测用例里直接断言（见 server/eval），不用挂一个组件。
 * 文本和词都来自模型输出或用户输入，一律当不可信数据——见下面两道类型闸门。
 */

/**
 * @param {unknown} text 原文
 * @param {unknown} words 要高亮的词，通常是模型返回的引用
 * @returns {Array<{text: string, isMark: boolean}>} 按出现顺序排列的片段
 */
export function markSegments(text, words) {
  if (typeof text !== 'string' || text.length === 0) return [];

  const list = Array.isArray(words) ? words : [];
  if (list.length === 0) return [{ text, isMark: false }];

  const marks = [];
  const covered = [];

  for (const word of list) {
    if (typeof word !== 'string' || word.length === 0) continue;

    let from = 0;
    for (;;) {
      const index = text.indexOf(word, from);
      if (index === -1) break;

      const overlaps = covered.some(
        (span) => index < span.end && index + word.length > span.start,
      );

      if (!overlaps) {
        covered.push({ start: index, end: index + word.length });
        marks.push({ start: index, end: index + word.length, word });
        break;
      }
      from = index + 1;
    }
  }

  if (marks.length === 0) return [{ text, isMark: false }];

  marks.sort((a, b) => a.start - b.start);

  const segments = [];
  let cursor = 0;

  for (const mark of marks) {
    if (mark.start > cursor) {
      segments.push({ text: text.slice(cursor, mark.start), isMark: false });
    }
    segments.push({ text: mark.word, isMark: true });
    cursor = mark.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isMark: false });
  }

  return segments;
}
