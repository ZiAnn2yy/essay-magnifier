import './StageGate.css';
import { STAGES } from '../data/mockFilm.js';

/**
 * 入口：选年级。
 *
 * 为什么要选到"年级"而不是只选"学段带"：挑词的开关在三年级
 * （课标把"有新鲜感的词句"放在第二学段 3-4 年级），而学段带是 1-3 / 4-6。
 * 三年级落在低段里，所以只选段定不了行为，必须选到年级。
 *
 * `?grade=` 是给录屏和评审用的深链：录演示视频时每次 take 都从点年级开始
 * 太浪费，直接带参数进工作台。它不改变产品流程，只是跳过入口。
 */
const MARQUEE_FRAMES = [
  '我们家房子后面有一间小工坊，是爷爷的。',
  '一推门进去，全是木头和旧茶的味道。',
  '阳光从唯一那扇窗户照进来，落在爷爷粗糙的手背上。',
  '爷爷的手很粗糙，可是很暖。',
  '我把刨花扫成一堆，跳进去。',
];

export default function StageGate({ onPick }) {
  return (
    <main className="gate">
      <div className="gate-inner">
        <header className="gate-head">
          <p className="gate-kicker">语文作文 · 学伴</p>
          <h1 className="gate-title">
            我的小电影
            <span className="gate-title-en">MY LITTLE FILM</span>
          </h1>
          <p className="gate-lead">
            你写一句，它就变成一格。写满一篇，就能<i>放给他们看</i>。
          </p>
        </header>

        <div className="gate-reel" aria-hidden="true">
          <div className="gate-reel-track">
            {[0, 1].map((copy) => (
              <div className="gate-reel-run" key={copy}>
                {MARQUEE_FRAMES.map((text) => (
                  <span className="gate-reel-cell" key={text}>
                    {text}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <section className="gate-stages" aria-label="选择年级">
          <h2 className="gate-q">你现在几年级？</h2>

          {STAGES.map((stage, stageIndex) => (
            <div className="gate-band" key={stage.id}>
              <div className="gate-band-head">
                <span className="gate-band-label">{stage.label}</span>
                <span className="gate-band-blurb">{stage.blurb}</span>
              </div>
              <div className="gate-grades">
                {stage.grades.map((grade) => (
                  <button
                    type="button"
                    key={grade}
                    className="gate-grade"
                    style={{
                      '--card-accent':
                        stageIndex === 0 ? 'var(--yellow)' : 'var(--pink)',
                    }}
                    onClick={() => onPick(grade)}
                  >
                    <span className="gate-grade-num">{grade}</span>
                    <span className="gate-grade-unit">年级</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <footer className="gate-foot">
          <p>你写的每一句都存在这台设备上。我们不问你的名字，也不问你的学校。</p>
        </footer>
      </div>
    </main>
  );
}
