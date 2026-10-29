import { forwardRef } from 'react';
import './AskDock.css';

/**
 * 底部问答区：读者的回应 + 孩子写这一句。
 *
 * 两个刻意的设计：
 *
 * 1. **问题分三种语气**（`question.kind`）：
 *    - `cheer`  只庆祝。低年级专用，课标第一学段只要"乐于运用"，
 *                不施加质量标准
 *    - `reader` 读者提问。产品的主要形态
 *    - `revise` 请孩子回看自己写的。偶尔出现，不一直往前赶
 *
 * 2. **没有句型填空。** 用户明确否决过 `它______得像______` 这种——
 *    一眼就是填空游戏，不是智能体。智能体的可感性必须来自
 *    它读了孩子的原句并据此回应。
 */
const AskDock = forwardRef(function AskDock(
  {
    question,
    draft,
    onDraftChange,
    onSubmit,
    submitLabel = '写好了',
    isThinking,
    isDirecting,
    onPlay,
    frameCount,
  },
  inputRef,
) {
  const canSubmit = draft.trim().length > 0 && !isThinking;

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (canSubmit) onSubmit();
    }
  };

  return (
    <section className={`dock dock-${question.kind ?? 'reader'}`}>
      <div className="dock-ask">
        <p className="dock-q">{question.text}</p>
      </div>

      <div className="dock-row">
        <input
          ref={inputRef}
          className="dock-input"
          type="text"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="把你想到的那句写下来…"
          enterKeyHint="send"
          autoComplete="off"
          disabled={isThinking}
          aria-label="写下这一句"
        />

        <button
          type="button"
          className="dock-submit"
          onClick={onSubmit}
          disabled={!canSubmit}
        >
          {isThinking ? '在想…' : submitLabel}
        </button>

        <button
          type="button"
          className="dock-play"
          onClick={onPlay}
          disabled={frameCount === 0 || isDirecting}
        >
          {isDirecting ? '排画面中…' : '放给他们看！'}
        </button>
      </div>
    </section>
  );
});

export default AskDock;
