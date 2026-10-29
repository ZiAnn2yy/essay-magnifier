import './EssayPicker.css';
import { ESSAYS } from '../data/essays.js';

/**
 * 阶段一：选一篇范文，或者贴一篇自己的。
 *
 * 两条路都重要：种子篇让人点开就看到东西；粘贴篇才是真实使用路径
 * （评委现场贴一篇也能拆），而且零版权风险——原文只在请求里流转，不落库。
 *
 * 粘贴的正文**原样进可编辑框**，没有"识别成草稿再确认"那一步：
 * 本期不接 OCR（生图端点未验证、OCR 端点不存在），不假装有拍照上传。
 */
export default function EssayPicker({ grade, onPick, onBack }) {
  return (
    <section className="picker">
      <header className="picker-head">
        <button type="button" className="picker-back" onClick={onBack}>
          ← 换年级
        </button>
        <h2 className="picker-title">选一篇范文，或者贴一篇你自己的</h2>
        <p className="picker-sub">
          现在是{grade}年级。选一篇示例，或者把作文本上的一篇贴进来。
        </p>
      </header>

      <ul className="picker-list">
        {essaysFor(grade).map((essay) => (
          <li key={essay.id}>
            <button type="button" className="picker-card" onClick={() => onPick(essay)}>
              <span className="picker-card-title">{essay.title}</span>
              <span className="picker-card-meta">
                {essay.topic} · {essay.grade}年级 · {essay.sourceLabel}
              </span>
              <span className="picker-card-excerpt">{excerpt(essay.text)}</span>
            </button>
          </li>
        ))}
      </ul>

      <PasteBox onPick={onPick} />
    </section>
  );
}

/** 示例不按年级卡死——就近推荐：同年级的排前面，其余也能选 */
function essaysFor(grade) {
  return [...ESSAYS].sort((a, b) => Math.abs(a.grade - grade) - Math.abs(b.grade - grade));
}

function excerpt(text) {
  const flat = text.replace(/\n+/g, '');
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat;
}

function PasteBox({ onPick }) {
  function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = String(form.get('text') ?? '').trim();
    const title = String(form.get('title') ?? '').trim();
    if (text.length === 0) return;
    onPick({ title: title || '贴进来的一篇', text, sourceLabel: '你贴进来的', grade: null });
    event.currentTarget.reset();
  }

  return (
    <form className="picker-paste" onSubmit={handleSubmit}>
      <h3 className="picker-paste-title">贴一篇</h3>
      <input
        className="picker-paste-title-input"
        name="title"
        type="text"
        placeholder="题目（可不填）"
        maxLength={40}
      />
      <textarea
        className="picker-paste-area"
        name="text"
        rows={7}
        placeholder="把作文贴在这里。换行的地方会被当成段落。"
        required
      />
      <button className="picker-paste-submit" type="submit">
        拆开这篇
      </button>
    </form>
  );
}
