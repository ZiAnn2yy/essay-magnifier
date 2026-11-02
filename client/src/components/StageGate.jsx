import './StageGate.css';
import FlowWash from './FlowWash.jsx';
import { BANDS } from '../data/writingBands.js';
import { track } from '../lib/track.js';

/**
 * 入口：选年级。
 *
 * 为什么选到"年级"而不是学段带：拆解深度按年级分叉（三、四年级招式少而具体，
 * 五、六年级要多说一层"和读者的关系"），带是 3-4 / 5-6，选带定不了行为。
 *
 * `?grade=` 深链给录屏和评审用：每次 take 都从点年级开始太浪费。
 * 只接受 3-6——1-2 年级不做，见 data/writingBands.js 文件头。
 */
export default function StageGate({ onPick }) {
  return (
    <main className="gate">
      <FlowWash />

      <div className="gate-inner">
        <header className="gate-head">
          <p className="gate-kicker">语文写作 · 范文拆解</p>
          <h1 className="gate-title">
            范文放大镜
            <span className="gate-title-en">LOOK CLOSER</span>
          </h1>
          <p className="gate-lead">
            拆开一篇范文，看看它是怎么写成的。学一招，写你自己的。
          </p>
        </header>

        <section className="gate-stages" aria-label="选择年级">
          <h2 className="gate-q">你现在几年级？</h2>

          {BANDS.map((band, bandIndex) => (
            <div className="gate-band" key={band.id}>
              <div className="gate-band-head">
                <span className="gate-band-label">{band.label}</span>
                <span className="gate-band-blurb">{band.note}</span>
              </div>
              <div className="gate-grades">
                {band.grades.map((grade) => (
                  <button
                    type="button"
                    key={grade}
                    className="gate-grade"
                    style={{
                      '--card-accent': bandIndex === 0 ? 'var(--yellow)' : 'var(--pink)',
                    }}
                    onClick={() => {
                      track('grade_pick', { grade });
                      onPick(grade);
                    }}
                  >
                    <span className="gate-grade-num">{grade}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
