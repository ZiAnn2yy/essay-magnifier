/**
 * 把一段文字从一个元素"飞"到另一个元素。
 *
 * 用于写完一招之后的激励时刻：孩子写的那句从写作坞飞进顶栏的作文本，
 * 本子计数当场跳一下。**不引动画库**——一次性的位移动画用 FLIP 就够，
 * 为它加一个依赖不划算（规范§三：不加新依赖）。
 *
 * FLIP：先量起点和终点的位置，把元素定位到起点，下一帧再移到终点，
 * 中间交给 CSS transition。这样动画跑在合成层上，不触发重排。
 *
 * @param {HTMLElement} source 起点元素（孩子写的那句所在的容器）
 * @param {HTMLElement} target 终点元素（顶栏的作文本按钮）
 * @param {string} text 要飞的字
 */
export function flyTextTo(source, target, text) {
  if (!source || !target || typeof text !== 'string' || text.length === 0) return;

  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width === 0 || to.width === 0) return;

  const ghost = document.createElement('div');
  ghost.textContent = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  ghost.style.cssText = [
    'position:fixed',
    `left:${from.left}px`,
    `top:${from.top}px`,
    `width:${Math.min(from.width, 320)}px`,
    'z-index:60',
    'padding:8px 12px',
    'font-family:var(--font-round)',
    'font-size:15px',
    'line-height:1.6',
    'color:var(--ink)',
    'background:var(--yellow)',
    'border:3px solid var(--ink)',
    'border-radius:14px',
    'box-shadow:0 5px 0 rgba(23,56,77,.16)',
    'pointer-events:none',
    'transition:transform .62s cubic-bezier(.34,1.4,.64,1), opacity .62s ease-in',
  ].join(';');

  document.body.appendChild(ghost);

  const dx = to.left + to.width / 2 - (from.left + Math.min(from.width, 320) / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);

  requestAnimationFrame(() => {
    // 缩小着飞过去：越飞越小，最后落进本子里
    ghost.style.transform = `translate(${dx}px, ${dy}px) scale(.18) rotate(${dx > 0 ? 12 : -12}deg)`;
    ghost.style.opacity = '0.2';
  });

  window.setTimeout(() => ghost.remove(), 700);
}

/** 让目标元素"咚"一下——计数跳动用。 */
export function punch(element) {
  if (!element) return;
  element.classList.remove('is-punched');
  // 强制重排，否则连续点第二次时类还没被去掉，动画不会重放
  void element.offsetWidth;
  element.classList.add('is-punched');
  window.setTimeout(() => element.classList.remove('is-punched'), 420);
}
