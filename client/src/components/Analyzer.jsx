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
  removeFromBook,
  restoreToBook,
  entryKey,
  countLearnedMoves,
  countOwnEssays,
  favouriteMove,
  titleFor,
  countGenres,
  ownSentencesByMove,
  hasEntry,
} from '../lib/moveBook.js';
import { flyTextTo, flyCardTo, punch } from '../lib/flyTo.js';
import { track } from '../lib/track.js';
import { loadLetters, addLetter } from '../lib/letterStore.js';
import LetterModal from './LetterModal.jsx';

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
  // 回信。存在本机（letterStore），模态的开关和当前看第几封在这里——
  // 它要同时服务两个入口：TaskDock 的"再看这封回信"和顶栏的回信按钮
  const [letters, setLetters] = useState(loadLetters);
  const [letterOpen, setLetterOpen] = useState(false);
  const [letterIndex, setLetterIndex] = useState(0);
  const dockRef = useRef(null);
  const bookRef = useRef(null);
  const letterAnchorRef = useRef(null);

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

  /**
   * 用上这一招：选中 + 滚到写作坞。
   *
   * 两个入口共用它——卡片上的「用这一招」和范文里涂黄的那一句。涂黄那句
   * 原先只 setActiveMoveId：牌转正了，写作坞也在下面挂上了，可窄屏里它在
   * 屏幕外，孩子点了原句只看到牌转个方向，不知道右边已经展开等他写。
   * 同一动作两个入口就该同一个结果，所以这里也滚。
   * move_use 照记：点原句和点按钮是同一个决定，漏记会让漏斗那个数偏低。
   */
  function handleUseMove(move) {
    setActiveMoveId(move.id);
    track('move_use', { grade });
    // 写作坞在右栏底部，选中一招就滚到它那儿——范文还在原处没动
    requestAnimationFrame(() => {
      dockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  /**
   * 换一招：切到下一篇，不到处滚。
   *
   * 为什么需要它：卡片本身不可点，「用这一招」是唯一入口；而一旦某张置顶
   * （decision 44 的 sticky），其它牌的按钮就被它压着，得滚过它才点得到。
   * 用户 11-01 演示时抓到的。
   *
   * 循环而不是"取消置顶"：取消置顶会让 activeMove 变 null、写作坞整个卸载，
   * 孩子写了一半的句子跟着没了。循环永远有一个 active，坞不卸载。
   *
   * 不重新记 move_use：那是"决定用这一招"的时刻，换招是改主意，
   * 记成同一个事件会让漏斗里那个数虚高。
   */
  function handleSwitchMove() {
    const list = analysis?.moves ?? [];
    if (list.length < 2) return;
    const current = list.findIndex((move) => move.id === activeMoveId);
    const next = list[(current + 1) % list.length];
    if (!next) return;
    setActiveMoveId(next.id);
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
        // 文体带进条目，"在几种文体里写过"这一轴靠它。粘贴的范文没有类型，
        // 留空即可——不知道的事不猜，那种篇目不计入广度
        topic: essay.topic ?? '',
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

  /**
   * 收到一封新回信：存起来，然后**立刻放大到屏幕中央**。
   *
   * 为什么是收到就放大、而不是等孩子去点：用户 10-30 的原话是
   * "回信出结果的时候，先放大到屏幕中间"。回信是整个产品唯一的动机引擎，
   * 它值得一个被认真读的场合——让它悄悄出现在角落里，等于把它降级成一条通知。
   */
  function handleLetter(entry) {
    const next = addLetter(entry);
    setLetters(next);
    setLetterIndex(next.length - 1);
    setLetterOpen(true);
  }

  /** 从顶栏或 dock 打开回信：看最新的一封。 */
  function openLatestLetter() {
    if (letters.length === 0) return;
    setLetterIndex(letters.length - 1);
    setLetterOpen(true);
  }

  /**
   * 从册子里拿出一条。返回它**原来的位置**——册子面板要拿这个位置
   * 把"放回去"做回原样，放回末尾会让孩子刚整理的顺序又乱掉。
   *
   * 为什么敢不做二次确认：拿出来立刻有撤销条，6 秒内点"放回去"就原样还原。
   * 对孩子来说，一个确认对话框比一条撤销更难懂，而且删错了要连点两下才能救回来。
   *
   * @returns {number} 原位；册子里本来就没有这一条时是 -1
   */
  function handleRemoveFromBook(entry) {
    const result = removeFromBook(entry);
    setBook(result.entries);
    return result.index;
  }

  /** 撤销：放回原来的位置。 */
  function handleRestoreToBook(entry, index) {
    setBook(restoreToBook(entry, index));
  }

  /**
   * 这一句收过没有。
   *
   * 问的是**这一句**，不是"这一招在这一篇里写过没有"——同一招在同一篇里可以写
   * 几句，几句都该留得下（证据墙本来就是按招式分组列多句的）。传函数而不是布尔，
   * 因为当前写到哪一句只有 TaskDock 里的输入框知道。
   *
   * 写成普通函数而不是 useCallback：它要跟着 book 和 activeMoveId 变，
   * 而 TaskDock 没有 memo，包一层缓存没有收益，反倒容易踩 hooks 顺序的坑
   * （2026-11-02 真犯过：把它放到早返回之后，React 直接 #310）。
   */
  function isOwnKept(sentence) {
    if (sentence.length === 0) return false;
    return hasEntry(book, {
      essayId: essay.id,
      moveId: activeMoveId,
      from: 'own',
      mySentence: sentence,
    });
  }

  if (!essay) {
    return (
      <main className="an">
        <TopBar
          grade={grade}
          onBack={onBack}
          bookCount={book.length}
          onOpenBook={() => setBookOpen(true)}
          letterCount={letters.length}
          onOpenLetter={openLatestLetter}
          letterRef={letterAnchorRef}
        />
        <div className="an-body an-body-single">
          <EssayPicker grade={grade} onPick={runAnalyze} />
        </div>
      </main>
    );
  }

  const activeMove = analysis?.moves.find((move) => move.id === activeMoveId) ?? null;
  // 收过没，要**连篇目一起比**。招式的 id 是 m1/m2/m3 按次生成的，
  // 只比 moveId 会把别的篇目的同一序号当成自己收过的——册子里没有这一招，
  // 卡片上却写着"已收进册子"，孩子点不动也不知道为什么。
  const collectedIds = (analysis?.moves ?? [])
    .filter((move) => hasEntry(book, { essayId: essay.id, moveId: move.id, from: 'essay' }))
    .map((move) => move.id);

  return (
    <main className="an">
      <TopBar
        grade={grade}
        onBack={() => setEssay(null)}
        backLabel="换一篇"
        bookCount={book.length}
        onOpenBook={() => setBookOpen(true)}
        bookRef={bookRef}
        letterCount={letters.length}
        onOpenLetter={openLatestLetter}
        letterRef={letterAnchorRef}
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
              onSelectMove={handleUseMove}
            />

            <div className="an-side">
              <MoveCards
                moves={analysis.moves}
                activeMoveId={activeMoveId}
                onSelect={setActiveMoveId}
                onUse={handleUseMove}
                onSwitch={handleSwitchMove}
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
                  {/* key 让换招时整个坞重挂——否则标题写着新招、
                      输入框里还留着为上一招写的那句，孩子会以为那句是新招的 */}
                  <TaskDock
                    key={activeMoveId}
                    move={activeMove}
                    grade={grade}
                    essayTitle={essay.title}
                    onKeep={handleKeepOwn}
                    isKept={isOwnKept}
                    onLetter={handleLetter}
                    onReopenLetter={openLatestLetter}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {bookOpen && (
        <MoveBook
          entries={book}
          onClose={() => setBookOpen(false)}
          onRemove={handleRemoveFromBook}
          onRestore={handleRestoreToBook}
        />
      )}

      <LetterModal
        letters={letters}
        index={letterIndex}
        open={letterOpen}
        onIndexChange={setLetterIndex}
        onClose={() => setLetterOpen(false)}
        sourceRef={letterAnchorRef}
      />
    </main>
  );
}

function TopBar({
  grade,
  onBack,
  backLabel = '← 换年级',
  bookCount,
  onOpenBook,
  bookRef,
  letterCount,
  onOpenLetter,
  letterRef,
}) {
  return (
    <header className="an-top">
      <button type="button" className="an-back" onClick={onBack}>
        {backLabel}
      </button>
      <span className="an-grade">{grade} 年级</span>
      {/* 回信入口和册子按钮并列。收回信纸之后，这里是回信唯一的常驻入口——
          没有它，"收回"就成了"再也找不到"。
          一封信都没有时不渲染：空入口会让人以为有东西没找到。 */}
      {letterCount > 0 && (
        <button
          type="button"
          className="an-letters"
          onClick={onOpenLetter}
          ref={letterRef}
        >
          读者的回信 · {letterCount}
        </button>
      )}
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
 *
 * 2026-11-02 补第四档：粘贴路径实测 25-60 秒，而第三档从 9 秒起一句话
 * 显示到结束，一半的时间只有一句"还在拆"。45 秒之后把原因说明白——
 * 贴进来的篇子没有提前算过，所以慢。**不假装快**是这套文案的底线。
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
        : elapsed < 25
          ? '这一篇比较讲究，还在拆…'
          : '贴进来的篇子没有提前算过，拆得慢一些…';

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
 *
 * ## 每条都能拿出来（2026-11-02 加，用户要的）
 *
 * 点错的招、用不上的招，得能弄出去——否则册子只会越来越杂，而它是给孩子
 * 回头看自己的地方。做法是每条右边一个 ×，**拿出来立刻给撤销条**（6 秒）。
 * 不做二次确认：对孩子来说一个确认对话框比一条撤销更难懂，而且删错了
 * 要连点两下才能救回来。自己写的那一句也能拿——那是他们自己的东西，
 * 但撤销条照样兜得住误触。
 */
function MoveBook({ entries, onClose, onRemove, onRestore }) {
  const learned = entries.filter((entry) => entry.from === 'essay');
  const written = entries.filter((entry) => entry.from === 'own');
  const spotted = entries.filter((entry) => entry.from === 'spotted');
  const favourite = favouriteMove(entries);
  const title = titleFor(entries);
  const genres = countGenres(entries);
  // 证据墙只收自己的句子；剩下的是收进册子的招（学来的 + 看出来的）
  const wall = ownSentencesByMove(entries);
  const moves = entries.filter((entry) => entry.from !== 'own');
  // 只留最近一条可撤销。连拿几条还每条都能撤销，那个状态孩子记不住，
  // 撤销条也会从"救命"变成又一处需要管理的东西
  const [undo, setUndo] = useState(null);

  // 6 秒后自己走。不永久留着：一条永不消失的撤销条会变成常驻噪点
  useEffect(() => {
    if (!undo) return undefined;
    const timer = window.setTimeout(() => setUndo(null), 6000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  function handleRemove(entry) {
    // 父组件落盘时把原位带回来——撤销要靠它放回原样
    const removedAt = onRemove(entry);
    if (removedAt < 0) return;
    setUndo({ entry, index: removedAt, label: describeEntry(entry) });
  }

  function handleUndo() {
    if (!undo) return;
    onRestore(undo.entry, undo.index);
    setUndo(null);
  }

  return (
    <div className="an-book-panel" role="dialog" aria-label="我的招式册子">
      <header className="an-book-head">
        <h3>我的册子</h3>
        <button type="button" onClick={onClose}>
          关上
        </button>
      </header>

      {/* 头衔。按"用自己的话接过的篇数"算，和支架撤除共用同一个数
          （countOwnEssays）——别再另算一套。不配进度条：进度条暗示有个终点，
          而这个产品没有。 */}
      <div className="an-book-title">
        <p className="an-book-title-label">你现在是</p>
        <p className="an-book-title-name">{title}</p>
        {genres > 0 && (
          <p className="an-book-title-genres">
            在 <strong>{genres}</strong> 种文体里写过
          </p>
        )}
      </div>

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
        <>
          {/* 证据墙：自己的句子按招式分组摆在这儿。
              **零判定**——不评分不排名不说好不好（决策 42：激励是证据不是奖励）。
              分组是为了让他看见"这一招我用过三次，这是那三次"。 */}
          {wall.length > 0 && (
            <section className="an-wall">
              <h4 className="an-wall-head">你用自己的话写过的</h4>
              {wall.map((group) => (
                <div className="an-wall-group" key={group.name}>
                  <p className="an-wall-move">用「{group.name}」</p>
                  <ul className="an-wall-list">
                    {group.sentences.map((entry) => (
                      <li key={`${entry.essayId}-${entry.moveId}-${entry.at}`}>
                        {entry.mySentence}
                        <TakeOut entry={entry} onRemove={handleRemove} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}

          <section className="an-book-moves">
            <h4 className="an-wall-head">收进册子的招</h4>
            <ul className="an-book-list">
              {moves.map((entry) => (
                <li key={`${entry.moveId}-${entry.from}-${entry.at}`}>
                  <BookEntry entry={entry} />
                  <TakeOut entry={entry} onRemove={handleRemove} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {/* 撤销条。贴在面板底部跟着滚——刚点完 × 的眼睛正在面板里，
          不该为了找它再滚一遍。6 秒后自己走（见上面的 useEffect）。 */}
      {undo && (
        <p className="an-book-undo" role="status">
          <span>已经把{undo.label}拿出册子了</span>
          <button type="button" onClick={handleUndo}>
            放回去
          </button>
        </p>
      )}
    </div>
  );
}

/** 撤销条上那一小句：说清楚刚刚拿出去了什么。 */
function describeEntry(entry) {
  if (entry.from === 'own') {
    const sentence = String(entry.mySentence ?? '');
    const short = sentence.length > 10 ? `${sentence.slice(0, 10)}…` : sentence;
    return short ? `你写的「${short}」` : '你写的那一句';
  }
  return `「${entry.name}」`;
}

/**
 * 拿出册子的那个 ×。
 *
 * 放在每条右边、常驻可见，不藏在"整理"模式后面——藏起来的逃生口
 * 在孩子需要它的时候不在。样式刻意安静：小、灰、细边，
 * 不能和条目本身或者"关上"抢。
 */
function TakeOut({ entry, onRemove }) {
  return (
    <button
      type="button"
      className="an-book-remove"
      onClick={() => onRemove(entry)}
      aria-label={`把${describeEntry(entry)}拿出册子`}
      title="拿出册子"
    >
      ×
    </button>
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
