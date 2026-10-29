import { useEffect, useMemo, useRef, useState } from 'react';
import './ThinkLoader.css';

const TIPS = [
  '小知识：句子里的名词和颜色，最容易变成画面。',
  '小知识：写得越具体，做出来的那一格越好看。',
  '小知识：一句只说一件事，画面会更清楚。',
  '小知识：加上看起来、听起来、闻起来，句子就活了。',
];

const READ_STEP_MS = 130;
const READ_DELAY_MS = 220;
const PICK_STEP_MS = 280;
const THINK_MS = 900;

/**
 * 游戏化加载框：透明、覆盖整块问答区。
 *
 * 它一次解决两件事——填满模型思考的那几秒，以及让"智能体在干活"被看见。
 * 评委最想看到的就是智能体做了什么，而等待时屏幕上放的正是
 * 「它在读你的句子、在挑词、在想该问你什么」，不需要口头解释。
 *
 * 关于时序：真接口下这几步是服务端流式返回的，前端负责把已到达的阶段
 * 显示出来。现在是 mock，所以整段结果是提交时就拿到的，这里做的是
 * **把分析过程逐步揭示**——和真接口下前端要做的事是同一件。
 */
export default function ThinkLoader({ sentence, picks, onDone }) {
  const words = useMemo(
    () => (sentence ?? '').split(/\s+/).filter(Boolean),
    [sentence],
  );
  const safePicks = picks ?? [];

  // 没有可读的句子时不能卡在加载态：onDone 不触发，输入框会被永久盖住。
  // 所以直接走完时间轴，让上层尽快收尾。
  const isEmpty = words.length === 0;

  const [readCount, setReadCount] = useState(0);
  const [shownPicks, setShownPicks] = useState([]);
  const [phase, setPhase] = useState('read');
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);

  // onDone 用 ref 接住，避免它作为依赖让整个时间轴重启
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));

    // 空句子：不给时间轴，立刻收尾（见 isEmpty 的说明）
    if (isEmpty) {
      at(60, () => {
        setPhase('done');
        doneRef.current();
      });
      return () => timers.forEach(clearTimeout);
    }

    // ① 逐个词被"读"过
    words.forEach((_, index) => {
      at(READ_DELAY_MS + index * READ_STEP_MS, () => setReadCount(index + 1));
    });

    const pickStart = READ_DELAY_MS + words.length * READ_STEP_MS + 320;

    // ② 挑出能变成画面的词，飞进托盘
    at(pickStart, () => setPhase('pick'));
    safePicks.forEach((_, index) => {
      at(pickStart + 140 + index * PICK_STEP_MS, () => {
        setShownPicks((prev) => [...prev, safePicks[index]]);
      });
    });

    // ③ 想该问什么
    const thinkStart =
      pickStart + 140 + Math.max(safePicks.length, 1) * PICK_STEP_MS + 380;
    at(thinkStart, () => setPhase('think'));

    // ④ 想好了
    at(thinkStart + THINK_MS, () => {
      setPhase('done');
      doneRef.current();
    });

    return () => timers.forEach(clearTimeout);
  }, [words, safePicks, isEmpty]);

  // 进度条：读完 45%，挑完 75%，想好 100%
  const progress = Math.min(
    100,
    Math.round(
      (readCount / Math.max(words.length, 1)) * 45 +
        (shownPicks.length / Math.max(safePicks.length, 1)) * 30 +
        (phase === 'think' || phase === 'done' ? 25 : 0),
    ),
  );

  return (
    <div className="think" role="status" aria-live="polite">
      {/* ① 读句子 */}
      <div className={`think-step${phase === 'read' ? '' : ' is-past'}`}>
        <span className="think-dot" />
        <span className="think-label">
          {phase === 'read' ? '在读你的句子…' : '读完了'}
        </span>
      </div>

      {/* 原句逐个词被点亮 */}
      <div className="think-words">
        {words.map((word, index) => {
          const isRead = index < readCount;
          const isPick = safePicks
            .slice(0, shownPicks.length)
            .some((p) => p.toLowerCase() === word.toLowerCase());
          return (
            <span
              key={`${word}-${index}`}
              className={`think-word en${isRead ? ' is-read' : ''}${
                isPick ? ' is-pick' : ''
              }`}
            >
              {word}
            </span>
          );
        })}
      </div>

      {/* ② 挑出来的词 */}
      <div className={`think-tray${shownPicks.length > 0 ? ' is-on' : ''}`}>
        <b>挑出来的：</b>
        {shownPicks.map((word, index) => (
          <span className="think-chip en" key={`${word}-${index}`}>
            {word}
          </span>
        ))}
      </div>

      {/* ③ 想该问什么 */}
      <div className={`think-step${phase === 'think' || phase === 'done' ? '' : ' is-future'}`}>
        <span className="think-dot" />
        <span className="think-label">
          {phase === 'done' ? '想好了' : '在想该问你什么'}
        </span>
        {phase === 'think' && (
          <span className="think-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
      </div>

      <div className="think-bar">
        <i style={{ width: `${progress}%` }} />
      </div>

      <p className="think-tip">
        {phase === 'done' ? '想好了——它要问你的就在下面。' : tip}
      </p>
    </div>
  );
}
