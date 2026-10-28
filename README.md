# 教育陪伴智能体

面向学习者的陪伴式智能体：不直接给答案，用提问引导学习者自己推出结论，
并跨会话记住学习者的状态。

参赛项目：第二届全国人工智能应用创新大赛 · 教育命题域。

---

## 三条红线

优先级高于本文档其他任何内容。

1. **作品内容零个人信息。** 智能体界面、PPT、答辩视频、录屏、代码注释、
   README、`package.json` 的 `author` 字段，一律不得出现学校名称、
   学生姓名、指导教师信息。学习者标识由服务端随机生成，
   本工程不提供任何让用户填写姓名/学校的输入框。
2. **API Key 不下前端。** Key 只存在于 `server/`，通过环境变量读取。
   `.env` 同时被 `.gitignore` 和 `.dockerignore` 排除；
   生产环境通过 DevCloud 平台的环境变量注入，不拷贝进镜像。
3. **期限。** 作品提交截止 2026-11-10 24:00。截止前 3 天冻结新功能。

---

## 技术栈

React + Vite + Node.js + Express + 京东云 JoyCode 模型 API（OpenAI 兼容）
+ 京东云 DevCloud 部署。不使用 TypeScript，不引入新技术栈。

完整规范见 [`编程规范.md`](./编程规范.md)，那是本工程的唯一先行文件。

---

## 目录结构

```
edu-agent/
├── 编程规范.md            # 项目规范，唯一先行文件
├── CLAUDE.md              # 每次会话自动加载的规范摘要
├── client/                # React + Vite 前端（智能体的其中一个客户端）
├── server/                # Express 后端
│   ├── src/
│   │   ├── agent/         # 智能体内核：不 import express，硬件客户端可直搬
│   │   ├── model/         # JoyCode 客户端：超时 + 重试≤2 + 降级
│   │   ├── memory/        # node:sqlite 学习者状态
│   │   ├── safety/        # 危机信号规则引擎（模型无权覆盖）
│   │   ├── routes/        # HTTP 层
│   │   └── lib/           # 校验、错误、脱敏日志
│   ├── eval/              # 评测集
│   └── scripts/           # JoyCode 能力 spike
├── scripts/check-secrets.sh  # 提交前 Key 自检
├── docs/contract.md       # 接口契约与能力协商
└── Dockerfile             # DevCloud 部署
```

---

## 快速开始

```bash
# 后端
cd server
npm ci
cp .env.example .env      # 然后自己填 LLM_API_URL / LLM_API_KEY / LLM_MODEL
npm start                 # 没填 Key 也能起：/api/health 可用，/api/chat 返回降级话术

# 前端（另开一个终端）
cd client
npm ci
npm run dev
```

打开 http://localhost:5173 。

---

## 提交前必做

```bash
bash scripts/check-secrets.sh
```

检查三件事：`.env` 已被忽略且未被 git 跟踪、已跟踪文件里没有 Key 形态字符串、
`.dockerignore` 已排除 `.env`。**不通过就不要提交。**

---

## 评测

```bash
cd server
node --no-warnings eval/run.js
```

8 条离线用例不依赖模型，无 Key 也能跑；在线用例需要 Key。

---

## 当前状态

**工程骨架期。** 已就绪：工程外壳、接口契约、模型调用层（含超时重试降级）、
Function Calling 主循环、学习者状态存储、危机信号规则引擎、前端功能壳、评测集骨架。

待与指导教师沟通后确定：知识卡片内容与题库、system prompt 具体教学法文案、
界面视觉方向（须过 `oil-ui`）、评测集内容用例。

---

## 已知限制

- **会话状态不跨部署保留。** SQLite 库文件落在容器文件系统里，
  DevCloud 重新部署后会重置。对外表述应为"会话状态在容器生命周期内持久化"。
- **无认证。** 目前 `learnerId` 只是一个随机标识，不是身份凭证。
  若评审需要登录，需另加最小认证层。
- **`node:sqlite` 在 Node 22 仍是实验特性。** 启动脚本用 `--no-warnings`
  压掉告警；换机部署时先确认 Node 版本。
