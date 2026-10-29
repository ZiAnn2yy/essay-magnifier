import './Screen.css';

/**
 * 把句子里被智能体挑中的词包进 <em>，让荧光笔只落在这些词上。
 *
 * 中文没有空格，所以不能按词切分，只能**子串定位**：拿挑中的词回句子里
 * 找第一次出现的位置，把那一截包起来。两个细节：
 *
 * 1. **区间去重**——「金黄」和「金灿灿」可能压在同一处，也可能一个套在
 *    另一个里。先占住的区间不让后面的词再切进去，否则会切出嵌套的 <em>。
 * 2. **按出现顺序输出**——荧光笔要顺着读句子的方向依次亮，不是按词库顺序。
 *
 * 顺带好处：英文也不再需要拆标点，「window.」只会命中「window」，
 * 句号天然留在荧光笔外面。
 */
function renderSentence(sentence, picks) {
  const list = Array.isArray(picks) ? picks : [];
  if (list.length === 0) return sentence;

  const marks = [];
  const covered = [];

  for (const word of list) {
    if (typeof word !== 'string' || word.length === 0) continue;

    let from = 0;
    for (;;) {
      const index = sentence.indexOf(word, from);
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

  if (marks.length === 0) return sentence;

  marks.sort((a, b) => a.start - b.start);

  const nodes = [];
  let cursor = 0;

  marks.forEach((mark, markIndex) => {
    if (mark.start > cursor) {
      nodes.push(
        <span key={`text-${markIndex}`}>{sentence.slice(cursor, mark.start)}</span>,
      );
    }
    nodes.push(<em key={`mark-${markIndex}`}>{mark.word}</em>);
    cursor = mark.end;
  });

  if (cursor < sentence.length) {
    nodes.push(<span key="tail">{sentence.slice(cursor)}</span>);
  }

  return nodes;
}

/**
 * 大银幕：当前这一句被放大成"画面"。
 *
 * 这是整个产品的兑现点——孩子写的不是一行字，是一格电影。
 * 所以英语原句必须是绝对主角（Fredoka 超粗、最大字号），
 * 中文意思退成字幕，界面 chrome 全部让位。
 */
export default function Screen({ frame, index, total, picksEnabled }) {
  if (!frame) {
    return (
      <section className="screen screen-empty">
        <p className="screen-empty-text">第一格，写什么？</p>
        <p className="screen-empty-sub">把你最先想到的那句写下来</p>
      </section>
    );
  }

  // 挑不挑词在**渲染时**按年级决定，不存进数据。
  // 存进去的话，中途改年级就会出现"这一格亮、那一格不亮"的撕裂状态；
  // 而且种子里写死的 picks 会绕过学段开关（这个 bug 真犯过）。
  const picks = picksEnabled && frame.picks ? frame.picks : [];

  return (
    <section className="screen" aria-live="polite">
      <span className="screen-tag en">
        {index + 1} / {total}
      </span>

      {/* key 让换格时整个节点重建，滑入和荧光笔动画才会重放 */}
      <div key={frame.id} className="screen-body">
        <p className="screen-text">{renderSentence(frame.text, picks)}</p>
      </div>

      {/* 底部信息带：银幕的"下沿"。
          有挑中的词才显示这一带——低年级恒为空，那整带就不出现，
          银幕只做一件事：让孩子看见自己写的字被放大了。 */}
      {picks.length > 0 && (
        <div className="screen-foot">
          <div className="screen-picks">
            <span className="screen-picks-label">有新鲜感的词</span>
            <span className="screen-picks-list">
              {picks.map((word, pickIndex) => (
                <span
                  className="screen-pick"
                  key={`${word}-${pickIndex}`}
                  style={{ animationDelay: `${0.3 + pickIndex * 0.14}s` }}
                >
                  {word}
                </span>
              ))}
            </span>
          </div>
        </div>
      )}

      {/* 改过的格子要留痕。课标把"修改自己的习作"放在核心位置，
          所以"我改过这一句"必须看得见，不能悄悄覆盖掉 */}
      {frame.revision > 0 && (
        <span className="screen-rev" title={frame.previous ?? ''}>
          改过 {frame.revision} 次
        </span>
      )}

      <span className="screen-corner" aria-hidden="true">
        ▸
      </span>
    </section>
  );
}
