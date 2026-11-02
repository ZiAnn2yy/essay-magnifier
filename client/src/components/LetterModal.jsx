import { useEffect, useRef, useState } from 'react';
import './LetterModal.css';
import { askFollowUp } from '../api.js';

/**
 * 回信放大镜。
 *
 * 用户 10-30 的原话：「回信出结果的时候，先放大到屏幕中间，然后点击右上角的图标，
 * 可以是×，可以是-，然后放回到这个位置，要不然太小了。」
 * 10-31 问定四件事：**只放一个 ×**（× 和 − 是同一个动作，别放两个按钮做同一件事）；
 * 收回后 **dock 里不留信纸**，顶栏出一个回信入口；**多封能翻看每一封**；
 * 「收进作文本」按钮留在 dock 不动。
 *
 * ## 为什么信纸横线要用 CSS 变量
 *
 * 信纸的横线是 `repeating-linear-gradient` 每 28px 一条，正文 `line-height: 28px`，
 * 所以每行正好落在一条格线上。**放大容器时如果只放大容器、不同步放大字号行高，
 * 横线间距不变而每行还是 28px，格线会突然变密**——这是这个需求里最容易翻车的一处。
 * 所以横线间距和行高都由 `--letter-line` / `--letter-size` 一对变量驱动，
 * 模态里只改这一对，两者永远同步。
 *
 * ## 横线为什么从卡片挪到正文 <p> 上
 *
 * 原来横线画在 `.letter` 卡片上，而卡片有 padding——于是第一行的行盒顶在
 * padding 之下，固定偏移约半个行高，每行其实都压在两条线中间。一直没人发现
 * 是因为线只有 14% 透明度。挪到正文 `<p>` 自己身上后，行盒从内容盒顶部开始排，
 * 线正好落在每行底部，跟真正的横格纸一致。
 *
 * ## 无障碍
 *
 * 项目里 Esc / focus trap / 焦点还原**零先例**（册子面板 `.an-book-panel`
 * 是个无遮罩贴角抽屉，没有这些），所以这里自己写：Esc 关闭、Tab 在对话框内循环、
 * 打开时焦点移进去、关闭后焦点还给来源元素。
 *
 * ## 追问：关上就锁（2026-11-02 加，用户要的）
 *
 * 信还**活着**的时候，孩子能接着问，读者当场答，问答都记在这封信里。
 * **关上那一刻它就锁了**——之后从顶栏或 dock 再打开只能读，不能再问。
 *
 * 为什么：用户要的是「引起兴趣」加「让孩子们把握当下」。回信来了那一刻
 * 是孩子最想说话的瞬间，那个瞬间过去了就不再补票。否则「回头再聊」
 * 等于永远不聊，而追问本来是这套产品里最能撬动写作的那一下——
 * 他为了接着问，得先想清楚自己想问什么。
 * 锁只是不再增长，问过答过的都还在，随时能翻回去看。
 */

/** 焦点陷阱：Tab 在这个对话框内循环，不跑到背后的页面上。 */
function useFocusTrap(active, containerRef) {
  useEffect(() => {
    if (!active) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    function onKeyDown(event) {
      if (event.key !== 'Tab') return;
      const focusable = container.querySelectorAll(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    container.addEventListener('keydown', onKeyDown);
    return () => container.removeEventListener('keydown', onKeyDown);
  }, [active, containerRef]);
}

export default function LetterModal({
  letters,
  index,
  open,
  onIndexChange,
  onClose,
  sourceRef,
  onFollowUp,
  onSeal,
}) {
  const cardRef = useRef(null);
  const dialogRef = useRef(null);
  const [closing, setClosing] = useState(false);
  // 追问的那一句。切信时清空——上一封没问完的话不该跟到下一封去
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [askError, setAskError] = useState('');
  const current = letters[index] ?? null;
  const total = letters.length;
  // 旧数据没有 live 字段。按锁着读——宁可少一个功能，不要给出一个
  // 关不掉的追问入口
  const live = current?.live === true;
  const turns = Array.isArray(current?.followUps) ? current.followUps : [];

  // 进场：从来源元素的位置放大到屏幕中央（FLIP——先量起点终点，
  // 把元素定位到起点，下一帧再移到终点，中间交给 transition）。
  // 不引动画库，和 lib/flyTo.js 同一个思路。
  useEffect(() => {
    if (!open) {
      setClosing(false);
      return undefined;
    }
    const card = cardRef.current;
    if (!card) return undefined;

    const from = sourceRef?.current?.getBoundingClientRect();
    const to = card.getBoundingClientRect();
    if (!from || from.width === 0) return undefined; // 没有来源（比如顶栏入口）就淡入

    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    // 缩得太小中间几帧完全读不了，钳到 0.14——那个"被放大"的感觉主要来自位移
    const scale = Math.max(from.width / to.width, 0.14);

    card.style.transition = 'none';
    card.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    card.style.opacity = '0.35';
    const raf = requestAnimationFrame(() => {
      card.style.transition =
        'transform .46s cubic-bezier(.34,1.4,.64,1), opacity .3s ease-out';
      card.style.transform = 'none';
      card.style.opacity = '1';
    });
    return () => cancelAnimationFrame(raf);
    // 只在开关时跑。翻页不重跑——否则每翻一页整封信都要重新飞一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 打开时焦点移进去，关掉之后还给来源元素
  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open]);

  // 换一封就把没问完的那句清掉。上一封没发送的话不该跟到下一封去——
  // 孩子会以为那句是问新一封的
  useEffect(() => {
    setQuestion('');
    setAskError('');
  }, [current?.id]);

  useFocusTrap(open, dialogRef);

  // Esc 关闭，左右方向键翻页
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
      } else if (event.key === 'ArrowLeft' && index > 0) {
        onIndexChange(index - 1);
      } else if (event.key === 'ArrowRight' && index < total - 1) {
        onIndexChange(index + 1);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, total, onIndexChange]);

  /**
   * 出场：反向缩回来源位置，动画结束再真的关掉。
   * 只做进场不做出场会显得"被吞掉"——用户明确要求"放回到这个位置"。
   *
   * **关上就锁**：这一刻调用 onSeal，这封信从此只能读。见文件头那节。
   */
  function requestClose() {
    // 先锁再走动画。锁是状态更新，动画是 DOM 操作，两件事互不依赖
    if (current && live) onSeal?.(current.id);
    const card = cardRef.current;
    const from = sourceRef?.current?.getBoundingClientRect();
    if (!card || !from || from.width === 0 || closing) {
      onClose();
      return;
    }
    setClosing(true);
    const to = card.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const scale = Math.max(from.width / to.width, 0.14);
    card.style.transition = 'transform .38s cubic-bezier(.4,0,.6,1), opacity .3s ease-in';
    card.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    card.style.opacity = '0';
    window.setTimeout(onClose, 380);
  }

  if (!open || !current) return null;

  /**
   * 问一句，读者当场答。
   *
   * 即刻回信：答案就地回到这一封里，不长等、不另起一封信。
   * 输入框在等的时候不禁用文字、只禁用提交——孩子可以接着想下一句，
   * 但那一句要等这一轮答完才发得出去（sending 闸门在 handleAsk 里）。
   */
  async function handleAsk() {
    const ask = question.trim();
    if (ask.length === 0 || sending) return;
    setSending(true);
    setAskError('');
    try {
      const data = await askFollowUp({
        moveName: current.moveName,
        essayTitle: current.essayTitle,
        mySentence: current.mySentence,
        reply: current.reply,
        question: ask,
      });
      // 由上层落盘。这里不直接碰 letterStore——信的数组归 Analyzer 管
      onFollowUp?.(current.id, ask, data.answer);
      setQuestion('');
    } catch (submitted) {
      setAskError(submitted.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="lm-backdrop" onMouseDown={(event) => {
      // 点遮罩关闭。用 mousedown 而不是 click：按下去那一刻就该有反应，
      // 否则在遮罩上按下、拖进卡片里松手也会触发，行为说不清楚。
      if (event.target === event.currentTarget) requestClose();
    }}>
      <div
        className="lm-card"
        role="dialog"
        aria-modal="true"
        aria-label={`读者的回信，第 ${index + 1} 封，共 ${total} 封`}
        tabIndex={-1}
        ref={(node) => {
          cardRef.current = node;
          dialogRef.current = node;
        }}
      >
        <header className="lm-head">
          <span className="lm-label">
            来自读者的回信
            {/* 这一句是给孩子看的提示：现在还能聊。锁了之后它消失，
                换成下面那句"收起来了" */}
            {live && turns.length === 0 && <em className="lm-live">他还在，能问一句</em>}
          </span>
          {/* 右上角只有一个 ×。× 和 − 是同一个动作（收回原位），
              放两个按钮做同一件事只会让人猜哪个是真的 */}
          <button type="button" className="lm-close" onClick={requestClose} aria-label="收起回信">
            ×
          </button>
        </header>

        <div className="lm-scroll">
          <article className="letter lm-letter">
            <p className="letter-body">{current.reply}</p>
            <footer className="letter-sign">—— 你的读者</footer>
          </article>

          {/* 引出这封信的那一句。它是回信的上下文——读者说的是"这一句"，
              不显示的话，回信里那些"这里""那一处"就指不着了 */}
          {current.mySentence && (
            <div className="lm-mine">
              <span className="lm-mine-label">你写的那句</span>
              <p className="lm-mine-text">{current.mySentence}</p>
            </div>
          )}

          {/* 追问的记录。问的和答的都留着——孩子翻回去看的是这段对话，
              不只是当初那封信。没有这一条时整个区域不渲染 */}
          {turns.map((turn, turnIndex) => (
            <div className="lm-turn" key={`${turn.at}-${turnIndex}`}>
              <p className="lm-turn-ask">
                <span className="lm-turn-who">你问</span>
                {turn.ask}
              </p>
              <p className="lm-turn-answer">
                <span className="lm-turn-who">读者答</span>
                {turn.answer}
              </p>
            </div>
          ))}

          {sending && (
            <p className="lm-turn-waiting" role="status">
              他正想怎么回你…
            </p>
          )}

          {askError && !sending && (
            <p className="lm-turn-error" role="alert">
              {askError}
            </p>
          )}
        </div>

        {/* 追问入口。只在信还活着的时候出现——关上就不再补票 */}
        {live ? (
          <form
            className="lm-ask"
            onSubmit={(event) => {
              event.preventDefault();
              handleAsk();
            }}
          >
            <input
              className="lm-ask-input"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="想问读者什么？"
              maxLength={200}
              disabled={sending}
              aria-label="想问读者什么"
            />
            <button
              type="submit"
              className="lm-ask-btn"
              disabled={sending || question.trim().length === 0}
            >
              {sending ? '在问了…' : '问'}
            </button>
          </form>
        ) : (
          <p className="lm-sealed">这封信收起来了，留着看，不能再回。</p>
        )}

        {/* 翻页只在多封时出现。单封时这个区域整个不渲染——
            空白的导航条会让人以为还有别的东西没找到 */}
        {total > 1 && (
          <footer className="lm-nav">
            <button
              type="button"
              className="lm-nav-btn"
              onClick={() => onIndexChange(index - 1)}
              disabled={index === 0}
            >
              ← 上一封
            </button>
            <span className="lm-nav-count">
              第 {index + 1} 封 / 共 {total} 封
            </span>
            <button
              type="button"
              className="lm-nav-btn"
              onClick={() => onIndexChange(index + 1)}
              disabled={index === total - 1}
            >
              下一封 →
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
