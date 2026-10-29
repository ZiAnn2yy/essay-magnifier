---
name: 激励功能选型结论
description: edu-agent 激励功能（作文→漫画/绘本）的路线决策与被否方案（lemo-opuscar、ai-comic-factory）
type: project
---

激励功能需求已从"生成视频"收窄为"生成漫画/绘本"（静态产物）。既定路线：**预制素材库 + LLM 只当导演（输出分镜 JSON 引用素材 ID）+ 前端排版/翻页放映**。

**Why:** 比赛部署 DevCloud（node:22-slim、端口 8080），演示现场要秒级出结果；用户嫌现场生成 SVG 难看、嫌生图/生视频 API 慢且有儿童内容审核风险；截止 2026-11-10。曾评估过的方案均被否：
- lemo-opuscar：Claude Code 插件，做一支片 30–60 分钟，跑在服务器资源够但时长/形态/模型三个卡点，只能提取式借鉴（DIRECTOR.md 导演方法论、适龄风格 STYLE.md）
- jbilcke-hf/ai-comic-factory（1368★ Apache-2.0）：唯一像样的漫画项目，但已 archived、Next.js+TS 技术栈不符（CLAUDE.md 禁止引入新技术栈）、生图仍依赖外部 API（VideoChain/Replicate/SDXL），不可整体集成，可借鉴其"LLM 分镜 + 画板 + 网页分格排版"架构与排版 UI 思路
- 40G 内存服务器澄清：装 ffmpeg/Python 无障碍，真正的卡点是渲染时长，不是资源

**How to apply:** 后续实现激励功能时，直接按"素材库+导演"路线做，不要再调研整包集成的开源生图/生视频项目；素材生产可在赛前离线进行（服务器用来分发而非生产）。server/scripts/probe-kimi.js 可用于验证 JoyCode 是否有生图端点，验证前不要押宝生图 API。