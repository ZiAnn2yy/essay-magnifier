import { useState } from 'react';
import './Gate.css';

/**
 * 访问门槛页。
 *
 * 形态是**一个输入框**：不记身份、不设用户名、输错不锁定。
 * 理由见 server/src/auth/access-code.js——评专家卡在门外是要扣分的，
 * 而"防爆破"对一个所有评委共享的密码没有意义。
 *
 * 样式刻意朴素：复用现有令牌，不新开配色。这不是产品的脸，
 * 是一道门，它的本分是别让人多想。
 */
export default function Gate({ onUnlocked }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onUnlocked(code);
    } catch (submitted) {
      setError(submitted.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="gate-lock">
      <form className="gate-lock-card" onSubmit={handleSubmit}>
        <h1 className="gate-lock-title">范文放大镜</h1>
        <p className="gate-lock-lead">这个工具需要访问密码才能用。</p>

        <label className="gate-lock-label" htmlFor="access-code">
          访问密码
        </label>
        <input
          id="access-code"
          className="gate-lock-input"
          type="password"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="请输入密码"
          autoComplete="current-password"
          autoFocus
        />

        {error && (
          <p className="gate-lock-error" role="alert">
            {error}
          </p>
        )}

        <button className="gate-lock-submit" type="submit" disabled={busy || code.length === 0}>
          {busy ? '在试了…' : '进去'}
        </button>

        <p className="gate-lock-hint">密码由发放链接的人一起给你。</p>
      </form>
    </main>
  );
}
