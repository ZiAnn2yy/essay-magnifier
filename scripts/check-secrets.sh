#!/usr/bin/env bash
# 提交前 Key 自检。
#
# 规范§〇红线二：Key 不下前端、不进 git、不进镜像。
# dogdog 的前车之鉴：.env 被刻意保留在 Docker 构建上下文里，导致模型 Key
# 被打进镜像并上传到 DevCloud。本脚本是把这类事故挡在提交之前的那道闸。
#
# 用法：bash scripts/check-secrets.sh
# 退出码 0 = 通过；1 = 发现问题，不要提交。

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

status=0
in_git_repo=0
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  in_git_repo=1
fi

echo "== 1. .env 必须被忽略且未被 git 跟踪 =="
if [ "$in_git_repo" -eq 1 ]; then
  if git check-ignore -q server/.env; then
    echo "  ok    server/.env 已被 .gitignore 忽略"
  else
    echo "  FAIL  server/.env 没有被忽略，请检查 .gitignore"
    status=1
  fi

  if git ls-files --error-unmatch server/.env >/dev/null 2>&1; then
    echo "  FAIL  server/.env 已被 git 跟踪，请先 git rm --cached"
    status=1
  else
    echo "  ok    server/.env 未被跟踪"
  fi
else
  echo "  skip  当前不是 git 仓库"
fi

echo "== 2. 扫描已跟踪文件中的 Key 形态 =="
PATTERNS=(
  'sk-[A-Za-z0-9]{20,}'
  'LLM_API_KEY=[^[:space:]]'
  'Bearer [A-Za-z0-9._-]{20,}'
)

# 这两个文件里也有上面那几条模式串——它们自己就是扫描器，模式是它们的工具。
# 不排除的话，每次提交前自检都会把"正则字面量"当成"真 Key"报出来，
# 红得多了就没人看了。**只排除这两个文件，别图省事整个 scripts/ 都排除。**
SCANNERS=(
  'scripts/check-secrets.sh'
  'scripts/pack-modelscope.mjs'
)

if [ "$in_git_repo" -eq 1 ]; then
  for pattern in "${PATTERNS[@]}"; do
    excludes=(':!*.example')
    for scanner in "${SCANNERS[@]}"; do
      excludes+=(":!$scanner")
    done
    hits="$(git grep -nEI "$pattern" -- . "${excludes[@]}" 2>/dev/null || true)"
    if [ -n "$hits" ]; then
      echo "  FAIL  命中模式 [$pattern]："
      echo "$hits" | sed 's/^/        /'
      status=1
    else
      echo "  ok    未命中 [$pattern]"
    fi
  done
else
  echo "  skip  当前不是 git 仓库，改用全盘 grep"
  for pattern in "${PATTERNS[@]}"; do
    grep_args=(--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude='*.example')
    for scanner in "${SCANNERS[@]}"; do
      grep_args+=("--exclude=$(basename "$scanner")")
    done
    hits="$(grep -rnEI "$pattern" . "${grep_args[@]}" 2>/dev/null || true)"
    if [ -n "$hits" ]; then
      echo "  FAIL  命中模式 [$pattern]："
      echo "$hits" | sed 's/^/        /'
      status=1
    else
      echo "  ok    未命中 [$pattern]"
    fi
  done
fi

echo "== 3. 镜像构建上下文不得包含 .env =="
if grep -qE '^\s*\.env' .dockerignore 2>/dev/null; then
  echo "  ok    .dockerignore 已排除 .env"
else
  echo "  FAIL  .dockerignore 没有排除 .env"
  status=1
fi

echo
if [ "$status" -eq 0 ]; then
  echo "通过：未发现 Key 泄露风险。"
else
  echo "未通过：请先处理上述 FAIL 项再提交。"
fi
exit "$status"
