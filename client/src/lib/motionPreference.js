/**
 * 动效偏好。
 *
 * 为什么需要这个开关：产品是给 8-12 岁孩子用的，**动效是内容的一部分**——
 * 落贴纸、发牌、那句飞进作文本，全是反馈本身。而浏览器会按系统设置报告
 * `prefers-reduced-motion: reduce`，我原先在每处都老实把动画全关了，
 * 结果有前庭障碍需求的用户得到安静版本（应该的），
 * 但只是顺手关掉了 Windows 动画效果的人，得到的是一个看起来坏掉的产品：
 * 贴纸退到 6 个固定高度堆成几团，屏幕上什么都不动。
 *
 * 所以分三态，默认听系统的，但把最终选择权交回用户：
 *   - 系统没要求 → 开
 *   - 系统要求减少动效 → 关（这是无障碍的默认，不该擅自改）
 *   - 用户在此显式选过 → 听用户的，覆盖系统
 *
 * 存在 localStorage，同一台设备下次进来还记得。
 */

const KEY = 'fw.motion';

function systemPrefersReduced() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** 'on' | 'off'。没显式选过时跟随系统。 */
export function getMotion() {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === 'on' || saved === 'off') return saved;
  } catch {
    // localStorage 被禁用时退到系统偏好，不该因此报错
  }
  return systemPrefersReduced() ? 'off' : 'on';
}

export function setMotion(value) {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // 存不下去就只是这次会话生效，不打断
  }
  applyMotion();
}

/** 把状态写到 <html> 的 class 上，CSS 只认这一个类，不分散判断。 */
export function applyMotion() {
  const root = document.documentElement;
  root.classList.toggle('motion-on', getMotion() === 'on');
  root.classList.toggle('motion-off', getMotion() === 'off');
}

export function toggleMotion() {
  const next = getMotion() === 'on' ? 'off' : 'on';
  setMotion(next);
  return next;
}
