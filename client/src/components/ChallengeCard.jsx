import { useState } from 'react';
import './ChallengeCard.css';

/**
 * 「这一句用了哪一招？你自己看。」
 *
 * 服务端早就会给这个字段了（`challenge`：从原文里另找一处用了招的句子，
 * 只给原句，不告诉他是哪一招），也带逐字校验；前端却一直不渲染它。
 * 结果是反的：孩子攒够招之后，服务端少标几招，他只看到东西变少了，
 * 而"让你自己找一句"的补偿从未出现。
 *
 * 这一步是认知学徒制里的 articulation（Collins, Brown & Newman 1988）——
 * 示范之后要说出来，只让人看懂不算数。也是"范文放大镜"这个产品名
 * 真正的落点：前两类收获（学来的招、用上的句）是产品给的，
 * 这一类是孩子自己挣的。
 *
 * 不新增服务端判定：他挑哪一招、或者自己命名一招，都只是客户端状态
 * 加一次写 localStorage。选错同样有信息量——他看成了另一招，
 * 那说明他对这一招的理解和产品标的不一样。
 */
export default function ChallengeCard({ challenge, moves, onSpotted, onSkip }) {
  const [stage, setStage] = useState('ask'); // ask | pick | done | skipped
  const [spotted, setSpotted] = useState('');

  if (!challenge?.quote) return null;

  function pick(name) {
    const clean = name.trim();
    if (clean.length === 0) return;
    setSpotted(clean);
    setStage('done');
    onSpotted?.(clean);
  }

  /** 看不出来。这一步和"看出来了"一样有信息量——它是参与率的另一半。 */
  function skip() {
    setStage('skipped');
    onSkip?.();
  }

  if (stage === 'skipped') {
    // 不给答案也不给提示——这一句的价值全在"自己想出来"。
    // 真看不出来就放着，下次拆别的篇目时可能就懂了。
    return (
      <section className="challenge is-skipped">
        <blockquote className="challenge-quote">{challenge.quote}</blockquote>
        <p className="challenge-skipped">这一句先放着，哪天看出来就说给我听。</p>
      </section>
    );
  }

  return (
    <section className="challenge">
      <header className="challenge-head">
        <span className="challenge-kicker">{stage === 'done' ? '你自己看出来的' : '你自己看'}</span>
      </header>

      <blockquote className="challenge-quote">{challenge.quote}</blockquote>

      {stage === 'ask' && (
        <>
          <p className="challenge-ask">这一句里用了哪一招？上面没标，你自己看。</p>
          <div className="challenge-actions">
            <button type="button" className="challenge-yes" onClick={() => setStage('pick')}>
              我看出来了
            </button>
            <button type="button" className="challenge-no" onClick={skip}>
              这次没看出来
            </button>
          </div>
        </>
      )}

      {stage === 'pick' && (
        <ChallengePick moves={moves} onPick={pick} />
      )}

      {stage === 'done' && (
        <p className="challenge-done">
          你看出来的是「<strong>{spotted}</strong>」，收进册子了。
        </p>
      )}
    </section>
  );
}

/** 挑一招：从上面标好的里选，或者自己命名一招。 */
function ChallengePick({ moves, onPick }) {
  const [custom, setCustom] = useState('');

  return (
    <>
      <p className="challenge-ask">从上面标好的招里挑一个，或者你自己说一个。</p>

      <ul className="challenge-options">
        {(moves ?? []).map((move) => (
          <li key={move.id}>
            <button type="button" className="challenge-option" onClick={() => onPick(move.name)}>
              {move.name}
            </button>
          </li>
        ))}
      </ul>

      <form
        className="challenge-custom"
        onSubmit={(event) => {
          event.preventDefault();
          onPick(custom);
        }}
      >
        <input
          className="challenge-input"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder="是我自己看出来的，上面没有"
          maxLength={20}
        />
        <button type="submit" className="challenge-submit" disabled={custom.trim().length === 0}>
          就是这一招
        </button>
      </form>
    </>
  );
}
