import { useState } from 'react';
import './TaskDock.css';
import { askReader } from '../api.js';

/**
 * 阶段三：用一招写自己的，然后给"读者"看。
 *
 * 这是产品的闭环——拆解不是终点，"用这一招写一句自己的"才是。
 * AI 在这里的身份是**读者**不是老师：它回应孩子刚写出的句子，
 * 不替他决定下一句写什么。这条边界由服务端 isReaderQuestion 兜底，
 * 也写进了 system prompt。
 *
 * 等 7 秒的那一下不做成转圈：按钮变"读者在读…"，并把等待说出来。
 * 真模型首 token 6.3s，藏是藏不住的，不如让它有性格。
 */
export default function TaskDock({ move, grade, essayTitle }) {
  const [text, setText] = useState('');
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    const own = text.trim();
    if (own.length === 0 || status === 'sending') return;

    setStatus('sending');
    setError('');
    try {
      const data = await askReader({
        moveName: move.name,
        essayTitle,
        childText: own,
      });
      setReply(data.reply);
      setStatus('done');
    } catch (submitted) {
      setError(submitted.message);
      setStatus('error');
    }
  }

  // 任务长度按年级分叉：三、四年级一两句就够，五、六年级到一小段。
  // 依据是课标——第三学段才要求"修改自己的习作"，篇幅要求本来就不同。
  const placeholder =
    grade >= 5
      ? `用「${move.name}」写一件你自己的事。可以多写几句，写成一小段。`
      : `用「${move.name}」写一件你自己的事。写一两句就行。`;

  return (
    <section className="dock">
      <header className="dock-head">
        <span className="dock-kicker">该你写了</span>
        <h3 className="dock-title">用「{move.name}」写你自己的</h3>
        <p className="dock-tip">{move.tryThis}</p>
      </header>

      <form className="dock-form" onSubmit={handleSubmit}>
        <textarea
          className="dock-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
          rows={4}
          disabled={status === 'sending'}
        />
        <button
          className="dock-submit"
          type="submit"
          disabled={status === 'sending' || text.trim().length === 0}
        >
          {status === 'sending' ? '读者在读…' : '给读者看看'}
        </button>
      </form>

      {status === 'sending' && (
        <p className="dock-waiting" role="status">
          读者读得很慢。他读的是你写的句子，不是标准答案。
        </p>
      )}

      {error && (
        <p className="dock-error" role="alert">
          {error}
        </p>
      )}

      {reply && (
        <div className="dock-reply">
          <span className="dock-reply-label">读者说</span>
          <p className="dock-reply-text">{reply}</p>
        </div>
      )}
    </section>
  );
}
