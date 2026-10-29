import './StickerLayer.css';

/**
 * 撒在桌面上的招式贴纸。
 *
 * 贴纸上写的是**模型真的拆出来的招式名**（把动作放慢写、用味道开头……），
 * 不是装饰文案——所以这一层既是氛围，也是"这里面到底有什么"的预告。
 *
 * 为什么用绝对定位铺满视口：贴纸要落在内容两边的空白里，
 * 放在内容流里只会把正文挤窄。绝对定位不参与布局计算，
 * 外层 overflow:hidden 保证靠边的贴纸被裁掉而不是把文档撑宽
 * （开始屏已经因为这个坑返工过一次：max-content 的轨道把 grid 撑破）。
 */
const STICKERS = [
  { text: '把动作放慢写', x: 5, y: 16, rot: -8, tint: 'yellow', delay: '0s', dur: '4.2s' },
  { text: '用味道开头', x: 80, y: 12, rot: 7, tint: 'pink', delay: '-1.4s', dur: '5.1s', wideOnly: true },
  { text: '把冷写进身体里', x: 9, y: 63, rot: -4, tint: 'orange', delay: '-2.6s', dur: '4.7s' },
  { text: '拿一样东西去比另一样', x: 77, y: 57, rot: 9, tint: 'yellow', delay: '-0.8s', dur: '5.6s', wideOnly: true },
  { text: '结尾留个味道', x: 13, y: 85, rot: 5, tint: 'pink', delay: '-3.4s', dur: '4.4s' },
  { text: '把小雨点写得看得见', x: 74, y: 83, rot: -6, tint: 'orange', delay: '-2s', dur: '5.2s', wideOnly: true },
];

export default function StickerLayer() {
  return (
    <div className="scatter" aria-hidden="true">
      {STICKERS.map((sticker) => (
        <span
          key={sticker.text}
          className={`scatter-item tint-${sticker.tint}${sticker.wideOnly ? ' is-wide-only' : ''}`}
          style={{
            left: `${sticker.x}%`,
            top: `${sticker.y}%`,
            '--rot': `${sticker.rot}deg`,
            '--delay': sticker.delay,
            '--dur': sticker.dur,
          }}
        >
          {sticker.text}
        </span>
      ))}
    </div>
  );
}
