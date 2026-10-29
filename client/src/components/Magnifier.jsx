import './Magnifier.css';

/**
 * 放大镜。产品的名字就是它，而它此前一帧都没出现过——
 * 一个叫"范文放大镜"的工具，首屏没有放大镜， recognition 无从谈起。
 *
 * 手绘感来自三处，全是 SVG 与 CSS，不引素材：
 *   1. 镜片画两道圈，第二道微微偏——一笔画不准的那种痕迹
 *   2. 粗圆头描边 + 实心偏移投影，和纸上贴的东西同一套语言
 *   3. 镜片里有一道白光慢慢扫过，像真有光掠过镜面
 *
 * 装饰性元素一律 aria-hidden：读屏软件不该念一个放大镜。
 */
export default function Magnifier({ className = '' }) {
  return (
    <svg
      className={`magnifier ${className}`.trim()}
      viewBox="0 0 200 200"
      role="img"
      aria-label="放大镜"
    >
      {/* 实心偏移投影：厚纸板签名，不用模糊阴影 */}
      <g className="magnifier-shadow" aria-hidden="true">
        <circle cx="86" cy="86" r="56" />
        <rect x="118" y="118" width="72" height="20" rx="10" transform="rotate(45 154 128)" />
      </g>

      {/* 镜柄 */}
      <rect
        x="116"
        y="116"
        width="76"
        height="22"
        rx="11"
        fill="var(--orange)"
        stroke="var(--ink)"
        strokeWidth="5"
        transform="rotate(45 154 127)"
      />

      {/* 镜片：两道圈，第二道故意偏一点 */}
      <circle cx="80" cy="80" r="58" fill="rgba(255,255,255,0.72)" />
      <circle
        cx="80"
        cy="80"
        r="58"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <circle
        cx="83"
        cy="77"
        r="50"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.45"
      />

      {/* 镜片里扫过的光 */}
      <g clipPath="url(#magnifier-lens)">
        <rect className="magnifier-shine" x="-70" y="-30" width="46" height="220" rx="23" />
      </g>
      <clipPath id="magnifier-lens">
        <circle cx="80" cy="80" r="57" />
      </clipPath>

      {/* 镜片上一个小高光点 */}
      <circle cx="58" cy="58" r="9" fill="var(--white)" opacity="0.9" />
    </svg>
  );
}
