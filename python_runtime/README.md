# Python Runtime（LiteLLM + FastAPI Middleware + SQLAlchemy + ChromaDB + Jinja2）

这个目录承接四层替换：

1. 模型中间层：`app/model/litellm_service.py`（LiteLLM）
2. 安全中间件：`app/middleware/safety.py`（FastAPI Middleware）
3. 数据连接层：`app/data/sqlalchemy_connector.py` + `app/data/chroma_connector.py`
4. Prompt 层：`app/prompt/templates/*.j2` + `app/prompt/service.py`

## 启动方式

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r python_runtime/requirements.txt
npm run dev:py-runtime
```

## 与 Node 主链联动

`Analyze/Search/Output` 是否走 Python Runtime，已改为由 Settings 主口径控制（`settings.pythonRuntime`）：

```bash
# settings.pythonRuntime.enabled=true
# settings.pythonRuntime.strictMode=true
# settings.pythonRuntime.baseUrl=http://127.0.0.1:8008
```

## LiteLLM 配置

```bash
PY_RUNTIME_LITELLM_MODEL=gpt-4o-mini
PY_RUNTIME_LITELLM_API_BASE=
PY_RUNTIME_LITELLM_API_KEY=
```

支持本地 Ollama 的 LiteLLM model 形式（示例）：

```bash
PY_RUNTIME_LITELLM_MODEL=ollama/qwen2.5:7b
```

## 本地 + 云端混合路由（推荐）

可按模块分别路由到本地模型或云端 API：

```bash
PY_RUNTIME_MODEL_ROUTING_ENABLED=true
PY_RUNTIME_MODEL_FALLBACK_ENABLED=true

# Analyze / Search 走本地，Output Script 走云端
PY_RUNTIME_MODEL_ROUTE_ANALYZE=local
PY_RUNTIME_MODEL_ROUTE_SEARCH=local
PY_RUNTIME_MODEL_ROUTE_SCRIPT=cloud

# 本地通道（Ollama 示例）
PY_RUNTIME_LITELLM_LOCAL_MODEL=ollama/qwen2.5:7b
PY_RUNTIME_LITELLM_LOCAL_API_BASE=http://127.0.0.1:11434
PY_RUNTIME_LITELLM_LOCAL_API_KEY=

# 云端通道（OpenAI / Azure 由 LiteLLM 统一接）
PY_RUNTIME_LITELLM_CLOUD_MODEL=gpt-4o-mini
PY_RUNTIME_LITELLM_CLOUD_API_BASE=
PY_RUNTIME_LITELLM_CLOUD_API_KEY=
```

接口可选传参 `modelRoute=local|cloud` 覆盖模块默认路由。
