# 接口契约

契约版本：**v3**

本文件说明前端与未来硬件客户端如何与后端协作。核心原则只有一条：
**客户端必须先协商能力，再决定发送什么，不得假设服务端支持某种模态。**

---

## 能力协商

```
GET /api/health
```

```json
{
  "ok": true,
  "contract": "v3",
  "modalities": { "input": ["text"], "output": ["text"] }
}
```

| 字段 | 含义 |
|---|---|
| `contract` | 契约版本。v3 收窄 grade 为 3-6，端点只剩拆解、读者回应、访问门槛三类，另加埋点 |
| `modalities.input` | 服务端当前接受的内容类型 |
| `modalities.output` | 服务端当前能返回的内容类型 |

本期 `input` / `output` 都只有 `text`。客户端看到能力声明就该知道不能发音频。

---

## 现存的三个业务端点

```
POST /api/v3/analyze    拆解一篇范文（内置范文命中预处理，不调模型）
POST /api/v3/reader     回应孩子自己写的那一句（读者人格）
POST /api/access        访问门槛：问要不要密码、试密码
```

三者外加埋点（见下）的请求/响应形状以 `server/src/routes/` 下的校验函数为准——
那里是唯一事实源，本文不复制一份，复制品会和代码漂移。已知的硬约束：

- `analyze` 的 `grade` 只接受 **3-6**（1-2 年级不做，识字量读不完一篇范文）
- `analyze` 必须带 `essayText`，超长直接拒绝，**不截断了事**
- `reader` 的 `childText` 会先过危机规则，命中就返回固定引导话术、不调模型
- 内部错误一律返回通用文案，不透出堆栈或上游原文（规范§四.3）

---

## 埋点（v3 新增）

```
POST /api/v3/track   记一批行为事件。body: { events: [{ event, sid, props }] }
GET  /api/v3/stats   读聚合结果
```

**只计数，不带身份。** 属性走白名单（`server/src/analytics.js` 的 `EVENTS`），
白名单外的字段在服务端被丢掉，**结构上不可能**把姓名学校写进日志——
不靠"我记得别传"。会话 id 是客户端生成的随机数，不由任何个人信息派生。

事件名与各自允许的属性：

| 事件 | 属性 |
|---|---|
| `enter` / `start` | — |
| `grade_pick` | `grade` |
| `essay_pick` | `grade`, `source`(builtin/pasted) |
| `analyze_done` | `grade`, `moves`, `precomputed`, `degraded`, `ms` |
| `move_collect` | `grade`, `from`(essay/own/spotted) |
| `move_use` | `grade` |
| `spotted` | `grade`, `origin`(listed/custom) |
| `spotted_skipped` | `grade` |
| `written` | `grade`, `ms` |
| `reader_done` | `grade`, `degraded`, `ms` |

**不存任何原文**：孩子写了什么、范文是哪篇，一律不落盘。
`track` 永远返回 `ok`，哪怕事件不合法——埋点没有资格让孩子的点击失败。

---

## 为什么这样设计而不一开始就用多模态消息数组

一个"内容片段数组"的形状（`[{type:"text",text}]`）看起来更能面向未来，
但它要求每一层都为一种本期不存在的数据类型付出成本：路由要校验 parts、
入库要序列化 parts、拼 prompt 要拍平 parts、评测用例要写数组、
前端每条渲染路径要 map/filter。

真正让硬件接入无需改契约的，是**能力协商机制**加**契约版本号**——
客户端问一句"你支持什么"，比客户端猜"我发个数组你一定能吃"更稳。
本期只做文本，等真有多模态需求时，`modalities` 后面加一项就是一次增量。

对外表述建议写"接口按能力协商设计，为多模态扩展预留"，
**不要写"支持语音"**。
