import { useState, useEffect } from 'react';
import './TaskDock.css';
import { askReader } from '../api.js';
import { track } from '../lib/track.js';

/**
 * 阶段三：用一招写自己的，然后给"读者"看。
 *
 * 这是产品的闭环——拆解不是终点，"用这一招写一句自己的"才是。
 * AI 在这里的身份是**读者**不是老师：它回应孩子刚写出的句子，
 * 不替他决定下一句写什么。这条边界写在服务端 READER prompt 里
 * （"不改他的句子，不告诉他下一句该写什么"）。
 *
 * 等 7 秒的那一下不做成转圈：按钮变"读者在读…"，并把等待说出来。
 * 真模型首 token 6.3s，藏是藏不住的，不如让它有性格。
 *
 * 写完之后的激励分两半，两半都不能省：
 *   - **鼓励的话**：不写"真棒"这种空夸。这句是真的——他写了一句话，
 *     并且刚刚有人读完了它。
 *   - **动态效果**：那句飞进顶栏的作文本，计数当场跳。
 *     由调用方传 onKeep 进来做，因为动画要用到顶栏那个按钮的位置。
 *
 * ## 回信为什么不在 dock 里展开
 *
 * 用户 10-30 说回信太小读着费劲，10-31 问定：回信到达时**先放大到屏幕中央**，
 * 右上角一个 × 收回原位；**收回后 dock 里不留信纸**，顶栏出一个回信入口，
 * 多封能翻看。所以这里只留一个紧凑的「再看这封回信」——不是信纸，是个入口；
 * 信本身归 LetterModal 管。
 *
 * ## 「收进作文本」为什么按句判，不按招判（2026-11-02 改）
 *
 * 原先传进来一个布尔 `kept`（这一招在这一篇里写过没有），写过一句就禁用按钮。
 * 于是孩子改一句再提交、得了新回信，却存不进册子——他刚写的那句话没有地方去。
 * 现在传进来的是 `isKept(句子)`：问的是**这一句**收过没有。
 * 同一招在同一篇里写几句就收几句，证据墙本来就是按招式分組列多句的。
 */
export default function TaskDock({
  move,
  grade,
  essayTitle,
  onKeep,
  isKept,
  onLetter,
  onReopenLetter,
}) {
  const [text, setText] = useState('');
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  const [error, setError] = useState('');
  // 从"选中这一招"到"交给读者"的间隔。它是这个产品唯一的过程指标：
  // 隔得太短可能是随手写的，隔得长说明他真的在想。只记时长，不记内容。
  const mountedAt = Date.now();

  async function handleSubmit(event) {
    event.preventDefault();
    const own = text.trim();
    if (own.length === 0 || status === 'sending') return;

    setStatus('sending');
    setError('');
    try {
      const sentAt = Date.now();
      const data = await askReader({
        moveName: move.name,
        essayTitle,
        childText: own,
      });
      setReply(data.reply);
      setStatus('done');
      track('written', { grade, ms: sentAt - mountedAt });
      // degraded 是答辩要用的：读者回应是唯一的动机引擎，
      // 它降级一次孩子就什么都收不到。这个数说明"我们离外部依赖有多远"。
      track('reader_done', {
        grade,
        degraded: data.degraded === true,
        ms: Date.now() - sentAt,
      });
      // 交给上层存起来并弹出放大镜。这里不渲染信纸——见文件头说明
      onLetter?.({
        moveName: move.name,
        essayTitle,
        mySentence: own,
        reply: data.reply,
        degraded: data.degraded === true,
      });
    } catch (submitted) {
      setError(submitted.message);
      setStatus('error');
    }
  }

  // 任务长度按年级分叉：三、四年级一两句就够，五、六年级到一小段。
  // 依据是课标——第三学段才要求"修改自己的习作"，篇幅要求本来就不同。
  const placeholder =
    grade >= 5
      ? `用「${move.name}」写一件你自己的事。可以多写几句，写成一小段。`
      : `用「${move.name}」写一件你自己的事。写一两句就行。`;

  // 当前这一句收过没有。空句子不算"收过"——按钮在空句子时本来就是禁用的
  const kept = isKept ? isKept(text.trim()) : false;

  return (
    <section className="dock">
      <header className="dock-head">
        <span className="dock-kicker">该你写了</span>
        <h3 className="dock-title">用「{move.name}」写你自己的</h3>
        <p className="dock-tip">{move.tryThis}</p>
      </header>

      <form className="dock-form" onSubmit={handleSubmit}>
        <textarea
          className="dock-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
          rows={4}
          disabled={status === 'sending'}
        />
        <button
          className="dock-submit"
          type="submit"
          disabled={status === 'sending' || text.trim().length === 0}
        >
          {status === 'sending' ? '读者在读…' : '给读者看看'}
        </button>
      </form>

      {status === 'sending' && <WaitNote />}

      {error && (
        <p className="dock-error" role="alert">
          {error}
        </p>
      )}

      {reply && (
        <>
          <p className="dock-cheer">
            这一句是你自己写出来的。它现在有读者了。
          </p>

          {/* 回信本身已经放大到屏幕中央读过了（LetterModal）。这里不留信纸，
              只留一个入口——用户 10-31 问定的。 */}
          <button type="button" className="dock-reopen" onClick={() => onReopenLetter?.()}>
            再看这封回信
          </button>

          <button
            type="button"
            className={`dock-keep${kept ? ' is-kept' : ''}`}
            onClick={() => onKeep?.(text.trim())}
            disabled={kept}
          >
            {kept ? '这一句已经收进作文本了' : '把这一句收进作文本'}
          </button>
        </>
      )}
    </section>
  );
}

/**
 * 等待态。
 *
 * 为什么要分档：真模型一次读者回应实测中位数 31 秒、长尾过 60 秒，
 * 一句话挂在那儿会让人以为卡死了。分档和 Analyzing 同一个路子——
 * 随时间承认"还在写"，不假装快。
 *
 * 每一档文案都做一件事：**说清慢的理由**。第二档那句"他读的是你写的句子，
 * 不是标准答案"是原来就有的，别删——它是这个产品对"慢"的解释，
 * 没有它，等待就只是等待。
 *
 * 2026-11-02 补了第四档：实测同一个读者任务 4.2 / 9.3 / 30.6 / 31.4 / 40.8 / 60+ 秒，
 * 中位数 31 秒、长尾过 60。原来第三档从 25 秒一直显示到结束，
 * 也就是一半的时间只有"马上就好"一句话——而它并不马上。
 * 45 秒之后换成"他读得很慢"：不假装快，也不装作已经快了。
 */
function WaitNote() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const line =
    elapsed < 8
      ? '正在把这句话装进信封……'
      : elapsed < 25
        ? '读者正在拆信。他读的是你写的句子，不是标准答案。'
        : elapsed < 45
          ? '笔尖在纸上沙沙作响，回信马上就好。'
          : '他读得很慢，一句一句在读。';

  return (
    <p className="dock-waiting" role="status">
      {line}
      <span className="dock-waiting-pen" aria-hidden="true" />
    </p>
  );
}
