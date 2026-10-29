import { useCallback, useEffect, useRef, useState } from 'react';
import './Screening.css';

const FRAME_MS = 4200;

/** 每格一轮的色相。四色轮转，避免整场电影一个颜色看到尾 */
const WASHES = [
  { accent: 'var(--orange)', wash: 'rgba(255,107,53,.22)' },
  { accent: 'var(--yellow)', wash: 'rgba(255,210,63,.2)' },
  { accent: 'var(--pink)', wash: 'rgba(255,93,143,.22)' },
  { accent: 'var(--cyan)', wash: 'rgba(46,196,230,.2)' },
];

/**
 * 放映模式：「放给他们看！」
 *
 * 这是正向激励的兑现点——孩子写的东西被当成一部片子放出来。
 *
 * 关于"画面"：本模式**不生成图片或视频**。每一格的画面由排版、色罩和
 * 动效构成——孩子的句子是绝对主角，关键词逐字点亮。这不是权宜之计，
 * 是刻意的选择：三个胶卷方向都不押注生图/生视频 API，若之后接入
 * Kimi 也只是在这一层加一层，不改变放映模式本身成立。
 */
export default function Screening({ frames, title, onClose, picksEnabled }) {
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isEnded, setIsEnded] = useState(false);
  const closeRef = useRef(null);

  const total = frames.length;
  const isLast = index === total - 1;

  const goNext = useCallback(() => {
    setIndex((prev) => {
      if (prev >= total - 1) {
        setIsEnded(true);
        setIsPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, [total]);

  const goPrev = useCallback(() => {
    setIsEnded(false);
    setIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const restart = useCallback(() => {
    setIndex(0);
    setIsEnded(false);
    setIsPlaying(true);
  }, []);

  // 自动放映
  useEffect(() => {
    if (!isPlaying || isEnded) return undefined;
    const timer = setTimeout(goNext, FRAME_MS);
    return () => clearTimeout(timer);
  }, [isPlaying, isEnded, index, goNext]);

  // 键盘：Esc 退出，左右翻格，空格暂停
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') goNext();
      if (event.key === 'ArrowLeft') goPrev();
      if (event.key === ' ') {
        event.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, goNext, goPrev]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  if (total === 0) return null;

  const frame = frames[index];
  // 与 Screen 同一条规则：挑不挑词在渲染时按年级决定，不存进数据
  const showPicks = picksEnabled && frame.picks ? frame.picks : [];
  const wash = WASHES[index % WASHES.length];

  return (
    <div
      className="show"
      role="dialog"
      aria-modal="true"
      aria-label={`放映：${title}`}
      style={{ '--accent': wash.accent, '--wash': wash.wash }}
    >
      {/* 色罩：这一格的色调。pointer-events:none 让它纯粹是背景 */}
      <div className="show-wash" aria-hidden="true" />

      <header className="show-top">
        <span className="show-title">{title}</span>
        <span className="show-counter en">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          className="show-close"
          onClick={onClose}
          ref={closeRef}
        >
          退出放映
        </button>
      </header>

      {/* 总进度：把"还剩多少"画成面积 */}
      <div className="show-progress" aria-hidden="true">
        {frames.map((f, i) => (
          <span key={f.id} className={i <= index ? 'is-done' : ''} />
        ))}
      </div>

      {isEnded ? (
        <section className="show-end">
          <p className="show-end-kicker">全片完</p>
          <h2 className="show-end-title">{title}</h2>
          <p className="show-end-sub">
            一共 {total} 格，全是你自己写出来的。
          </p>
          <div className="show-end-actions">
            <button type="button" className="show-btn" onClick={restart}>
              再放一次
            </button>
            <button
              type="button"
              className="show-btn is-ghost"
              onClick={onClose}
            >
              回去继续写
            </button>
          </div>
        </section>
      ) : (
        <section className="show-stage" key={frame.id}>
          <div className="show-frame">
            <p className="show-text">{frame.text}</p>
          </div>

          {/* 挑中的词逐个浮出来，像片尾字幕。低年级没有挑中的词，这一块就不出现 */}
          {showPicks.length > 0 && (
            <div className="show-picks">
              {showPicks.map((word, i) => (
                <span
                  className="show-pick"
                  key={`${word}-${i}`}
                  style={{ animationDelay: `${0.5 + i * 0.28}s` }}
                >
                  {word}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <footer className="show-bottom">
        <button
          type="button"
          className="show-btn is-ghost"
          onClick={goPrev}
          disabled={index === 0}
        >
          ← 上一格
        </button>

        <button
          type="button"
          className="show-btn"
          onClick={() => setIsPlaying((prev) => !prev)}
        >
          {isPlaying && !isEnded ? '暂停' : '播放'}
        </button>

        <button
          type="button"
          className="show-btn is-ghost"
          onClick={goNext}
          disabled={isLast}
        >
          下一格 →
        </button>
      </footer>
    </div>
  );
}
