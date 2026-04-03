#!/bin/bash

set -e
export OLLAMA_KEEP_ALIVE=24h

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo ">>> 项目根目录: $PROJECT_ROOT"
echo ">>> 检查配置文件..."

if [ ! -f "$PROJECT_ROOT/config/database.env" ]; then
  echo "缺少配置文件: config/database.env"
  exit 1
fi

if [ ! -f "$PROJECT_ROOT/config/model.env" ]; then
  echo "缺少配置文件: config/model.env"
  exit 1
fi

set -a
source "$PROJECT_ROOT/config/database.env"
source "$PROJECT_ROOT/config/model.env"
set +a

if [ -n "$LOCAL_LLM_BASE_URL" ] && [ -n "$LOCAL_LLM_MODEL" ]; then
  echo ">>> 预热本地模型..."

  OLLAMA_API_BASE="${LOCAL_LLM_BASE_URL%/v1}"

  curl -s "$OLLAMA_API_BASE/api/generate" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$LOCAL_LLM_MODEL\",\"prompt\":\"你好\",\"stream\":false,\"keep_alive\":\"24h\"}" \
    >/dev/null || echo ">>> 本地模型预热失败，请检查 Ollama 是否启动"
fi

echo ">>> 启动 mock-server..."
cd "$PROJECT_ROOT"
node mock-server/server.js