import './StartScreen.css';
import { ESSAYS } from '../data/essays.js';

/**
 * 第一拍：开始。
 *
 * 为什么单独给一屏"开始"：孩子打开一个学习工具时，第一眼看到的如果是表格、
 * 表单或者一篇要读的说明，他就认定"这是作业"。一屏只有一个大按钮，
 * 按下去才进入选择——这是游戏的节拍，不是表单的节拍。
 *
 * 跑马灯里滚的是真范文里的句子，不是装饰文案：让它第一眼就知道
 * 这个东西里面装的是作文，而且是可以被拆开的作文。
 */
const MARQUEE = ESSAYS.flatMap((essay) =>
  essay.text
    .split('\n')
    .slice(0, 2)
    .map((line) => line.trim())
    .filter((line) => line.length > 0),
);

export default function StartScreen({ onStart }) {
  return (
    <main className="start">
      <div className="start-inner">
        <header className="start-head">
          <p className="start-kicker">语文写作</p>
          <h1 className="start-title">范文放大镜</h1>
          <p className="start-lead">
            拆开一篇范文，看看它是怎么写成的。
            <br />
            学一招，写你自己的。
          </p>
        </header>

        <div className="start-marquee" aria-hidden="true">
          <div className="start-marquee-track">
            {[0, 1].map((copy) => (
              <div className="start-marquee-run" key={copy}>
                {MARQUEE.map((line) => (
                  <span className="start-marquee-cell" key={line}>
                    {line}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <button type="button" className="start-go" onClick={onStart}>
          <span className="start-go-text">开始</span>
          <span className="start-go-arrow" aria-hidden="true">
            ▸
          </span>
        </button>

        <footer className="start-foot">
          <p>你写的东西存在这台设备上。我们不问你的名字，也不问你的学校。</p>
        </footer>
      </div>
    </main>
  );
}
