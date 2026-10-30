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

/**
 * 把一张小牌从卡片飞进顶栏的册子。
 *
 * 和 flyTextTo 的分工：**句子飞黄便签，招式飞小白牌**。
 * 两者都是"自己按下去的那一下"的回应，但收进册子的是两样东西，
 * 飞同一个样子孩子就分不清刚收的是什么。
 *
 * 牌的形态照 MoveCards 的静态语言缩印：白底、粗描边、左边一道彩色厚边
 * （那一抹是这一招的 accent，由调用方传进来）。
 *
 * @param {HTMLElement} source 起点元素（「收进册子」按钮所在的卡片）
 * @param {HTMLElement} target 终点元素（顶栏的册子按钮）
 * @param {string} label 牌上写的字（招式名）
 * @param {string} accent 左边厚边的颜色，一般是 var(--orange) / var(--pink)
 */
export function flyCardTo(source, target, label, accent) {
  if (!source || !target) return;

  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width === 0 || to.width === 0) return;

  const text = typeof label === 'string' && label.length > 0 ? label : '一招';

  const ghost = document.createElement('div');
  ghost.textContent = text.length > 8 ? `${text.slice(0, 8)}…` : text;
  ghost.style.cssText = [
    'position:fixed',
    `left:${from.left}px`,
    `top:${from.top}px`,
    'z-index:55',
    'padding:6px 11px',
    'font-family:var(--font-round)',
    'font-size:13px',
    'font-weight:700',
    'line-height:1.4',
    'color:var(--ink)',
    'background:var(--white)',
    'border:3px solid var(--ink)',
    `border-left:8px solid ${accent ?? 'var(--orange)'}`,
    'border-radius:var(--r-md)',
    'box-shadow:var(--lift-sm)',
    'pointer-events:none',
    'transition:transform .58s cubic-bezier(.34,1.4,.64,1), opacity .58s ease-in',
  ].join(';');

  document.body.appendChild(ghost);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);

  requestAnimationFrame(() => {
    // 一边缩小一边歪过去：收进册子是被"收"走，不是被"放"进去
    ghost.style.transform = `translate(${dx}px, ${dy}px) scale(.3) rotate(${dx > 0 ? 14 : -14}deg)`;
    ghost.style.opacity = '0.15';
  });

  window.setTimeout(() => ghost.remove(), 640);
}
