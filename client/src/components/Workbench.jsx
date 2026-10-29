import { useCallback, useEffect, useRef, useState } from 'react';
import './Workbench.css';
import Screen from './Screen.jsx';
import Reel from './Reel.jsx';
import AskDock from './AskDock.jsx';
import ThinkLoader from './ThinkLoader.jsx';
import Screening from './Screening.jsx';
import { STAGES, getSeedFilm, mockRespond, makeRevision } from '../data/mockFilm.js';
import { shouldPickWords } from '../data/writingBands.js';

/** 一格都没有时的开局问题。低年级也用这句——它不预设任何内容 */
const OPENING_QUESTION = {
  id: 'q0',
  text: '你想给谁看这篇东西？把最先想到的那句写下来。',
  kind: 'reader',
};

/** 片名：孩子给自己这篇电影起的名字。可以改，改完立刻生效。 */
function FilmTitle({ value, onChange }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const commit = () => {
    const next = draft.trim();
    if (next.length > 0) onChange(next);
    else setDraft(value);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className="wb-title-input"
        value={draft}
        maxLength={20}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') {
            setDraft(value);
            setIsEditing(false);
          }
        }}
        aria-label="给这部片子起个名字"
      />
    );
  }

  return (
    <button
      type="button"
      className="wb-title-btn"
      onClick={() => {
        setDraft(value);
        setIsEditing(true);
      }}
      title="点一下可以改片名"
    >
      《{value}》
    </button>
  );
}

/**
 * 胶卷工作台：产品的主界面，也是"引导写作"这一半。
 *
 * 一屏四区，从上到下：
 *   顶栏  片名 + 已写几格 + 年级
 *   银幕  当前这一句被放大成画面（flex:1，吃掉所有剩余高度）
 *   胶卷  一句一格，越来越长，空格虚线吊胃口
 *   问答  读者的回应 + 孩子写这一句 + 「放给他们看！」
 *
 * 立场的说明见 data/mockFilm.js 文件头：智能体在这里是**读者**不是老师。
 */
export default function Workbench({ grade, onGradeChange }) {
  const seed = getSeedFilm(grade);
  const [frames, setFrames] = useState(seed.frames);
  const [activeId, setActiveId] = useState(
    seed.frames[seed.frames.length - 1].id,
  );
  const [lastAddedId, setLastAddedId] = useState(null);
  const [question, setQuestion] = useState(seed.question);
  const [filmTitle, setFilmTitle] = useState(seed.title);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(null);
  const [isScreening, setIsScreening] = useState(false);
  // 导演产出的分镜：{ tone, panels:[{frameId,assetId}] }。null = 纯排版放映
  const [storyboard, setStoryboard] = useState(null);
  const [isDirecting, setIsDirecting] = useState(false);
  const inputRef = useRef(null);
  const picksEnabled = shouldPickWords(grade);

  const activeIndex = frames.findIndex((frame) => frame.id === activeId);
  const activeFrame = activeIndex >= 0 ? frames[activeIndex] : null;
  const isLatest = activeIndex === frames.length - 1;
  const isThinking = pending !== null;

  const handleSubmit = useCallback(() => {
    const text = draft.trim();
    if (text.length === 0 || isThinking) return;

    // 先算结果，再播加载框——真接口下是服务端流式返回、前端逐步揭示，
    // 这里 mock 版本把两步合成一步，但前端"逐步揭示"的职责不变。
    setPending({ sentence: text, ...mockRespond(text, grade, frames.length + 1) });
    setDraft('');
  }, [draft, isThinking, grade, frames.length]);

  const handleThinkDone = useCallback(() => {
    if (!pending) return;

    setFrames((prev) => [...prev, pending.frame]);
    setActiveId(pending.frame.id);
    setLastAddedId(pending.frame.id);
    setQuestion(pending.question);
    setPending(null);

    // 焦点回输入框，孩子可以接着写下一句，不用再点一次
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [pending]);

  /**
   * 改这一格。课标把"修改自己的习作"放在表达与交流的核心位置，
   * 所以胶卷必须能改，而且**改前改后都留着**——"我改了什么"要看得见。
   */
  const handleRevise = useCallback(() => {
    const text = draft.trim();
    if (text.length === 0 || activeIndex < 0) return;

    setFrames((prev) =>
      prev.map((frame, index) =>
        index === activeIndex ? makeRevision(frame, text) : frame,
      ),
    );
    setDraft('');
    setQuestion({
      id: `r${activeIndex}`,
      text: '改好了。两版都留着，你可以自己比一比哪儿不一样。',
      kind: 'cheer',
    });
  }, [draft, activeIndex]);

  /**
   * 「放给他们看！」：进放映前先请导演排画面。
   *
   * 分镜是一次性旁路调用，不进对话历史。任何失败（网络/超时/返回不合法）
   * 都不拦放映——storyboard 留空，Screening 回退纯排版，孩子照样看片。
   */
  const handlePlay = useCallback(async () => {
    if (frames.length === 0 || isDirecting) return;
    setIsDirecting(true);
    try {
      const res = await fetch('/api/v2/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade,
          filmTitle,
          frames: frames.map((f) => ({ id: f.id, text: f.text })),
        }),
      });
      const data = await res.json();
      if (data.ok && data.storyboard) setStoryboard(data.storyboard);
    } catch {
      // 静默降级：放映不因分镜失败而中断
    } finally {
      setIsDirecting(false);
      setIsScreening(true);
    }
  }, [frames, grade, filmTitle, isDirecting]);

  const activeQuestion = frames.length === 0 ? OPENING_QUESTION : question;

  return (
    <main className="wb">
      <header className="wb-head">
        <h1 className="wb-h1">我的小电影</h1>
        <FilmTitle value={filmTitle} onChange={setFilmTitle} />
        <span className="wb-count">已写 {frames.length} 格</span>

        <div className="wb-stages" role="group" aria-label="年级">
          {STAGES.map((stage) => (
            <span className="wb-stage-group" key={stage.id}>
              {stage.grades.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={item === grade ? 'is-on' : ''}
                  onClick={() => onGradeChange(item)}
                  aria-label={`${item} 年级`}
                >
                  {item}
                </button>
              ))}
            </span>
          ))}
        </div>
      </header>

      <Screen
        frame={activeFrame}
        index={activeIndex}
        total={frames.length}
        picksEnabled={picksEnabled}
      />

      <Reel
        frames={frames}
        activeId={activeId}
        lastAddedId={lastAddedId}
        onSelect={setActiveId}
      />

      <div className="wb-dock">
        <AskDock
          ref={inputRef}
          question={activeQuestion}
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={isLatest ? handleSubmit : handleRevise}
          submitLabel={isLatest ? '写好了' : '改成这句'}
          isThinking={isThinking}
          isDirecting={isDirecting}
          onPlay={handlePlay}
          frameCount={frames.length}
        />

        {isThinking && (
          <ThinkLoader
            sentence={pending.sentence}
            picks={picksEnabled ? pending.frame.picks : []}
            onDone={handleThinkDone}
          />
        )}
      </div>

      {isScreening && (
        <Screening
          frames={frames}
          title={filmTitle}
          picksEnabled={picksEnabled}
          storyboard={storyboard}
          onClose={() => {
            setIsScreening(false);
            setStoryboard(null);
          }}
        />
      )}
    </main>
  );
}
