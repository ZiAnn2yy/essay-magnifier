import './StickerLayer.css';

/**
 * 持续往下落的招式贴纸。
 *
 * 贴纸上写的是**模型真的拆出来的招式名**（把动作放慢写、用味道开头……），
 * 不是装饰文案——所以这一层既是氛围，也是"这里面到底有什么"的预告。
 *
 * 为什么是"落"而不是"撒"：撒在桌上的是背景，落下来的才有流动感。
 * 用户要的是动态流动，所以这里做成一绺不断往下掉的贴纸：
 * 每张有不同的横向位置、下落时长和出发时间，看着就像一个个接连落下。
 *
 * 透明度刻意压低（0.5 左右）：它们是背景，不是内容。
 * 压过正文的贴纸是噪音——这正是"丰盛感"和"杂乱"的分界。
 */
const STICKERS = [
  { text: '把动作放慢写', x: 6, dur: '11s', delay: '0s', rot: -8 },
  { text: '用味道开头', x: 18, dur: '13s', delay: '-4.5s', rot: 7 },
  { text: '把冷写进身体里', x: 31, dur: '9.5s', delay: '-2s', rot: -4 },
  { text: '拿一样东西去比另一样', x: 44, dur: '14s', delay: '-7s', rot: 9 },
  { text: '结尾留个味道', x: 57, dur: '10.5s', delay: '-5.5s', rot: 5 },
  { text: '把小雨点写得看得见', x: 69, dur: '12.5s', delay: '-1.5s', rot: -6 },
  { text: '用手的感觉写亲人', x: 81, dur: '11.5s', delay: '-8.5s', rot: 4 },
  { text: '让读者听见声音', x: 92, dur: '13.5s', delay: '-3.5s', rot: -9 },
  { text: '用一个东西代替形容词', x: 12, dur: '15s', delay: '-10s', rot: 6 },
  { text: '结尾不说再见', x: 74, dur: '10s', delay: '-6.5s', rot: -5 },
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
            // 静态落点只在 prefers-reduced-motion 下用：不动的时候
            // 也得让贴纸待在屏幕上，不能因为关了动画就全部消失
            '--y': `${12 + (index % 5) * 16}vh`,
          }}
        >
          {sticker.text}
        </span>
      ))}
    </div>
  );
}
