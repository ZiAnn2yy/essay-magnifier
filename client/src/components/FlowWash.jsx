import './FlowWash.css';

/**
 * 一层缓慢横移的光带。
 *
 * 贴纸的"落"是一条动线，光带是另一条：它一直在动，但没有方向性，
 * 所以不会和落贴纸抢注意力，只是让屏幕"活着"。
 *
 * 为什么不用粒子/Canvas：这一层要的是"有风经过"，
 * 不是"有很多东西在飞"。一个渐变加一个长周期位移就够，
 * 引一个动画库来做它是净亏（规范§三：不加新依赖）。
 *
 * 必须放在有 z-index 控制的容器里（见 StartScreen/StageGate 的样式），
 * 否则会盖在内容上。
 */
export default function FlowWash() {
  return <div className="flow-wash" aria-hidden="true" />;
}
