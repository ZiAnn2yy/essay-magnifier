import './MoveCards.css';

/**
 * 拆解卡片：一篇范文拆出来的几个招式。
 *
 * 每张卡四样：招式名、范文原句、这一句里发生了什么、孩子可以怎么用。
 * 最后一样是**方法级**的——服务端 prompt 明确禁止出"写一句______"这种填空模板，
 * 用户一眼就能看出"这只是填空游戏，不是智能体"。
 *
 * 形态是**一沓摊开的牌**，不是一张竖着摞的列表：
 *   - 每张微旋转、互相压着，读起来像丢在桌上的一沓纸
 *   - 当前那张转正、放大、投影最重；点哪张哪张转正
 *   - 结果回来时**发牌式依次进场**——拆解等了好几秒，成果不该静悄悄地出现
 *
 * 旋转放在外层、进场动画放在内层：两者都改 transform，混在一层上会互相覆盖
 * （animation 的填充态会压过 transition 的静止态）。
 */
export default function MoveCards({ moves, activeMoveId, onSelect, onUse, onCollect, collected }) {
  if (moves.length === 0) {
    return (
      <div className="moves moves-empty">
        <p className="moves-empty-title">这一篇没能拆出招式</p>
        <p className="moves-empty-hint">
          模型这次没返回可用的拆解结果。换一篇试试，或者把作文贴短一点。
        </p>
      </div>
    );
  }

  return (
    <div className="moves">
      <h3 className="moves-title">这篇用了 {moves.length} 招</h3>

      <ol className="moves-list">
        {moves.map((move, index) => {
          const isActive = move.id === activeMoveId;
          const isCollected = collected.includes(move.id);
          // 扇形：奇数往右、偶数往左，交替才不会显得乱
          const fan = isActive ? 0 : index % 2 === 0 ? -1.6 : 1.8;

          return (
            <li
              key={move.id}
              className={`move${isActive ? ' is-active' : ''}`}
              style={{
                '--move-accent': index % 2 === 0 ? 'var(--orange)' : 'var(--pink)',
                '--fan': `${fan}deg`,
                '--i': index,
                zIndex: isActive ? 5 : moves.length - index,
              }}
            >
              <div className="move-deal">
                <div className="move-head">
                  <span className="move-index">{index + 1}</span>
                  <h4 className="move-name">{move.name}</h4>
                </div>

                <p className="move-quote">{move.quote}</p>
                <p className="move-why">{move.why}</p>

                <p className="move-try">
                  <span className="move-try-label">你可以怎么用</span>
                  {move.tryThis}
                </p>

                <div className="move-actions">
                  <button
                    type="button"
                    className="move-use"
                    onClick={() => {
                      onSelect(move.id);
                      onUse(move);
                    }}
                  >
                    用这一招
                  </button>
                  <button
                    type="button"
                    className={`move-collect${isCollected ? ' is-collected' : ''}`}
                    onClick={() => onCollect(move)}
                    disabled={isCollected}
                  >
                    {isCollected ? '已收进册子' : '收进册子'}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
