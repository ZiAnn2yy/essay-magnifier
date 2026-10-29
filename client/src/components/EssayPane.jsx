import './EssayPane.css';
import { markSegments } from '../lib/highlight.js';

/** 比对时忽略空白——换行和空格位置不稳定，逐个字符卡死会把格式差异当成不匹配 */
function normalize(text) {
  return String(text ?? '').replace(/\s+/g, '');
}

function paragraphIndexOf(quote, paragraphs) {
  const target = normalize(quote);
  if (target.length === 0) return -1;
  return paragraphs.findIndex((paragraph) => normalize(paragraph.text).includes(target));
}

/**
 * 范文正文。
 *
 * 拆解结果**不另起一张列表**，而是长在原文上：招式指着的那一句被荧光笔涂亮，
 * 点这句话就选中对应的招式卡片。产品要促成的那一步是"看清这一篇怎么写成的"，
 * 而那件事在认知上只能发生在句子上，不可能发生在句子的描述里。
 *
 * 荧光笔用 <em>，样式见 EssayPane.css——半透明黄 + 圆头，压得住字又不遮字。
 */
export default function EssayPane({
  title,
  paragraphs,
  moves,
  freshWords,
  activeMoveId,
  onSelectMove,
}) {
  return (
    <article className="essay">
      <header className="essay-head">
        <h3 className="essay-title">{title}</h3>
        <p className="essay-hint">涂黄的是范文里用了招的句子，点它看那一招。</p>
      </header>

      <div className="essay-body">
        {paragraphs.map((paragraph) => {
          const paragraphMoves = moves.filter(
            (move) => paragraphIndexOf(move.quote, paragraphs) === paragraph.index,
          );
          const paragraphWords = (freshWords ?? []).filter(
            (item) => paragraphIndexOf(item.word, paragraphs) === paragraph.index,
          );

          const marks = [
            ...paragraphMoves.map((move) => move.quote),
            ...paragraphWords.map((item) => item.word),
          ];

          return (
            <p className="essay-para" key={paragraph.index}>
              {markSegments(paragraph.text, marks).map((segment, index) =>
                segment.isMark ? (
                  <em
                    className={`essay-mark${
                      paragraphMoves.some((move) => move.quote === segment.text)
                        ? ' is-move'
                        : ' is-word'
                    }`}
                    key={`${paragraph.index}-${index}`}
                    onClick={() => {
                      const move = paragraphMoves.find((item) => item.quote === segment.text);
                      if (move) onSelectMove?.(move.id);
                    }}
                  >
                    {segment.text}
                  </em>
                ) : (
                  <span key={`${paragraph.index}-${index}`}>{segment.text}</span>
                ),
              )}
            </p>
          );
        })}
      </div>

      {activeMoveId && (
        <p className="essay-active" role="status">
          正在看第 {moves.findIndex((move) => move.id === activeMoveId) + 1} 招
        </p>
      )}
    </article>
  );
}
