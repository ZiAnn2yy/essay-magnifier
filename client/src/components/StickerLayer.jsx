import './StickerLayer.css';

/**
 * 持续往下落的招式贴纸。
 *
 * 贴纸上写的是**模型真的拆出来的招式名**（把动作放慢写、用味道开头……），
 * 不是装饰文案——所以这一层既是氛围，也是"这里面到底有什么"的预告。
 * 落下去的每一张都可能变成孩子下一篇作文里的一招。
 *
 * 为什么是"落"而不是"撒"：撒在桌上的是背景，落下来的才有流动感。
 * 用户要的是动态循环，所以这里做成一绺不断往下掉、掉出屏幕再从顶上回来的贴纸：
 * 每张有不同的横向位置、下落时长和出发时间，错开后就是一个个接连落下。
 *
 * 透明度刻意压低（0.5 左右）：它们是背景，不是内容。
 * 压过正文的贴纸是噪音——这正是"丰盛感"和"杂乱"的分界。
 */
const STICKERS = [
  // 开头怎么进场
  { text: '用味道开头', x: 8, dur: '11s', delay: '0s', rot: -8 },
  { text: '先写一双手在干什么', x: 22, dur: '13s', delay: '-4.5s', rot: 7 },
  { text: '用一个声音开头', x: 37, dur: '9.5s', delay: '-2s', rot: -4 },
  // 把句子写具体
  { text: '把动作放慢写', x: 51, dur: '14s', delay: '-7s', rot: 9 },
  { text: '拿一样东西去比另一样', x: 64, dur: '10.5s', delay: '-5.5s', rot: 5 },
  { text: '用一个东西代替形容词', x: 78, dur: '12.5s', delay: '-1.5s', rot: -6 },
  { text: '把冷写进身体里', x: 91, dur: '11.5s', delay: '-8.5s', rot: 4 },
  // 让人物活起来
  { text: '用手的感觉写亲人', x: 14, dur: '13.5s', delay: '-3.5s', rot: -9 },
  { text: '让读者听见声音', x: 29, dur: '10s', delay: '-6.5s', rot: 6 },
  { text: '把小雨点写得看得见', x: 44, dur: '15s', delay: '-10s', rot: -5 },
  // 结构和收尾
  { text: '一件事分成三步写', x: 58, dur: '12s', delay: '-9s', rot: 8 },
  { text: '结尾留个味道', x: 71, dur: '11s', delay: '-2.8s', rot: -7 },
  { text: '结尾不说再见', x: 85, dur: '13.8s', delay: '-5.8s', rot: 3 },
  { text: '开头和结尾用同一个东西', x: 12, dur: '14.5s', delay: '-11.5s', rot: -3 },
  // 观察世界的方式
  { text: '写小得没人注意的东西', x: 26, dur: '10.8s', delay: '-7.8s', rot: 5 },
  { text: '写变化的过程', x: 40, dur: '12.8s', delay: '-4.2s', rot: -8 },
  { text: '把颜色写具体', x: 55, dur: '11.8s', delay: '-1.2s', rot: 6 },
  { text: '借一个不存在的东西说心事', x: 69, dur: '15.5s', delay: '-8.8s', rot: -4 },
];

export default function StickerLayer() {
  return (
    <div className="scatter" aria-hidden="true">
      {STICKERS.map((sticker, index) => (
        <span
          key={sticker.text}
          className={`scatter-item tint-${index % 3 === 0 ? 'yellow' : index % 3 === 1 ? 'pink' : 'orange'}`}
          style={{
            left: `${sticker.x}%`,
            '--dur': sticker.dur,
            '--delay': sticker.delay,
            '--rot': `${sticker.rot}deg`,
            // 静态落点只在关动效时用：不动的时候也得让贴纸待在屏幕上，
            // 不能因为关了动画就全部消失。落点按索引铺满整屏，
            // 不挤在少数几个高度——挤在一起会读成"坏了"而不是"静态版"。
            '--y': `${8 + (index * 4.6) % 84}vh`,
          }}
        >
          {sticker.text}
        </span>
      ))}
    </div>
  );
}
