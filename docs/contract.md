# 接口契约

契约版本：**v1**

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
  "contract": "v1",
  "modalities": { "input": ["text"], "output": ["text"] }
}
```

| 字段 | 含义 |
|---|---|
| `contract` | 契约版本。破坏性变更会升到 `v2`，`v1` 的行为不变 |
| `modalities.input` | 服务端当前接受的内容类型 |
| `modalities.output` | 服务端当前能返回的内容类型 |

本期 `input` / `output` 都只有 `text`。`POST /api/chat` 的请求体里
预留了 `audioUrl` 字段但尚未实现，因此它**不**出现在 `modalities.input` 里——
客户端看到能力声明就该知道不能发音频。

---

## 建档

```
POST /api/learner
```

```json
{ "ok": true, "learnerId": "…" }
```

`learnerId` 由服务端用 `crypto.randomUUID()` 生成。
**不收集姓名、学校等任何个人信息**（规范§〇红线一）。

```
GET /api/learner/:learnerId
```

```json
{
  "ok": true,
  "learner": { "id": "…", "createdAt": "…", "lastActiveAt": "…" },
  "mastery": [{ "knowledge_point": "…", "level": 0, "updated_at": "…" }]
}
```

---

## 对话

```
POST /api/chat
```

请求：

```json
{
  "learnerId": "必填，建档时返回的 UUID",
  "sessionId": "可选，省略则新建会话",
  "text": "学习者输入，≤500 字",
  "audioUrl": "预留字段，v1 未实现"
}
```

响应：

```json
{
  "ok": true,
  "sessionId": "…",
  "text": "学伴的回复",
  "reasoning": [{ "phase": "analysis", "text": "…" }],
  "citations": [{ "source": "…", "locator": "…" }],
  "suggestions": ["…"],
  "degraded": false
}
```

| 字段 | 说明 |
|---|---|
| `degraded` | `true` 表示走了降级话术（模型未配置或调用失败）。前端应照常展示 `text`，不要重试轰炸 |
| `reasoning` | 双环推理过程，`phase` 取 `analysis` / `solve`。骨架期恒为空数组 |
| `citations` | 引用来源。涉及事实性内容时必须有值 |
| `suggestions` | 给学习者的下一步建议 |

错误响应统一为：

```json
{ "ok": false, "code": "invalid_request", "message": "…" }
```

内部错误一律返回通用文案，不透出堆栈或上游原文（规范§四.3）。

---

## 为什么这样设计而不一开始就用多模态消息数组

一个"内容片段数组"的形状（`[{type:"text",text}]`）看起来更能面向未来，
但它要求每一层都为一种本期不存在的数据类型付出成本：路由要校验 parts、
入库要序列化 parts、拼 prompt 要拍平 parts、评测用例要写数组、
前端每条渲染路径要 map/filter。

而 `audioUrl` 这个可空字段已经完成了"预留"这件事。
真正让硬件接入无需改契约的，是上面的**能力协商机制**加**契约版本号**——
客户端问一句"你支持什么"，比客户端猜"我发个数组你一定能吃"更稳。

对外表述建议写"接口按能力协商设计，为多模态扩展预留"，
**不要写"支持语音"**。
