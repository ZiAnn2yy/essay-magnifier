import { useCallback, useEffect, useRef, useState } from 'react';
import './Analyzer.css';
import EssayPicker from './EssayPicker.jsx';
import EssayPane from './EssayPane.jsx';
import MoveCards from './MoveCards.jsx';
import TaskDock from './TaskDock.jsx';
import { analyzeEssay } from '../api.js';
import { loadBook, addMove } from '../lib/moveBook.js';

/**
 * 主界面：选范文 → 拆解 → 用一招写自己的。
 *
 * 三个阶段在一页里推进，不跳路由。理由：从"看懂"到"动手写"之间每多一次页面切换，
 * 就多一个放弃点。点「用这一招」只是把右边那栏滚到写作坞，范文还在原处。
 */
export default function Analyzer({ grade, onBack }) {
  const [essay, setEssay] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [error, setError] = useState('');
  const [activeMoveId, setActiveMoveId] = useState(null);
  const [book, setBook] = useState(loadBook);
  const [bookOpen, setBookOpen] = useState(false);
  const dockRef = useRef(null);

  const runAnalyze = useCallback(async (picked) => {
    setEssay(picked);
    setAnalysis(null);
    setActiveMoveId(null);
    setStatus('loading');
    setError('');
    try {
      const data = await analyzeEssay({
        grade,
        title: picked.title,
        essayText: picked.text,
      });
      if (data.crisis) {
        setStatus('crisis');
        return;
      }
      setAnalysis(data.analysis);
      setStatus('done');
    } catch (submitted) {
      setError(submitted.message);
      setStatus('error');
    }
  }, [grade]);

  function handleUseMove(move) {
    setActiveMoveId(move.id);
    // 写作坞在右栏底部，选中一招就滚到它那儿——范文还在原处没动
    requestAnimationFrame(() => {
      dockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  function handleCollect(move) {
    setBook(addMove({ moveId: move.id, name: move.name, essayId: essay.id ?? 'pasted', from: 'essay' }));
  }

  if (!essay) {
    return (
      <main className="an">
        <TopBar grade={grade} onBack={onBack} bookCount={book.length} onOpenBook={() => setBookOpen(true)} />
        <div className="an-body an-body-single">
          <EssayPicker grade={grade} onPick={runAnalyze} onBack={onBack} />
        </div>
      </main>
    );
  }

  const activeMove = analysis?.moves.find((move) => move.id === activeMoveId) ?? null;
  const collectedIds = book.filter((item) => item.from === 'essay').map((item) => item.moveId);

  return (
    <main className="an">
      <TopBar
        grade={grade}
        onBack={() => setEssay(null)}
        backLabel="换一篇"
        bookCount={book.length}
        onOpenBook={() => setBookOpen(true)}
      />

      <div className="an-body">
        {status === 'loading' && <Analyzing essayTitle={essay.title} />}

        {status === 'error' && (
          <div className="an-panel an-fail">
            <p className="an-fail-title">没能拆开这一篇</p>
            <p className="an-fail-hint">{error}</p>
            <button type="button" className="an-fail-retry" onClick={() => runAnalyze(essay)}>
              再试一次
            </button>
          </div>
        )}

        {status === 'crisis' && (
          <div className="an-panel an-crisis">
            <p className="an-crisis-title">先歇一会儿</p>
            <p className="an-crisis-text">
              这篇文字里有一些让人担心的话。如果你现在心里难受，请告诉一个你信任的大人，
              或者打心理援助热线 12356。写作的事，我们改天再聊。
            </p>
          </div>
        )}

        {status === 'done' && analysis && (
          <>
            <EssayPane
              title={essay.title}
              paragraphs={analysis.paragraphs}
              moves={analysis.moves}
              freshWords={analysis.freshWords}
              activeMoveId={activeMoveId}
              onSelectMove={setActiveMoveId}
            />

            <div className="an-side">
              <MoveCards
                moves={analysis.moves}
                activeMoveId={activeMoveId}
                onSelect={setActiveMoveId}
                onUse={handleUseMove}
                onCollect={handleCollect}
                collected={collectedIds}
              />

              {activeMove && (
                <div ref={dockRef}>
                  <TaskDock move={activeMove} grade={grade} essayTitle={essay.title} />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {bookOpen && <MoveBook entries={book} onClose={() => setBookOpen(false)} />}
    </main>
  );
}

function TopBar({ grade, onBack, backLabel = '← 换年级', bookCount, onOpenBook }) {
  return (
    <header className="an-top">
      <button type="button" className="an-back" onClick={onBack}>
        {backLabel}
      </button>
      <span className="an-grade">{grade} 年级</span>
      <button type="button" className="an-book" onClick={onOpenBook}>
        我的册子 · {bookCount}
      </button>
    </header>
  );
}

/**
 * 等待态。
 *
 * 真模型首 token 6.3 秒，藏不住，所以不假装快：把正在发生的事说出来，
 * 并随时间换档——超过 10 秒就承认"这一篇比较难拆"。
 */
function Analyzing({ essayTitle }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const line =
    elapsed < 4
      ? '在读这一篇…'
      : elapsed < 9
        ? '在找它用了哪些招…'
        : '这一篇比较讲究，还在拆…';

  return (
    <div className="an-panel an-loading">
      <p className="an-loading-title">{line}</p>
      <p className="an-loading-sub">《{essayTitle}》</p>
      <div className="an-loading-bar" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}

function MoveBook({ entries, onClose }) {
  return (
    <div className="an-book-panel" role="dialog" aria-label="我的招式册子">
      <header className="an-book-head">
        <h3>我的册子 · {entries.length} 招</h3>
        <button type="button" onClick={onClose}>
          关上
        </button>
      </header>
      {entries.length === 0 ? (
        <p className="an-book-empty">还空着。拆一篇范文，点「收进册子」。</p>
      ) : (
        <ul className="an-book-list">
          {entries.map((entry) => (
            <li key={`${entry.moveId}-${entry.from}-${entry.at}`}>
              <strong>{entry.name}</strong>
              <span>{entry.from === 'essay' ? '从范文学来的' : '我自己用上的'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
