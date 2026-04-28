# Sales Support Agent Frontend

前端使用 `React + TypeScript + Vite`，后端联调依赖本仓库内的 `mock-server`、`python_runtime`、`Redis` 和可选的 `Jaeger`。

## 架构文档

项目正式按 `P0 安全与规则层 + P1 协调层 + P2 模块能力层 + P2.5 数据访问层 + P3 界面层 + 监控层` 管理工程边界。

- [ARCHITECTURE.md](ARCHITECTURE.md)：正式工程架构边界，包含每层允许做什么和不允许做什么。
- [代码分类与功能说明.md](代码分类与功能说明.md)：日常开发时的文件归类速查。

## 快速开始

安装依赖：

```bash
npm install
```

常用开发命令：

```bash
npm run dev
npm run dev:mock
npm run dev:py-runtime
npm run type-check
```

默认端口：

- 前端 `Vite`: `http://127.0.0.1:5173`
- Express `mock-server`: `http://127.0.0.1:3001`
- 内部数据层: mock-server 进程内 `mock-server/data/sqlite.db`，该文件是本地运行态数据库，不进入 Git 提交。
- Python runtime: `http://127.0.0.1:8008`
- Jaeger UI: `http://127.0.0.1:16686`

## 一键本地联调

项目已经内置一套本地启动和回归验证脚本，入口在 [scripts/local-stack.mjs](scripts/local-stack.mjs)。

推荐直接使用：

```bash
npm run stack:run
```

这条命令会自动做这些事：

- 启动缺失的 `Jaeger / python_runtime / mock-server / Vite`
- 如果发现服务已经在本机运行，则直接复用
- 通过前端代理实际跑一遍 `analyze-context -> search-references -> generate-content`
- 默认执行 `Jaeger` trace 校验
- 默认执行 `npm run type-check`

拆分命令如下：

```bash
npm run stack:up
npm run stack:verify
npm run stack:down
```

对应含义：

- `stack:up`：只拉起本地联调依赖
- `stack:verify`：只做健康检查和链路回归
- `stack:down`：只停止这套脚本自己启动的服务，不会误杀你手动启动的进程
- `stack:run`：先启动，再执行完整验证

## 回归验证内容

`stack:verify` 和 `stack:run` 默认会校验：

- `mock-server /health`
- `mock-server /internal/data/external-connections`
- `python_runtime /health`
- `Vite` 首页可访问
- 通过前端代理完成：
  - `POST /api/agent/analyze-context`
  - `POST /api/agent/search-references`
  - `POST /api/agent/generate-content`
- `Jaeger` 中是否已接收到 `mock-server` 的业务 Span
- TypeScript 类型检查是否通过

每次验证都会输出报告到：

```bash
mock-server/test-results/local-stack/
```

日志也会按服务分别落盘到同一目录。`mock-server/test-results/`、`test-results/` 和 `test-evidence/` 都是本地测试证据目录，默认不进入 Git 提交。

## 常用参数

如果你只想快速验证主链路，可以跳过部分检查：

```bash
npm run stack:verify -- --no-type-check
npm run stack:verify -- --no-jaeger
npm run stack:run -- --no-type-check --no-jaeger
```

可选环境变量：

```bash
LOCAL_STACK_VERIFY_JAEGER=false
LOCAL_STACK_TYPE_CHECK=false
LOCAL_STACK_MOCK_BASE_URL=http://127.0.0.1:3001
LOCAL_STACK_PYTHON_BASE_URL=http://127.0.0.1:8008
LOCAL_STACK_VITE_BASE_URL=http://127.0.0.1:5173
JAEGER_UI_URL=http://127.0.0.1:16686
```

## 环境准备

建议提前准备：

- Node.js 18+
- Python 3
- 本地 Redis
- 可选的 Jaeger all-in-one

mock-server 会在进程内初始化 `mock-server/data/sqlite.db` 作为 P2.5 内部数据层，同时继续保留 Redis 或内存上下文存储。Redis 不可用时，后端会退回到内存存储模式；SQLite 写入失败也不会阻断原有 `/api/agent/*` 回复。

P2.5 是内部数据库层，不作为前端或外部系统的公开 API。它只保存外部连接的接口密钥引用和历史对话数据；本地大模型、云模型连接、当前启用模型和模型路由仍属于 P2 模块插件。内部验证可使用本机请求，例如 `curl http://127.0.0.1:3001/internal/data/sessions`。

## 安全与部署边界

- 本地运行态文件不进入 Git：`data/*.db`、`mock-server/data/*.db`、`*.jsonl`、`data/secretVault.json`、`mock-server/test-results/`、`test-results/`、`test-evidence/`。
- 文档、样例和 `.env.example` 只能保留环境变量名、`replace-with-local-secret`、`secret://...` 等占位内容，不能写入真实接口密钥、认证令牌或主密钥。
- `admin-ui` 只能作为受信内部管理台使用，生产部署必须放在受保护网络或网关鉴权后。
- `api-gateway` 的渠道 webhook 当前不建议直接公网暴露；公网接入前必须补齐平台签名校验和边界鉴权。
- `platform-manager/.env.example` 中的 `ADMIN_TOKEN=change-me` 仅是占位符，不可作为生产 token 使用。

## 说明

前端开发服务的 `/api` 请求会通过 [vite.config.ts](vite.config.ts) 代理到 `http://127.0.0.1:3001`，因此页面联调时默认走的是本地 `mock-server`。
