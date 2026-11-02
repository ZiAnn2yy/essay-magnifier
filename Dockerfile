# ===== 魔搭创空间部署 Dockerfile =====
# 2026-11-02 从京东云 DevCloud 迁到魔搭：端口 8080 → **7860**。
# 8080 是 DevCloud 的硬规则，魔搭创空间要的是 7860——迁目标时只改了文档
# 没改这个文件，照旧传上去空间会起不来（平台探 7860，容器听 8080）。
# 保留的两条硬规则不变：绑 0.0.0.0（见 src/index.js）、用 vanilla 基础镜像。
#
# 与 DevCloud 版的另一个关键差异：不把 .env 拷进镜像。
# 容器内的模型配置由平台的环境变量注入，不要改用拷贝文件的方式。

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

# 魔搭创空间要求容器听 7860。用 ENV 而不是写死——平台若自己注入 PORT，
# 注入值会盖掉这个默认值，两种情况都对
ENV PORT=7860
ENV NODE_ENV=production
EXPOSE 7860

WORKDIR /app/server
# --no-warnings 用于压掉 node:sqlite 的 ExperimentalWarning，避免污染演示日志
CMD ["node", "--no-warnings", "src/index.js"]
