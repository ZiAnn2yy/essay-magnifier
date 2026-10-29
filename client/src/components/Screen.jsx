import './Screen.css';
import { markSegments } from '../lib/highlight.js';

/**
 * 大银幕：当前这一句被放大成"画面"。
 *
 * 这是整个产品的兑现点——孩子写的不是一行字，是一格电影。
 * 所以英语原句必须是绝对主角（Fredoka 超粗、最大字号），
 * 中文意思退成字幕，界面 chrome 全部让位。
 */
export default function Screen({ frame, index, total, picksEnabled }) {
  if (!frame) {
    return (
      <section className="screen screen-empty">
        <p className="screen-empty-text">第一格，写什么？</p>
        <p className="screen-empty-sub">把你最先想到的那句写下来</p>
      </section>
    );
  }

  // 挑不挑词在**渲染时**按年级决定，不存进数据。
  // 存进去的话，中途改年级就会出现"这一格亮、那一格不亮"的撕裂状态；
  // 而且种子里写死的 picks 会绕过学段开关（这个 bug 真犯过）。
  const picks = picksEnabled && frame.picks ? frame.picks : [];

  return (
    <section className="screen" aria-live="polite">
      <span className="screen-tag en">
        {index + 1} / {total}
      </span>

      {/* key 让换格时整个节点重建，滑入和荧光笔动画才会重放 */}
      <div key={frame.id} className="screen-body">
        <p className="screen-text">
          {markSegments(frame.text, picks).map((segment, segmentIndex) =>
            segment.isMark ? (
              <em key={`mark-${segmentIndex}`}>{segment.text}</em>
            ) : (
              <span key={`text-${segmentIndex}`}>{segment.text}</span>
            ),
          )}
        </p>
      </div>

      {/* 底部信息带：银幕的"下沿"。
          有挑中的词才显示这一带——低年级恒为空，那整带就不出现，
          银幕只做一件事：让孩子看见自己写的字被放大了。 */}
      {picks.length > 0 && (
        <div className="screen-foot">
          <div className="screen-picks">
            <span className="screen-picks-label">有新鲜感的词</span>
            <span className="screen-picks-list">
              {picks.map((word, pickIndex) => (
                <span
                  className="screen-pick"
                  key={`${word}-${pickIndex}`}
                  style={{ animationDelay: `${0.3 + pickIndex * 0.14}s` }}
                >
                  {word}
                </span>
              ))}
            </span>
          </div>
        </div>
      )}

      {/* 改过的格子要留痕。课标把"修改自己的习作"放在核心位置，
          所以"我改过这一句"必须看得见，不能悄悄覆盖掉 */}
      {frame.revision > 0 && (
        <span className="screen-rev" title={frame.previous ?? ''}>
          改过 {frame.revision} 次
        </span>
      )}

      <span className="screen-corner" aria-hidden="true">
        ▸
      </span>
    </section>
  );
}
