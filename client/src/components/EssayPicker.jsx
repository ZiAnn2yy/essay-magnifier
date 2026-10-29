import { useEffect, useState } from 'react';
import './EssayPicker.css';
import { loadEssaysByGrade } from '../data/essayStore.js';

/**
 * 阶段一：选一篇范文，或者贴一篇你自己的。
 *
 * 两条路都重要：种子篇让人点开就看到东西；粘贴篇才是真实使用路径
 * （评委现场贴一篇也能拆），而且零版权风险——原文只在请求里流转，不落库。
 *
 * 粘贴的正文**原样进可编辑框**，没有"识别成草稿再确认"那一步：
 * 本期不接 OCR（生图端点未验证、OCR 端点不存在），不假装有拍照上传。
 *
 * 范文列表按年级**动态加载**（见 data/essayStore.js）。曾经整库静态 import，
 * 篇数一多主包就白白背上几百 KB；改成按年级分片后，只在选中那个年级时才下载。
 */
export default function EssayPicker({ grade, onPick, onBack }) {
  const [essays, setEssays] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    loadEssaysByGrade(grade)
      .then((list) => {
        if (!alive) return;
        setEssays(list);
        setLoaded(true);
      })
      .catch(() => {
        // 分片加载失败不该让这一屏变成空白——粘贴那条路照样能用
        if (!alive) return;
        setEssays([]);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [grade]);

  return (
    <section className="picker">
      <header className="picker-head">
        <button type="button" className="picker-back" onClick={onBack}>
          ← 换年级
        </button>
        <h2 className="picker-title">选一篇范文，或者贴一篇你自己的</h2>
        <p className="picker-sub">
          现在是{grade}年级，有 {essays.length} 篇可以拆。选一篇，或者把作文本上的一篇贴进来。
        </p>
      </header>

      {!loaded && <p className="picker-loading">在把这一年级的范文拿出来…</p>}

      {loaded && essays.length === 0 && (
        <p className="picker-loading">这一年级还没有内置范文。贴一篇你自己的，一样能拆。</p>
      )}

      <ul className="picker-list">
        {essays.map((essay) => (
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

function excerpt(text) {
  const flat = String(text ?? '').replace(/\n+/g, '');
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
