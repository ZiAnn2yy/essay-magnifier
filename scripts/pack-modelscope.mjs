/**
 * 打包一个用于上传魔搭（ModelScope）创空间的文件夹。
 *
 *   node scripts/pack-modelscope.mjs
 *
 * 产出：D:\比赛\upload-modelscope\（在仓库外，不会污染 git）
 *
 * 为什么单独打包而不是让用户直接传仓库：
 *   1. 仓库里有 .env、node_modules、.git、源码与过程文件，几百万字节，
 *      上传慢，而且 .env 一旦混进去就是红线二事故
 *   2. 平台只需要"能跑起来的最小集"：server 源码 + 构建好的前端 + Dockerfile
 *   3. 打包脚本每跑一次都会重新校验一遍没有敏感文件，
 *      比"我记得删过了"可靠
 *
 * 打完之后会打印一份清单和体积，上传前对着看一遍。
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, '..', 'upload-modelscope');

/** 绝对不能进上传包的东西。命中就中止，不自己判断"这个应该没关系"。 */
const FORBIDDEN = ['.env', 'node_modules', '.git', '.joycode', '.oil-ui', 'dist.zip'];

/** 递归算体积 */
function sizeOf(target) {
  const stat = statSync(target);
  if (stat.isFile()) return stat.size;
  let total = 0;
  for (const entry of readdirSafe(target)) {
    total += sizeOf(join(target, entry));
  }
  return total;
}

function readdirSafe(dir) {
  try {
    return readFs(dir);
  } catch {
    return [];
  }
}

import { readdirSync as readFs } from 'node:fs';

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// ---- 0. 前置检查：构建产物必须在 ----
const distPath = join(root, 'client/dist');
if (!existsSync(distPath)) {
  console.error('client/dist 不存在，先跑 cd client && npm run build');
  process.exit(1);
}

// ---- 1. 清空旧产物 ----
if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// ---- 2. 拷 server（源码 + 依赖清单，不带 .env 和 node_modules）----
mkdirSync(join(out, 'server'), { recursive: true });
cpSync(join(root, 'server/src'), join(out, 'server/src'), { recursive: true });
cpSync(join(root, 'server/package.json'), join(out, 'server/package.json'));
cpSync(join(root, 'server/package-lock.json'), join(out, 'server/package-lock.json'));

// ---- 3. 拷构建好的前端 ----
mkdirSync(join(out, 'client'), { recursive: true });
cpSync(distPath, join(out, 'client/dist'), { recursive: true });

// ---- 4. Dockerfile（魔搭版，端口 7860）----
writeFileSync(
  join(out, 'Dockerfile'),
  `# 范文放大镜 · 魔搭创空间部署
#
# 与仓库根目录那份（京东云 DevCloud 用）的差别只有端口：
# DevCloud 硬性要求 8080，魔搭默认 7860。
# 端口统一从 PORT 环境变量读，代码里没有写死。
#
# 前端产物已经构建好放在 client/dist，所以镜像里不装 vite、
# 不跑 build——平台构建时间越短，翻车机会越少。

FROM node:22-slim
WORKDIR /app

# 只装运行期依赖。server 只有 express/cors/dotenv 三个。
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --quiet --no-fund --no-audit

COPY server/ ./server/
COPY client/dist ./client/dist

# 必须绑 0.0.0.0，容器外才可达（server/src/index.js 已经这么做了）
ENV PORT=7860
ENV NODE_ENV=production
EXPOSE 7860

WORKDIR /app/server
CMD ["node", "--no-warnings", "src/index.js"]
`,
  'utf-8',
);

// ---- 5. README（作品内容零个人信息：不写学校、姓名、指导教师）----
writeFileSync(
  join(out, 'README.md'),
  `# 范文放大镜

拆开一篇优秀范文，让孩子看清"它是怎么写成的"；学一招，写他自己的。

## 它做什么

- **拆解**：把一篇范文交给智能体，拿回"每一段在整篇里干什么"和"这篇用了哪几招"，
  每一招都指着范文里的原句
- **用一招写自己的**：孩子挑一招，写一两句自己的事
- **读者回应**：一个"刚读完的人"回应他写的句子——引用原句、说读到什么、
  最多问一个他答得上来的问题，不给建议、不列条目
- **招式收藏册**：学到一招收进去，册子越攒越厚

## 面向谁

小学 3-6 年级。1-2 年级不做：识字量读不完一篇范文，而课标第一学段的要求是
"乐于运用词语"，不是篇章质量。

## 运行

\`\`\`bash
cd server && npm ci --omit=dev && npm start
\`\`\`

首次访问需要输入访问密码。密码由部署方在环境变量 \`ACCESS_CODE\` 里设置；
留空则不设门槛（本地开发和录演示视频用这条）。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| \`LLM_API_URL\` | OpenAI 兼容的模型端点 |
| \`LLM_API_KEY\` | 模型 Key。**只存在于服务端**，不进前端、不进镜像历史 |
| \`LLM_MODEL\` | 模型名 |
| \`ACCESS_CODE\` | 访问密码，留空不设门槛 |
| \`PORT\` | 监听端口，默认 7860 |

## 说明

- 内置范文全部是本组自撰的**示例范文**，不冒充教材范文或学生真作
- 真实使用路径是"粘贴任意一篇"：原文只在请求里流转，不落库
- 画面由排版、SVG 与 CSS 生成，不使用生成式图片或视频
`,
  'utf-8',
);

// ---- 6. 打包后自检：确认没有敏感文件混进去 ----
const problems = [];
(function walk(dir) {
  for (const entry of readdirSafe(dir)) {
    const full = join(dir, entry);
    const isDir = statSync(full).isDirectory();
    if (FORBIDDEN.includes(entry)) {
      problems.push(`命中止录项: ${relative(out, full)}`);
      continue;
    }
    if (isDir) walk(full);
  }
})(out);

// Key 形态扫描
const secretPattern = /sk-[A-Za-z0-9]{20,}|LLM_API_KEY=[^\s]+|Bearer [A-Za-z0-9._-]{20,}/;
(function scan(dir) {
  for (const entry of readdirSafe(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      scan(full);
      continue;
    }
    if (!/\.(js|json|md|html|css|txt|yml|yaml)$/.test(entry)) continue;
    const text = readFileSync(full, 'utf-8');
    if (secretPattern.test(text)) problems.push(`疑似 Key: ${relative(out, full)}`);
  }
})(out);

console.log(`打包完成：${out}`);
console.log(`总体积：${human(sizeOf(out))}`);
console.log('');
console.log('顶层内容：');
for (const entry of readdirSafe(out)) {
  const full = join(out, entry);
  const kind = statSync(full).isDirectory() ? '目录' : '文件';
  console.log(`  ${kind}  ${entry}  ${human(sizeOf(full))}`);
}

if (problems.length > 0) {
  console.log('');
  console.log('!! 自检发现问题，上传前必须处理：');
  for (const problem of problems) console.log('  - ' + problem);
  process.exit(1);
}

console.log('');
console.log('自检通过：无 .env / node_modules / .git，未发现 Key 形态字符串。');
