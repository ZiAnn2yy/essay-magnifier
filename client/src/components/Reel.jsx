import './Reel.css';

/** 胶卷固定显示的总格数：写满的 + 空格。空格是吊胃口的，不能没有 */
const TOTAL_SLOTS = 6;

/**
 * 胶卷：一句一格，连成一条带子。
 *
 * 空格用虚线画出来，而且明说"下一格写什么"——成果要越攒越多，
 * 但也要让人看见还剩多少位置，否则"丰盛感"只是空话。
 */
export default function Reel({ frames, activeId, lastAddedId, onSelect }) {
  const blanks = Math.max(0, TOTAL_SLOTS - frames.length);

  return (
    <div className="reel" role="tablist" aria-label="已写下的句子">
      <div className="reel-cells">
        {frames.map((frame, index) => {
          const isActive = frame.id === activeId;
          const isNew = frame.id === lastAddedId;

          return (
            <button
              type="button"
              key={frame.id}
              role="tab"
              aria-selected={isActive}
              title={frame.text}
              className={`reel-cell${isActive ? ' is-active' : ''}${
                isNew ? ' is-new' : ''
              }`}
              onClick={() => onSelect(frame.id)}
            >
              <span className="reel-num">{index + 1}</span>
              {frame.text}
            </button>
          );
        })}

        {Array.from({ length: blanks }, (_, index) => (
          <span
            className="reel-blank"
            key={`blank-${index}`}
            aria-hidden="true"
          >
            {index === 0 ? '下一格' : '待续'}
          </span>
        ))}
      </div>
    </div>
  );
}
