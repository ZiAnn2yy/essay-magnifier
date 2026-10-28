# ===== DevCloud 部署 Dockerfile =====
# 移植自 dogdog，保留其中三条已踩过的 DevCloud 硬规则：
#   端口 8080、绑定 0.0.0.0、用 vanilla 基础镜像
#   （平台预处理器会替换为京东云镜像并注入 npm 源）
#
# 与 dogdog 的关键差异：不把 .env 拷进镜像。
# 容器内的模型配置由 DevCloud 平台的环境变量注入，不要改用拷贝文件的方式。

# ===== 阶段 1：构建前端 =====
FROM node:22-slim AS client-build
WORKDIR /build/client

# 先装依赖，利用 Docker 层缓存
COPY client/package.json client/package-lock.json ./
RUN npm ci --quiet --no-fund --no-audit

COPY client/ ./
RUN npm run build

# ===== 阶段 2：运行时（server + 构建好的前端）=====
FROM node:22-slim
WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --quiet --no-fund --no-audit --omit=dev

# 只拷 server 源码；.env 已被 .dockerignore 排除，不会进入镜像
COPY server/ ./server/

# 拷入阶段 1 的前端产物，路径与 app.js 里解析的 ../../client/dist 一致
COPY --from=client-build /build/client/dist ./client/dist

# DevCloud 硬性规则：只暴露 8080
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

WORKDIR /app/server
# --no-warnings 用于压掉 node:sqlite 的 ExperimentalWarning，避免污染演示日志
CMD ["node", "--no-warnings", "src/index.js"]
