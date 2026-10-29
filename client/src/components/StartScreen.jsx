import './StartScreen.css';
import Magnifier from './Magnifier.jsx';
import StickerLayer from './StickerLayer.jsx';
import FlowWash from './FlowWash.jsx';
import MotionToggle from './MotionToggle.jsx';
import { ESSAYS } from '../data/essays.js';

/**
 * 第一拍：开始。
 *
 * 为什么单独给一屏"开始"：孩子打开一个学习工具时，第一眼看到的如果是表格、
 * 表单或者一篇要读的说明，他就认定"这是作业"。一屏只有一个大按钮，
 * 按下去才进入选择——这是游戏的节拍，不是表单的节拍。
 *
 * 这一屏要过儿童设计的三个自检，缺一个就是又滑回成人审美：
 *   - **丰盛感**：撒满真实的招式贴纸，屏幕不能大半个空着
 *   - **反馈**：按下去真的沉到底，不是只换个颜色
 *   - **惊喜**：放大镜是这一屏的主角，它此前一帧都没出现过——
 *     一个叫"范文放大镜"的工具，首屏没有放大镜
 *
 * 跑马灯里滚的是真范文里的句子，不是装饰文案。
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
      <FlowWash />
      <StickerLayer />

      <div className="start-inner">
        <header className="start-head">
          <div className="start-titles">
            <p className="start-kicker">语文写作</p>
            <h1 className="start-title">范文放大镜</h1>
            <p className="start-lead">
              拆开一篇范文，看看它是怎么写成的。
              <br />
              学一招，写你自己的。
            </p>
          </div>
          <Magnifier className="start-magnifier" />
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

        <MotionToggle />
      </div>
    </main>
  );
}
