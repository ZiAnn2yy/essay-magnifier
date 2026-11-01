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
export default function MoveCards({
  moves,
  activeMoveId,
  onSelect,
  onUse,
  onSwitch,
  onCollect,
  collected,
}) {
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

  // 只有一篇招式时"换一招"没有意义——换过去还是它自己
  const canSwitch = moves.length > 1;

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
              className={`move${isActive ? ' is-active' : ''}${isCollected ? ' is-collected' : ''}`}
              style={{
                '--move-accent': index % 2 === 0 ? 'var(--orange)' : 'var(--pink)',
                '--fan': `${fan}deg`,
                '--i': index,
                // 置顶那张要压在其它牌上面，否则滚动时会被后来者盖住。
                // 10 是量过的：高于所有兄弟牌（最多到 moves.length），
                // 但仍低于册子面板（20）和飞字/飞牌（55-60）——
                // 奖励那一刻必须看得见，不能被置顶卡挡住。
                zIndex: isActive ? 10 : moves.length - index,
              }}
            >
              <div className="move-deal">
                <div className="move-head">
                  <span className="move-index">
                    <span className="move-index-num">{index + 1}</span>
                  </span>
                  <h4 className="move-name">{move.name}</h4>
                </div>

                <p className="move-quote">{move.quote}</p>
                <p className="move-why">{move.why}</p>

                <p className="move-try">
                  <span className="move-try-label">你可以怎么用</span>
                  {move.tryThis}
                </p>

                <div className="move-actions">
                  {/* 置顶那张的主操作换成「换一招」。
                      卡片本身不可点，「用这一招」是唯一入口；而一旦某张置顶，
                      其它牌的按钮就被它压着，得滚过它才点得到（用户 11-01 抓到的）。
                      换成在这里直接切下一篇，不用滚。
                      色块用 --sky 而不是橙：这是"换个方向"，不是"开始用"。 */}
                  {isActive && canSwitch ? (
                    <button
                      type="button"
                      className="move-switch"
                      onClick={() => onSwitch?.(move)}
                    >
                      换一招
                    </button>
                  ) : (
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
                  )}
                  <button
                    type="button"
                    className={`move-collect${isCollected ? ' is-collected' : ''}`}
                    onClick={(event) =>
                      onCollect(move, event.currentTarget, index % 2 === 0 ? 'var(--orange)' : 'var(--pink)')
                    }
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
