import { useCallback, useEffect, useRef, useState } from 'react';
import './Analyzer.css';
import EssayPicker from './EssayPicker.jsx';
import EssayPane from './EssayPane.jsx';
import MoveCards from './MoveCards.jsx';
import ChallengeCard from './ChallengeCard.jsx';
import TaskDock from './TaskDock.jsx';
import { analyzeEssay } from '../api.js';
import { loadEssaysByGrade } from '../data/essayStore.js';
import {
  loadBook,
  addMove,
  countLearnedMoves,
  countOwnEssays,
  favouriteMove,
  hasEntry,
} from '../lib/moveBook.js';
import { flyTextTo, flyCardTo, punch } from '../lib/flyTo.js';
import { track } from '../lib/track.js';

/**
 * 粘贴进来的范文没有 id，而册子的键要靠 essayId 区分篇目。
 * 所有粘贴篇共用一个假 id 的话，两篇不同的粘贴范文会互相把对方的 m1/m2/m3
 * 当成自己收过的。所以每贴一篇就发一个真 id，重试时沿用同一个
 * （runAnalyze 再次拿到的是已经带上 id 的 essay）。
 */
let pasteSeq = 0;
function withEssayId(picked) {
  if (picked?.id) return picked;
  pasteSeq += 1;
  return { ...picked, id: `pasted-${Date.now().toString(36)}-${pasteSeq}` };
}

/**
 * 主界面：选范文 → 拆解 → 用一招写自己的。
 *
 * 三个阶段在一页里推进，不跳路由。理由：从"看懂"到"动手写"之间每多一次页面切换，
 * 就多一个放弃点。点「用这一招」只是把右边那栏滚到写作坞，范文还在原处。
 */
export default function Analyzer({ grade, onBack }) {
  const [essay, setEssay] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [basis, setBasis] = useState(null);
  const [precomputed, setPrecomputed] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [error, setError] = useState('');
  const [activeMoveId, setActiveMoveId] = useState(null);
  const [book, setBook] = useState(loadBook);
  const [bookOpen, setBookOpen] = useState(false);
  const dockRef = useRef(null);
  const bookRef = useRef(null);

  const runAnalyze = useCallback(async (pickedEssay) => {
    // 粘贴篇在这里补一个真 id——见 withEssayId 的说明
    const picked = withEssayId(pickedEssay);
    setEssay(picked);
    setAnalysis(null);
    setActiveMoveId(null);
    setStatus('loading');
    setError('');
    const startedAt = Date.now();
    try {
      const data = await analyzeEssay({
        grade,
        title: picked.title,
        // 这一篇的类型（写人/记事/写景/状物/想象）。带上它，服务端才能从知识库
        // 取到对应的文体视角卡——同一年级的两篇范文，看点本来就不一样。
        // 粘贴进来的范文没有类型，留空即可。
        topic: picked.topic ?? '',
        // 内置范文的 id。带上它才可能命中预处理结果，于是点开就有招、
        // 不用等模型；粘贴的范文没有 id，走实时拆解。
        essayId: picked.id ?? '',
        essayText: picked.text,
        // 支架撤除的依据：册子越厚，这一篇越少直接标好，越多的招让孩子自己找。
        // 两个数缺一不可——"学过多少招"和"在几篇里真的用出来过"。
        // 只数学来的招，不数自己写过的句子（决策 41）；
        // 用出来过的必须按篇目去重，否则同一招写十句就虚高（fading.js）。
        // writtenEssays 同时是头衔的口径（决策 48），两处从此不分叉。
        collectedCount: countLearnedMoves(loadBook()),
        writtenEssays: countOwnEssays(loadBook()),
      });
      if (data.crisis) {
        setStatus('crisis');
        return;
      }
      setAnalysis(data.analysis);
      setBasis(data.basis);
      setPrecomputed(data.precomputed === true);
      setAttempts(data.attempts);
      setStatus('done');
      // 只记计数和耗时，不记是哪一篇、孩子看到了什么。
      // precomputed 这一项是答辩要用的：内置路径 0.04 秒、粘贴路径 25-60 秒，
      // 两条路的占比和耗时差距就是"我们已经把核心路径从外部依赖上摘下来"的证据。
      track('analyze_done', {
        grade,
        moves: data.analysis?.moves?.length ?? 0,
        precomputed: data.precomputed === true,
        degraded: data.analysis?.degraded === true,
        ms: Date.now() - startedAt,
      });
    } catch (submitted) {
      setError(submitted.message);
      setStatus('error');
    }
  }, [grade]);

  // 深链 ?essay=<id> 直接开到拆解，跳过选范文那一步。
  // 录演示视频时每个 take 都从点范文开始太浪费；也让我能在无头浏览器里
  // 直接截到拆解后的界面（没有这个深链，就得先点两下才能到）。
  // 从分片里按 id 找，不读合并文件——合并文件只有最初的十篇，
  // 后来生成的范文会找不到（这个不一致真犯过）。
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('essay');
    if (!id) return;
    let alive = true;
    loadEssaysByGrade(grade).then((list) => {
      const picked = list.find((item) => item.id === id);
      if (alive && picked) runAnalyze(picked);
    });
    return () => {
      alive = false;
    };
  }, [grade, runAnalyze]);

  function handleUseMove(move) {
    setActiveMoveId(move.id);
    track('move_use', { grade });
    // 写作坞在右栏底部，选中一招就滚到它那儿——范文还在原处没动
    requestAnimationFrame(() => {
      dockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  function handleCollect(move, fromElement, accent) {
    const alreadyIn = hasEntry(book, { essayId: essay.id, moveId: move.id, from: 'essay' });
    setBook(addMove({ moveId: move.id, name: move.name, essayId: essay.id, from: 'essay' }));
    track('move_collect', { grade, from: 'essay' });
    // 收一招的回应：小白牌飞进顶栏，册子咚一下。
    // 和写完那句飞黄便签是两套——收进册子的是两样东西，飞一个样子就分不清了。
    // 已经收过的不再飞：重复播放的奖励看两次就腻。
    if (fromElement && !alreadyIn) {
      flyCardTo(fromElement, bookRef.current, move.name, accent);
      punch(bookRef.current);
    }
  }

  /**
   * 写完之后的激励：那句从写作坞飞进顶栏的作文本，计数当场跳一下。
   *
   * 分两半是有意的——动画是给孩子看的，"收进作文本"这个动作是给孩子做的。
   * 自动播放的奖励看两次就腻，自己按下去的奖励每次都算数。
   */
  function handleKeepOwn(text) {
    if (text.length === 0) return;
    flyTextTo(dockRef.current, bookRef.current, text);
    setBook(
      addMove({
        moveId: activeMoveId ?? 'unknown',
        name: activeMove?.name ?? '自己用的一招',
        essayId: essay.id,
        from: 'own',
        mySentence: text,
      }),
    );
    track('move_collect', { grade, from: 'own' });
    punch(bookRef.current);
  }

  /**
   * 孩子自己看出一招。
   *
   * 第三种来源：`from: 'spotted'`。和"从范文学来的"（essay）、
   * "自己用上的"（own）分开算——前两类是产品给的，这一类是他自己挣的，
   * 混在一起就分不出哪个值得夸。
   *
   * moveId 用招式名本身：同一篇里两次看出同一招只存一条，
   * 而不同篇目靠 essayId 区分（键的三要素见 moveBook.js 的 entryKey）。
   */
  function handleSpotted(name) {
    setBook(
      addMove({
        moveId: `spot-${name}`,
        name,
        essayId: essay.id,
        from: 'spotted',
      }),
    );
    // 只分"从标好的里挑的"和"自己命名的"，**不判对错**——产品没有这个判定
    // （见 ChallengeCard 的说明）。但如果大多数孩子在自已命名，
    // 说明上面标好的招式名没有落到他眼里，那是一个要改的信号。
    const listed = (analysis?.moves ?? []).some((move) => move.name === name);
    track('spotted', { grade, origin: listed ? 'listed' : 'custom' });
  }

  /** 挑战卡上选了"这次没看出来"。参与率的另一半，单独数。 */
  function handleSpottedSkip() {
    track('spotted_skipped', { grade });
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
  // 收过没、写过没，都要**连篇目一起比**。招式的 id 是 m1/m2/m3 按次生成的，
  // 只比 moveId 会把别的篇目的同一序号当成自己收过的——册子里没有这一招，
  // 卡片上却写着"已收进册子"，孩子点不动也不知道为什么。
  const collectedIds = (analysis?.moves ?? [])
    .filter((move) => hasEntry(book, { essayId: essay.id, moveId: move.id, from: 'essay' }))
    .map((move) => move.id);
  const keptOwn = hasEntry(book, { essayId: essay.id, moveId: activeMoveId, from: 'own' });

  return (
    <main className="an">
      <TopBar
        grade={grade}
        onBack={() => setEssay(null)}
        backLabel="换一篇"
        bookCount={book.length}
        onOpenBook={() => setBookOpen(true)}
        bookRef={bookRef}
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

              {/* 支架撤除的补偿：少标的几招，要从这一张卡还回来。
                  没有它，"攒的招越多、看到的东西越少"就是净损失。 */}
              {analysis.challenge && (
                <ChallengeCard
                  challenge={analysis.challenge}
                  moves={analysis.moves}
                  onSpotted={handleSpotted}
                  onSkip={handleSpottedSkip}
                />
              )}

              {/* 智能体现身的地方：它照什么拆的、核对结果如何。
                  不显示这段，前面那些能力就全藏在后台——孩子和评委
                  都只知道"结果出来了"，不知道"是谁照什么干出来的"。 */}
              <BasisNote
                basis={basis}
                attempts={attempts}
                degraded={status === 'done' && !analysis.moves.length}
                precomputed={precomputed}
              />

              {activeMove && (
                <div ref={dockRef}>
                  <TaskDock
                    move={activeMove}
                    grade={grade}
                    essayTitle={essay.title}
                    onKeep={handleKeepOwn}
                    kept={keptOwn}
                  />
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

function TopBar({ grade, onBack, backLabel = '← 换年级', bookCount, onOpenBook, bookRef }) {
  return (
    <header className="an-top">
      <button type="button" className="an-back" onClick={onBack}>
        {backLabel}
      </button>
      <span className="an-grade">{grade} 年级</span>
      <button type="button" className="an-book" onClick={onOpenBook} ref={bookRef}>
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

/**
 * 智能体的"自报家门"。
 *
 * 这是把后台的能力搬到前台的那一条。没有它，前面所有的东西
 * （按年级检索课标、逐字核对引用、不对就自己改）都只是实现细节，
 * 孩子和评委看到的结果和"套了个 prompt 的工具"没有区别。
 *
 * 两条都写得像人话，因为它的读者首先是孩子和家长；
 * 但同时每一条都是可核实的真话——不是营销话术。
 *
 * `precomputed` 这一支是 2026-10-30 加的：内置范文的拆解是提前算好的，
 * 那句话必须和"这次当场拆的"分开说。都是逐字核对过的，但一个是现拆的、
 * 一个是预算好的，混成一句就是冒充。
 */
function BasisNote({ basis, attempts, degraded, precomputed }) {
  if (!basis) return null;

  const corrected = attempts > 1;

  return (
    <aside className="basis">
      <p className="basis-title">这一篇是照着什么拆的</p>
      <p className="basis-line">{basis.summary}</p>
      <p className="basis-line basis-check">
        {degraded ? (
          <>这次没能拆出招式，上面只有原文和分段</>
        ) : precomputed ? (
          <>这一篇的拆解是提前算好的，每一处引用的原句都逐字核对过</>
        ) : corrected ? (
          <>有一处引用的原句对不上，它自己改了一次才对上</>
        ) : (
          <>每一处引用的原句，都逐字核对过，是这篇范文里真有的</>
        )}
      </p>
    </aside>
  );
}

/**
 * 册子面板。
 *
 * 2026-10-30 补上两处：
 *   1. **自己写的那句要能读回来**。mySentence 一直存着，但这里只渲染
 *      "我自己用上的"五个字——孩子写完、看它飞进册子、计数跳一下，
 *      然后打开册子，找不到自己写过的那句话。飞行动画的终点是个看不见
 *      东西的盒子。对写作产品来说，"能回头读自己写过的话"是最深的激励。
 *   2. **两个数分开**。原来标题写"N 招"，可册子里混着从范文学来的招和
 *      自己写上的句，把句子数叫"招"是错的。拆成两行，各自标清楚。
 */
function MoveBook({ entries, onClose }) {
  const learned = entries.filter((entry) => entry.from === 'essay');
  const written = entries.filter((entry) => entry.from === 'own');
  const spotted = entries.filter((entry) => entry.from === 'spotted');
  const favourite = favouriteMove(entries);

  return (
    <div className="an-book-panel" role="dialog" aria-label="我的招式册子">
      <header className="an-book-head">
        <h3>我的册子</h3>
        <button type="button" onClick={onClose}>
          关上
        </button>
      </header>

      <p className="an-book-tally">
        <span>
          学来的 <strong>{learned.length}</strong> 招
        </span>
        <span>
          写上的 <strong>{written.length}</strong> 句
        </span>
        <span>
          看出来的 <strong>{spotted.length}</strong> 招
        </span>
      </p>

      {/* 兴趣个体化的最轻一层：册子原来按时间倒序，孩子在里头只看见
          "我收过什么"，看不见"我"。把分布算出来告诉他，是从
          "每篇都有新东西"走到"我知道自己擅长什么"的那一步。 */}
      {favourite && (
        <p className="an-book-favourite">
          你最常用的一招是「{favourite.name}」，在 <strong>{favourite.essays}</strong> 篇里用过它。
        </p>
      )}

      {entries.length === 0 ? (
        <p className="an-book-empty">还空着。拆一篇范文，点「收进册子」。</p>
      ) : (
        <ul className="an-book-list">
          {entries.map((entry) => (
            <BookEntry key={`${entry.moveId}-${entry.from}-${entry.at}`} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** 一条册子记录。三种来源各自怎么说，取决于这一条是怎么来的。 */
function BookEntry({ entry }) {
  if (entry.from === 'own') {
    return (
      <>
        {/* 自己写的那句排在最前：册子里最值得回头看的就是它 */}
        <p className="an-book-mine">{entry.mySentence}</p>
        <span>用「{entry.name}」写上的</span>
      </>
    );
  }

  if (entry.from === 'spotted') {
    return (
      <>
        <strong>{entry.name}</strong>
        <span>你自己看出来的</span>
      </>
    );
  }

  return (
    <>
      <strong>{entry.name}</strong>
      <span>从范文学来的</span>
    </>
  );
}
