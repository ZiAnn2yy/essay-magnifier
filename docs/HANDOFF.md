# 交接说明 · 2026-10-29 收工

> 这份是给"下一次打开这个工程的人"（包括我自己）的。
> 今天做了什么、什么被堵住、下一步该干什么，都在这里。
> 详细决策理由看 `wiki/06-决策与待办.md`，别从这里推断。

## 一句话状态

产品方向当天整体转向后已重做完成，**功能闭环能跑通**；
模型侧今天连换两次（Kimi 额度耗尽 → 换 StepFun），**StepFun 只剩一个慢模型，未解决**。

## 今天做完了什么

| 块 | 状态 |
|---|---|
| 方向整体转向（作文学伴 → 范文放大镜） | 完成，旧页面已删并打 tag `old-direction-2026-10-29` 归档 |
| 拆解引擎（检索→生成→核对→自纠错） | 完成，19 条评测锁着 |
| 教学设计知识库 | 完成，7 张卡，全部标 `verified:false`（用户给的是二手转述） |
| 读者人格 | 完成，独立 prompt，**今天重写过一次** |
| 访问门槛 | 完成，`ACCESS_CODE` env，五个动作实测过 |
| 前端三阶段（开始→选年级→选范文→拆解→写一招） | 完成，390/1280 全流程走查无溢出 |
| 范文库 | **20/20/20/19 篇**，分年级动态加载已接上 |
| 魔搭部署打包脚本 | 已写好未跑（`scripts/pack-modelscope.mjs`） |

## 三个必须知道的坑

**1. 模型侧现在是什么状态（明天第一件事）**

- **Kimi 额度耗尽**（429 consumption budget），备份在 `server/.env.kimi.bak`
- **已切到 StepFun**，key 在 `server/.env`（两个文件都已被 gitignore 挡住，见下）
- **`step-5-preview` 是这把 key 唯一能用的模型**——`step-1-8k`/`step-2-16k`/`step-5`/`step-5-flash` 等全部 404
- **`GET /v1/models` 对这把 key 返回 401**，列不出模型清单
- **它是推理模型，而且 reasoning 长度不可预测**，这是最大的问题：

  | max_tokens | 耗时 | 正文 | reasoning | finish |
  |---|---|---|---|---|
  | 1024 | 17.9s | **0 字** | 1624 | length |
  | 2048 | 13.2s | 188 字 | 1924 | stop ✓ |
  | 4096 | 71.4s | **0 字** | 12393 | length |
  | 8192 | 121.8s | — | — | — |

  预算给小了正文全空，给大了它可能想一万多个 token 然后被截断。
  **延迟 13~122 秒，孩子等不起**（Kimi 是 7 秒）。
- 明天要做的：探"关闭思考"的参数（`reasoning_effort` / `enable_thinking` / `reasoning.effort`），
  这把探测跑到一半被用户叫停；或者换一把能开其他模型的 key；或者等 Kimi 额度恢复切回去。

**2. 动效常开，不跟随系统偏好**

用户明确要求。`App.jsx` 模块加载时直接 `classList.add('motion-on')`，
**不看 `prefers-reduced-motion`**。曾经做过听系统的开关，用户要求删掉。
`html.motion-off` 那套 CSS 规则留着当无障碍退路，别当死代码删。

**3. 无头环境验不了动画时钟**

`--dump-dom --virtual-time-budget` 下 `playState` 是 running、`animationName` 生效、
元素已被关键帧定位，但 `currentTime` 停在 0（不走合成器时钟）。
所以"动画到底动不动"只能由用户亲眼确认，**不要报告成已验证**。

**4. 一个差点犯的安全事故（已堵）**

今天备份 Kimi key 到 `server/.env.kimi.bak`，而它**不在 gitignore 规则里**，
差点连 Key 一起提交。已在 `.gitignore` 补 `.env.*` + `!.env.example`。
**以后任何 `.env` 变体都要先 `git check-ignore` 确认再落盘。**

## 下一步（按优先级）

1. **解决模型**（最高优先，其他都堵在这）：关思考参数 → 换 key → 或等 Kimi 额度
2. 额度/模型恢复后：补六年级第 20 篇范文 → 重跑评测确认 19/19
3. **魔搭部署**：`node scripts/pack-modelscope.mjs` → 框架选 docker、免费 CPU、端口 7860
4. **埋点**：评分框架要"用户行为趋势"，现在没数据。只计数、不带身份
5. **三件套**：PPT ≤20 页 / 视频 ≤6 分钟 / 智能体链接附账号密码

## 当前最大风险

**模型侧不稳。** 今天已经因为它中断两次（Kimi 额度、StepFun 慢），
而演示现场模型不可用，产品当场降级——兜底话术是诚实的，但产品不可用。
缓解：演示前确认模型可用且额度充足；把"外部模型依赖"作为风险识别写进 PPT。

## 复核命令

```bash
cd server && node --no-warnings eval/run.js      # 期望 19/19（额度正常时）
cd client && npm run build                       # 期望通过
PORT=3020 node src/index.js                      # 起服务（3000 被占，3010 有旧进程）
bash scripts/check-secrets.sh                    # 提交前必跑
```
