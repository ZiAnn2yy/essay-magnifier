import { useEffect, useState } from 'react';
import './MotionToggle.css';
import { getMotion, toggleMotion } from '../lib/motionPreference.js';

/**
 * 动效开关。
 *
 * 存在的理由：动效是这个产品的内容，不是装饰。落贴纸、发牌、那句飞进作文本，
 * 全是反馈本身。而浏览器会按系统设置报告"请少放动画"——
 * 我只是顺手关掉 Windows 动画效果的话，得到的应该是一个完整的产品，
 * 而不是一个看起来坏掉的界面。
 *
 * 所以默认跟随系统（有前庭障碍需求的用户仍然默认得到安静版本），
 * 但把最终选择权摆在明面上，一行字说清当前状态。
 */
export default function MotionToggle({ placement = 'corner' }) {
  const [motion, setMotion] = useState(getMotion);

  useEffect(() => {
    setMotion(getMotion());
  }, []);

  function handleClick() {
    setMotion(toggleMotion());
  }

  return (
    <button
      type="button"
      className={`motion-toggle is-${placement}`}
      onClick={handleClick}
      aria-pressed={motion === 'on'}
      title={motion === 'on' ? '点一下关掉动效' : '点一下开启动效'}
    >
      <span className="motion-toggle-dot" aria-hidden="true" />
      {motion === 'on' ? '动效开着' : '动效关着'}
    </button>
  );
}
