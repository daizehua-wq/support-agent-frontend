# Agent Platform 当前工程架构与排雷路线图 v0.2

> 日期：2026-04-30
> 定位：架构讲解 + 问题归因 + 阶段规划。目标不是改代码，而是把当前工程讲清楚。
>
> **命名约定：** 架构层级使用 L0-L5 (Layout)，项目阶段使用 P0/P1/P2/P3 (Phase)，两者不混用。L 前缀的引用来自 [ARCHITECTURE.md](../ARCHITECTURE.md)，本文档已在 v0.2 完成统一改名。

---

## 当前结论摘要

1. **当前已完成：**
   Task API、Output API、Archive/History、Settings Center、RBAC、Legacy route 兼容、P3 清理、基础门禁与 smoke均已通过。

2. **当前最高风险：**
   Workbench 前端状态机尚未工程级收口，表现为 taskId 生命周期、confirm 生命周期、polling 生命周期和 done/failed 状态优先级不稳定。

3. **当前不应立即做：**
   0.6B 主路径、AutoRun、DB 回归、Settings/Output/History 改造。

4. **下一步：**
   先完成 Workbench 手动主链状态机收口，再接入 0.6B Task Planner，最后做 AutoRun。

---

## 一、架构总览图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Agent Platform 全栈架构                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────┐  ┌──────────────────┐ │
│  │  L3 界面层 (src/)                                  │  │  L5 Platform     │ │
│  │  ┌─────────────┐  ┌────────────┐  ┌────────────┐  │  │  Manager (:3003)  │ │
│  │  │ Pages (9 页面) │─→│ Adapter    │─→│ API Client │  │  │  factoryAgent    │ │
│  │  ├─────────────┤  │ taskApi-   │  │ agent.ts   │  │  │  optimization    │ │
│  │  │ Components   │  │ Adapter.ts │  │ tasks.ts   │  │  │  evolutionSched  │ │
│  │  │ (46 组件)    │  │ → Mock ✓   │  │ settings.ts│  │  └──────────────────┘ │
│  │  ├─────────────┤  │ → API  ✓   │  │ modelCtr.ts│  │                       │
│  │  │ Hooks        │  └────────────┘  │ assistant.ts│ │  ┌──────────────────┐ │
│  │  │ useTaskExec  │                  └──────┬─────┘  │  │  L4 API Gateway  │ │
│  │  ├─────────────┤                         │ proxy   │  │  (:3000)         │ │
│  │  │ Normalizer   │                  ┌──────▼─────┐  │  │  publicApi /v1   │ │
│  │  │ taskNorm.ts  │  ┌────────────┐  │ Vite Proxy │  │  │  channelWebhook  │ │
│  │  └──────┬───────┘  │ Types      │  │ /api→:3001 │  │  └──────────────────┘ │
│  │         │          │ taskPlan.ts│  └──────┬─────┘  │                       │
│  │  Router │          │ output.ts  │         │         │                       │
│  │  (20 路由)│         │ taskArchv  │   ┌─────▼──────┐  │                       │
│  └─────────┼──────────┴────────────┘   │ mock-server │  │                       │
│            │                            │   (:3001)   │  │                       │
│  ╔═════════╪════════════════════════════╪═════════════╪══╗                    │
│  ║ 监控层   │                            │             │  ║                    │
│  ║ tracing ┼── health / alerts / regr ──┤             │  ║                    │
│  ╚═════════╪════════════════════════════╪═════════════╪══╝                    │
│            │                            │             │                       │
│            │        ┌───────────────────┼─────────────┼──────┐               │
│            │        │    L1 任务协调层   │             │      │               │
│            │        │  taskWorkbenchSvc │  runtimeRoutes  │    │               │
│            │        │  assistantCtxSvc │  sessionService  │    │               │
│            │        │  pluginRegistry  │  promptService   │    │               │
│            │        └────────┬─────────┴──────┬──────────┘    │               │
│            │                 │                │                │               │
│            │      ┌──────────▼──┐    ┌───────▼──────┐         │               │
│            │      │ L0 安全与治理│    │ L2 模块能力   │         │               │
│            │      │ rule-engine │    │ analyzeFlow  │         │               │
│            │      │ search-rule │    │ searchFlow   │         │               │
│            │      │ sanitize   │    │ scriptFlow   │         │               │
│            │      │ governance │    │ modelRouter  │         │               │
│            │      │ secretVault│    │ apiLLM/local │         │               │
│            │      └────────────┘    │ dbService    │         │               │
│            │                        │ pyRuntime    │         │               │
│            │                        └──────┬───────┘         │               │
│            │                               │                  │               │
│            │                     ┌─────────▼───────┐          │               │
│            │                     │ L2.5 数据访问    │          │               │
│            │                     │ SQLite (内部)    │          │               │
│            │                     │ externalConn    │          │               │
│            │                     │ session models  │          │               │
│            │                     └─────────────────┘          │               │
│            │                                                  │               │
└────────────┴──────────────────────────────────────────────────┴───────────────┘
```

**服务端口：**
```
Vite 前端开发服务     :5173
mock-server           :3001
api-gateway           :3000
platform-manager      :3003
python-runtime        :8008
Jaeger UI             :16686
```

**调用方向：**
```
L3 → L1 → L0 / L2 / L2.5
L4 API Gateway → L1 (对外渠道)
L5 Platform Manager → L1 (内部管理)
监控层横向观测全部层级
L0 可拦截 / 降级 / 拒绝 L1/L2/L2.5 执行
```

---

## 二、页面职责表

### 2.1 活动页面 (页面：路由一对一)

| 页面 | 路由 | 加载方式 | 核心职责 |
|------|------|----------|----------|
| **HomePage** | `/` | Eager (首屏) | 任务输入入口、最近 N 个任务列表、系统能力状态、快速跳转 Workbench |
| **WorkbenchPage** | `/workbench` | Lazy | 9 状态机驱动的任务计划生成 + 执行看板，核心用户工作界面 |
| **TasksPage** | `/tasks` | Lazy | 历史任务列表，支持 taskTitle/taskType/status 筛选，继续执行入口 |
| **TaskDetailPage** | `/tasks/:taskId` | Lazy | 任务归档详情：Plan 版本、Evidence 版本、Output 版本记录、Analysis/Risk 摘要 |
| **TaskOutputPage** | `/tasks/:taskId/output` | Lazy | Output 工作台：版本切换、重新生成、Markdown 导出、Evidence/Risk 查看 |
| **SettingsPage** | `/settings/overview` | Lazy | 设置管理中心总览 |
| **SettingsModelsPage** | `/settings/models` | Lazy | 模型管理 |
| **SettingsAssistantsPage** | `/settings/assistants` | Lazy | Assistant (助手) 管理 |
| **SettingsDataSourcesPage** | `/settings/data-sources` | Lazy | 外部数据源管理 |
| **SettingsAppsPage** | `/settings/apps` | Lazy | App 管理 |

### 2.2 轻量治理视图 (API-first，深度编辑未完整实现)

| 页面 | 路由 | 加载方式 | 当前状态 |
|------|------|----------|----------|
| **SettingsRulesPage** | `/settings/rules` | Lazy | 已接入 Settings Center 聚合 API，展示规则引擎配置摘要；规则编排/可视化编辑尚未完整实现 |
| **SettingsRuntimePage** | `/settings/runtime` | Lazy | 已接入 ops-dashboard 和 python-runtime health 数据；深度运行时操作面板未完整实现 |
| **SettingsGovernancePage** | `/settings/governance` | Lazy | 已接入 governance/overview 和 governance/history 数据；回滚闭环、差异对比未完整实现 |

### 2.3 旧版路由 (已重定向至 LegacyRouteUpgradeNotice)

`/home` `/history` `/history/:taskId` `/sessions/:id` `/analyze` `/judge` `/search` `/retrieve` `/script` `/compose` `/agent` `/assistant-center` `/manage` `/model-center` `/database-manager` `/apps` `/output/:taskId`

---

## 三、前端 API / Adapter / Normalizer 职责表

### 3.1 API Client 层 (`src/api/`)

| 文件 | 行数 | 职责 | 核心导出 |
|------|------|------|----------|
| `client.ts` | ~60 | **信封层**：统一 GET/POST 信封包裹与 unwrap | `apiGetEnvelope` `apiPostEnvelope` `apiGetData` `apiPostData` |
| `request.ts` | ~30 | **Axios 实例**：180s timeout，proxy /api→:3001、/internal→:3001、/internal/management→:3003 | 默认 axios 实例 |
| `helpers.ts` | ~40 | **信封规范化**：各种嵌套 shape → `ApiEnvelope<T,M>` | `normalizeApiEnvelope` `ApiEnvelope` 类型 |
| `agent.ts` | 1549 | **业务 API 主入口**：judge/analyze/search/retrieve/compose/task-workbench/sessions/assistant-center | 15+ 函数，100+ 类型 |
| `tasks.ts` | ~200 | **Task CRUD**：全部 18 个 v1.1 协议端点封装 | `createTaskPlan` `confirmTask` `getTaskExecution` `getTaskOutput` `regenerateOutput` 等 |
| `settings.ts` | 1041 | **Settings + Governance**：系统配置、治理版本、运维健康 | `getSettings` `saveSettings` `getGovernanceOverview` 等，70+ 类型 |
| `modelCenter.ts` | ~200 | **模型治理**：模型 CRUD、默认模型设置、连接测试 | 完整 CRUD |
| `assistantCenter.ts` | ~200 | **Assistant/Prompt 治理**：CRUD + 发布/激活/删除 | 完整 CRUD |
| `databaseManager.ts` | ~200 | **数据库管理**：DB 连接 + 外部数据源管理 | 完整 CRUD |
| `admin.ts` | ~30 | **内部管理**：App CRUD、内部统计 | 基础 CRUD |
| `permissions.ts` | ~20 | **权限**：GET /api/auth/me | 权限摘要 |
| `settingsCenter.ts` | ~30 | **设置中心聚合**：settings-center 聚合视图查询 | 只读查询 |

### 3.2 Adapter 层 (`src/utils/`)

| 文件 | 行数 | 职责 |
|------|------|------|
| **taskApiAdapter.ts** | 461 | **核心适配器**：API 调用 ↔ Mock fallback 双向路由。所有 task 相关调用（plan/exec/output/tasks/archive）走此文件。`FORCE_MOCK` 模式支持。Client error (4xx) 直接抛错，Server error (5xx) 降级到 mock |
| **taskNormalizer.ts** | 519 | **响应规范化**：snake_case → camelCase、安全枚举值转换、嵌套响应 unwrap、空值兜底。覆盖 plan/exec/output/archive/continue 全部响应 shape |
| **unknownRecord.ts** | ~90 | **类型安全工具**：`readString` `firstString` `asUnknownRecord` `readArrayLike` 等，被所有 normalizer 使用 |
| `permissionAdapter.ts` | ~20 | 权限数据适配 |
| `settingsCenterAdapter.ts` | ~30 | 设置中心数据适配 |
| `agentClientDebug.ts` | ~30 | Agent 请求调试辅助 |

### 3.3 Normalizer (`taskNormalizer.ts`)

**职责：后端返回 → 前端类型安全对象。**

| 输入来源 | Normalizer 函数 | 输出类型 |
|----------|----------------|---------|
| `POST /api/tasks/plans` 响应 | `normalizeTaskPlanResponse` | `TaskPlan` |
| `POST /confirm` / `GET /execution` 响应 | `normalizeTaskExecutionResponse` | `TaskExecution` |
| `GET /output` 响应 | `normalizeOutputResponse` | `OutputDetail` |
| `GET /output/versions` 响应 | `normalizeOutputVersionsResponse` | `{ taskId, currentVersionId, versions[] }` |
| `GET /tasks` 列表 | `normalizeTaskArchiveListResponse` | `TaskArchiveItem[]` |
| `GET /tasks/:id` 详情 | `normalizeTaskArchiveDetailResponse` | `TaskArchiveItem` (扩展) |
| `POST /continue` 响应 | `normalizeContinueTaskResponse` | `{ resumeContext, nextRoute }` |

**安全特性：**
- 所有枚举值通过 `enumValue()` 白名单校验，非法值降级到 fallback
- 所有字段读取通过 `firstString` / `firstPresent` 同时匹配 camelCase / snake_case
- 嵌套 envelope wrapping (root.data.data) 自动 unwrap

---

## 四、后端 Routes / Services 职责

### 4.1 Routes 层 (`mock-server/routes/`)

| 文件 | 行数 | 核心端点 | 所属层 |
|------|------|----------|--------|
| `runtimeRoutes.js` | 2727 | `judge-task` `analyze-context` `search-references` `retrieve-materials` `compose-document` `task-workbench` sessions/assistants | L1 |
| `taskRoutes.js` | 420 | 全部 18 个 task v1.1 协议端点 | L1 |
| `settingsRoutes.js` | 2069 | settings CRUD, governance, ops-dashboard, python-runtime health, security posture | L0/L1/监控 |
| `assistantCenterRoutes.js` | 1311 | Assistant/Prompt CRUD + publish/activate/delete | L0/L1 |
| `modelCenterRoutes.js` | 1354 | Model CRUD + governance | L2 |
| `databaseRoutes.js` | ~200 | Database connections + external sources | L2.5 |
| `fastChannelRoutes.js` | ~50 | Fast channel/plugin workflow | L1 |
| `referencePackRoutes.js` | ~50 | Reference pack CRUD | L2 |
| `settingsCenterRoutes.js` | ~50 | Settings center aggregated views | L3 辅助 |
| `traceRoutes.js` | ~30 | Trace/log viewing | 监控 |
| `authRoutes.js` | ~30 | Auth/permissions | L0 |
| `agentRoutes.js` | 13 | Deprecated placeholder | — |

### 4.2 Services 层 (`mock-server/services/`)

#### L0 安全与治理层

| 文件 | 职责 |
|------|------|
| `securityMiddlewareService.js` | 安全中间件 |
| `sanitizationService.js` | 数据脱敏 |
| `secretVaultService.js` | 密钥仓库管理 |
| `settingsGovernanceService.js` | 设置治理版本管控 |
| `settingsGovernanceBridgeService.js` | 治理 → 设置桥接 |
| `governanceRegistryService.js` | Assistant/Prompt 治理注册表 |
| `governanceAuditService.js` | 审计日志 |
| `assistantGovernanceService.js` | Assistant 治理 CRUD 业务逻辑 |

#### L1 任务协调层

| 文件 | 行数 | 职责 |
|------|------|------|
| **taskWorkbenchService.js** | 542 | **工作台核心**：意图推断 (4 种 intent)、角色提示 (7 种 role)、Assistant 解析、模块路由 (analyze/search/script)、Prompt 绑定、物料包生成 |
| `taskService.js` | 1166 | **任务核心**：内存 Map 存储、TaskPlan 生成 (规则引擎)、理解文本生成、Risk 提示、执行模拟、archive 查询 |
| `taskModelService.js` | ~20 | 任务数据模型 normalization |
| `sessionService.js` | ~100 | Session/Step/Evidence 管理 |
| `sessionTaskAdapter.js` | ~100 | 旧 Session → TaskArchive 只读映射适配 (Phase 1 兼容) |
| `assistantContextService.js` | ~80 | 执行上下文解析 (Assistant profile) |
| `pluginRegistryService.js` | ~30 | 插件注册表 |
| `workflowNodeRegistry.js` | ~30 | 工作流节点注册 |
| `promptService.js` | ~60 | Prompt 模板管理 |
| `settingsService.js` | ~80 | 系统设置读写 |
| `responseService.js` | ~20 | 标准化响应格式 |
| `fastRouter.js` | ~20 | 快速通道路由 |

#### L2 模块能力层

| 文件 | 职责 |
|------|------|
| `analyzeLLMService.js` | LLM-based 分析 |
| `searchAdapterService.js` | 搜索适配器路由 |
| `searchEvidenceBuilder.js` | 证据构造 |
| `searchPolicyService.js` | 搜索策略约束 |
| `searchSummaryService.js` | 搜索结果摘要 |
| `searchTraceService.js` | 搜索链路追踪 |
| `searchAdapterRegistry.js` | 搜索适配器注册 |
| `modelRouter.js` | 模型路由 (local/cloud/embedded) |
| `apiLLMService.js` | 云端 LLM API |
| `localLLMService.js` | 本地 LLM (node-llama-cpp) |
| `localModelHealthService.js` | 本地模型健康监控 |
| `databaseService.js` | 数据库操作 (SQLite/MySQL/PG) |
| `externalDataSourceService.js` | 外部数据源连接 |
| `externalSourceCacheService.js` | 外部数据缓存 |
| `externalSourceFileService.js` | 外部文件管理 |
| `externalProviderCallLogService.js` | 数据源调用日志 |
| `pythonRuntimeAdapterService.js` | Python Runtime 适配 |
| `modelTestService.js` | 模型连接测试 |
| `referencePackService.js` | 参考资料包 |
| `referenceLibraryService.js` | 参考资料库 |
| `evidenceService.js` | 证据管理 |
| `llmService.js` | 通用 LLM 服务 |
| `jsonDataService.js` | JSON 数据操作 |

#### L2.5 数据访问层

| 文件 | 职责 |
|------|------|
| `data/database.js` | SQLite 初始化与管理 |
| `data/models/session.js` | 会话数据模型 |
| `data/models/externalConnection.js` | 外部连接数据模型 |
| `data/models/applicationPack.js` | Application Pack 数据模型 |
| `data/seed.js` | 数据库初始化脚本 |

#### 监控层

| 文件 | 职责 |
|------|------|
| `opsObservabilityService.js` | 运维看板、告警、健康检查 |
| `pluginRuntimeMetricsService.js` | 插件运行时指标 |
| `storageHealthService.js` | 存储健康监测 |
| `logService.js` | 日志服务 |
| `contextCompressor.js` | 上下文压缩 |
| `assistantPerspectiveService.js` | Assistant 视角跟踪 |
| `tracing.js` | OpenTelemetry/Jaeger 集成 |

### 4.3 Business Flows (`mock-server/flows/`)

| Flow | 职责 |
|------|------|
| `analyzeFlow.js` | 分析流程编排 (判断+规则+LLM) |
| `searchFlow.js` | 检索流程编排 (搜索+证据+摘要) |
| `scriptFlow.js` | 写作流程编排 (formal/concise/spoken) |
| `fastChannelFlow.js` | 快速通道/插件 workflow |
| `settingsFlow.js` | 设置流程 |

### 4.4 Plugin System (`mock-server/plugins/`)

| 插件 | 职责 |
|------|------|
| `rule-engine/` | L0 分析规则引擎：keyword-rule (激活) + llm-rule (禁用) |
| `search-rule-engine/` | L0 检索规则引擎：同架构镜像 |
| `model-adapters/embeddedModelAdapter.js` | Qwen3-0.6B 本地模型适配 (node-llama-cpp) |
| `model-adapters/embeddedModelSchemas.js` | 本地模型 JSON Schema / GBNF Grammars |
| `data-connectors/` | 外部数据连接器 (企查查/付费API/网页搜索) |
| `nodes/` | 工作流自定义节点 |
| `tool-registry/` | 工具注册表 |
| `templates/` | 工作流模板 |
| `manifests/` | 工作流 Manifest (11 JSON 文件) |

---

## 五、Task 主链现状

### 5.1 Task 数据类型体系

```
TaskPlan (规划阶段)
  ├── taskId, taskTitle, userGoal, understanding
  ├── taskType: full_workflow | customer_analysis | evidence_search | output_generation
  ├── status: draft → planning → waiting_confirmation
  ├── steps[4]: analysis → evidence → output → save
  ├── missingInfo[]: { field, label, level(required|recommended|optional), reason }
  ├── executionContext: { assistantName, modelName, dataSources[], taskPlanner{status,source} }
  └── riskHints[]

TaskExecution (执行阶段)
  ├── taskId, status: idle → running → done | failed | degraded | cancelled
  ├── currentStepId
  ├── steps[]: { stepId, type, status(pending→running→done|failed|degraded), summary, details, riskNotes }
  └── outputPreview?: { formalPreview, concisePreview, spokenPreview, evidenceCount, riskCount }

OutputDetail (输出阶段)
  ├── versions[]: { versionId, label, isCurrent, formalVersion, conciseVersion, spokenVersion }
  ├── evidences[]: { id, title, sourceType, sourceName, status, summary }
  └── risks[]: { id, level(info|warning|danger|degraded), title, description }

TaskArchiveItem (历史归档)
  ├── planVersions[], evidencePackVersions[], outputVersions[]
  ├── status: completed | continuable | failed | running | needs_info | draft
  ├── hasOutput: boolean, continue 4 种模式
  └── source: 'task' | 'legacy_session'
```

### 5.2 Task 主链流程图

```
用户输入 (Home / Workbench)
    │
    ▼
POST /api/tasks/plans                    ← taskService.createTask()
    │                                        ├── inferTaskType (关键词)
    ├── 创建 draft task + taskId           ├── buildTaskSteps (4 步固定)
    ├── rule_engine 关键词规则匹配          ├── buildMissingInfo (关键词)
    ├── 生成 understanding                  ├── buildExecutionContext (source: rule_engine)
    └── 返回 TaskPlan                       └── buildRiskHints
    │
    ▼
Workbench plan_confirm / needs_info      ← 前端展示 TaskPlanCard + MissingInfoPanel
    │                                       用户确认 / 补充缺失信息
    ▼
POST /api/tasks/:taskId/confirm          ← taskService.confirmTask()
    │                                        创建 TaskExecution (status: running)
    ├── async 执行模拟启动                    4 步顺序推进:
    │   ├── analysis  (1500ms delay)         分析客户场景
    │   ├── evidence  (2000ms delay)         检索资料与证据
    │   ├── output    (1500ms delay)         生成输出
    │   └── save      (500ms delay)          保存历史任务
    │
    ▼
前端 2s polling GET /execution           ← useTaskExecution.ts (setInterval 2000ms)
    │                                        detect terminal status → clearPoll
    ▼
done → outputPreview 展示                ← OutputPreviewCard
    └── 导航至 /tasks/:taskId/output     ← TaskOutputPage
         ├── GET /output/versions        查看版本历史
         ├── POST /output/regenerate     重新生成
         ├── PUT /output/set-current     切换版本指针
         └── GET /output/export/markdown 导出 Markdown
```

### 5.3 当前规则引擎在 Task 主链中的角色

```
输入 userGoal → taskService.createTask()
                    │
                    ├─ inferTaskType()      关键词匹配 (生成/客户/资料) → TaskType
                    ├─ buildMissingInfo()    关键词匹配 (企查查/工商)     → required level
                    ├─ buildUnderstanding()  关键词匹配 (客户/销售/资料)  → 文本模板
                    ├─ buildRiskHints()      关键词匹配                   → 风险提示
                    └─ buildExecutionContext() source: 'rule_engine'
```

**rule_engine 现状：在 Task Plan 阶段 100% 运作；在 Task Execution 模拟中完全由 mock timer 驱动，不做真实判定。**

---

## 六、Workbench 状态机

### 6.1 状态定义

```
                  ┌─────────────────────────────────────────┐
                  │          Workbench 9 状态机               │
                  │                                          │
                  │  empty ──→ planning ──→ plan_confirm     │
                  │    │                        │    │       │
                  │    │              ┌─────────┘    │       │
                  │    │              ▼               ▼       │
                  │    │         needs_info       running    │
                  │    │              │            │   │      │
                  │    │              └─────┬──────┘   │      │
                  │    │                    │          │      │
                  │    │                    ▼          ▼      │
                  │    │               ┌─────────────────┐    │
                  │    │               ▼     ▼     ▼     ▼    │
                  │    │             done  failed  degraded  cancelled
                  │    │               │     │      │       │  │
                  │    └───────────────┴─────┴──────┴───────┘  │
                  └─────────────────────────────────────────┘
```

### 6.2 Workbench 状态机完整表

| 状态 | 触发条件 | UI 渲染 | 可用操作 | → 下一状态 |
|------|----------|---------|----------|-----------|
| **empty** | 首次进入 / 重置 | 欢迎标题 + TaskInputBox | 输入目标 → 生成计划 | → planning |
| **planning** | 点击"生成计划" | 居中 Spin 加载 | — | → plan_confirm / needs_info |
| **plan_confirm** | Plan 成功且无 required 缺失项 | TaskInputBox + TaskPlanCard + ExecutionContextCard + ConfirmExecutionBar | 确认执行 / 编辑计划 | → running |
| **needs_info** | Plan 有 required 级别 missingInfo | plan_confirm 全部 UI + MissingInfoPanel + MissingInfoDrawer | 补充信息 / 跳过继续 | → running |
| **running** | 用户确认执行 | 执行头部 + TaskStepTimeline(步骤进度) + StepResultCard(完成步骤) + 停止按钮 | 停止 / 查看步骤 | → done / failed / degraded / cancelled |
| **degraded** | 执行中出现外部源降级 | running UI + Alert(warning) | 继续降级 / 停止 | → done / cancelled |
| **done** | 所有步骤完成 | 完成头部 + TaskStepTimeline + StepResultCard + OutputPreviewCard + 查看Output按钮 | 查看 Output | → (导航至 /tasks/:id/output) |
| **failed** | 步骤失败 (external_source / analysis / output等) | 中断头部 + TaskStepTimeline + StepResultCard(失败步骤) + 重试/保留按钮 | 重试 / 跳过外部源 / 改计划 / 保留进度 | → running (重试) / plan_confirm (改计划) |
| **cancelled** | 用户点击停止 | 停止头部 + TaskStepTimeline + StepResultCard(已完成) + TaskPlanCard + 继续/改计划/历史按钮 | 继续执行 / 修改计划 / 查看历史 | → running (继续) / plan_confirm |

### 6.3 当前状态机问题

| 问题 | 严重度 | 描述 |
|------|--------|------|
| **双源状态** | 中 | `effectiveWbState` 由 `executionWbState` (来自 `useTaskExecution`) 和 `wbState` (Workbench 本地) merge 产生，两个状态源可能不同步 |
| **degraded 判定歧义** | 中 | `degraded` 可以来自 `execution.status === 'degraded'` 也可以来自 `execStatus === 'degraded'`，还有 `execution.steps.some(s => s.status === 'degraded') && execution.status === 'done'` 的复合判定 |
| **done/degraded 渲染重叠** | 中 | `renderDone()` 和 `renderRunning()` 中都包含 `effectiveWbState === 'degraded'` 的渲染逻辑 |
| **failed auto-show 依赖外部 state** | 低 | `autoShowFailure` 依赖 `execStatus === 'failed' && !!failedStep`，与组件 visible state 并存可能导致双重弹窗 |
| **cancelled 恢复不完整** | 中 | `handleContinueFromCancelled` 调用 `reset()` + `start()` 重新执行，丢失之前的进度状态 (应该从断点继续) |
| **retryStep / skipEvidenceAndContinue 实际行为** | 高 | 两者实现都是 `start()` 全量重新执行，并非真正的步骤重试/跳过 (代码注释自认：`step-based retry not yet implemented; restart full execution`) |
| **没有 loading 超时保护** | 中 | polling 无最大轮询时长保护，一旦后端卡住，`setInterval` 永远执行 |

---

## 七、0.6B / rule_engine / qwen3-8b 分工

### 7.1 当前真实角色

```
┌────────────────────────────────────────────────────────────────────────┐
│                        模型与规则体系现状                                │
│                                                                         │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────┐ │
│  │ Qwen3-0.6B-Q5_K_M   │  │  rule_engine          │  │  qwen3-8b     │ │
│  │ (Embedded Model)     │  │  (Keyword Rule)       │  │  (Display)    │ │
│  │                      │  │                       │  │               │ │
│  │ 位置: models/        │  │ 位置: plugins/        │  │ 位置: 仅作为  │ │
│  │ Qwen3-0.6B-         │  │ rule-engine/           │  │ modelName 出  │ │
│  │ Q5_K_M.gguf         │  │                        │  │ 现在 UI 中    │ │
│  │                      │  │ 状态: ACTIVE           │  │               │ │
│  │ 状态: IDLE (未接入  │  │                        │  │ 状态: 占位名   │ │
│  │ 主链路执行)          │  │ 角色: TaskPlan 规划器   │  │               │ │
│  │                      │  │ + Analysis 分析器      │  │ 不连接任何    │ │
│  │ adapter 就绪:        │  │                        │  │ 实际模型实例  │ │
│  │ load/health/infer    │  │ 能力: 关键词匹配       │  │               │ │
│  │ JSON Schema 支持     │  │ + 文本模板 + 枚举路由   │  │               │ │
│  │                      │  │                       │  │               │ │
│  │ 未接入原因:          │  │ llm-rule: DISABLED     │  │               │ │
│  │ 负载/延迟/主链依赖   │  │ (plugins.json)        │  │               │ │
│  └──────────────────────┘  └──────────────────────┘  └───────────────┘ │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

### 7.2 分工明细

| 能力 | 当前承担者 | 能力边界 | 当前可用 |
|------|-----------|----------|------------|
| **TaskPlan 规划** (推断 taskType, 生成 steps, 识别 missingInfo) | rule_engine (keyword-rule) | 关键词匹配 + 固定模板。不改动用户目标语义，不会 deep reasoning。 | ✅ 可用 (100% 关键词) |
| **TaskPlan understanding 生成** | taskService (规则文本模板) | 2-3 句固定模板，根据关键词选择不同文案。无 NLG。 | ✅ 可用 |
| **Analysis 分析** (analyze-context / judge-task) | rule_engine (keyword-rule) | 从知识库匹配产品/参考，返回 summary + recommendations + riskNotes | ✅ 可用 (关键词) |
| **Analysis 分析** (深度场景判断) | — (llm-rule 禁用) | plugins.json 中 `"llm-rule": { "enabled": false }` | ❌ 不可用 |
| **Embedded 本地推理** (轻量 NLU) | Qwen3-0.6B (embeddedModelAdapter) | adapter 就绪 (load/json-schema/infer)，但未接入任何业务流程 | ❌ 主链路未接入 |
| **云端 LLM 推理** | — | apiLLMService 接口定义存在，但实际业务流程走 mock/template | ❌ 未接入 |
| **qwen3-8b** | — (UI 展示名) | taskService 中 `modelName: 'qwen3-8b'`，仅传给前端 ExecutionContextCard 展示 | — 不执行 |

### 7.3 结论

```
当前主链路运行在：
  rule_engine (keyword-rule) + taskService (内建模板) + mock timer (执行模拟)

实际未参与主链路：
  0.6B embedded model (adapter 就绪但闲置)
  云端 LLM (apiLLMService 闲置)
  llm-rule (枚举内置但禁用)
  qwen3-8b (仅 UI 展示名)
```

### 7.4 目标口径 (Phase 1 完成后)

```
目标分工：
  Qwen3-0.6B (Embedded)     → 任务规划器 / 任务分配器 / 路由判断器
                               负责：inferTaskType → generateSteps → identifyMissingInfo
                                     understandUserGoal → produceRiskHints
                               rule_engine 作为硬规则补充 & fallback

  rule_engine (Keyword)      → 硬规则补充与安全兜底
                               负责：必需字段校验 (required level 判定)
                                     确定性业务规则 (企查查/工商 → companyName required)
                                     0.6B 不可用时的关键词降级

  qwen3-8b / 云模型          → 执行阶段模型
                               负责：analysis (场景判断) → evidence (资料整理)
                                     output (文稿生成)

  Search / Evidence          → 资料与证据能力
                               (searchAdapter + searchPolicy + evidenceBuilder)

  Output                     → 交付物生成与版本管理
                               (scriptFlow + outputVersion model)

注：后续工程师不应将 0.6B 视为"可选 fallback"。
    0.6B 是 TaskPlan 生成的主路径，rule_engine 是 fallback。

---

## 八、当前风险清单

### 8.1 可执行性风险

| 编号 | 风险 | 严重度 | 影响范围 | 根因 |
|------|------|--------|----------|------|
| **R1** | 主链路执行靠 mock timer 驱动 | 🔴 高 | Workbench 全流程 | taskService.confirmTask() 中硬编码 setTimeout 推进 4 步，与真实能力模块无关 |
| **R2** | retry/skip 实际等同 restart | 🔴 高 | Workbench failed/cancelled 恢复 | useTaskExecution 中 retryStep 和 skipEvidenceAndContinue 都直接调 start()，无断点续传 |
| **R3** | TaskPlan 规划无 LLM 参与 | 🟡 中 | Plan 质量和精准度 | 仅靠关键词正则匹配，对复杂/混合意图无法正确拆分 |
| **R4** | Analysis 分析无 LLM 参与 | 🟡 中 | 分析结果深度 | llm-rule 禁用，knowledgeRule 数据覆盖面和精度有限 |
| **R5** | Output 生成无 LLM 参与 | 🟡 中 | 输出质量 | 完全 mock 生成，内容不可用于生产 |
| **R6** | 0.6B 本地模型闲置 | 🟡 中 | 轻量场景加速 | adapter 就绪但无调用者；潜在 800ms 延迟要求 main thread 不阻塞 |

### 8.2 数据一致性与状态风险

| 编号 | 风险 | 严重度 | 影响范围 | 根因 |
|------|------|--------|----------|------|
| **R7** | 内存 Map 存储无持久化 | 🟡 中 | 进程重启丢所有 task | taskService 使用 `new Map()`，server 重启后所有 in-flight 和 archive task 丢失 |
| **R8** | Mock 降级覆盖过宽 | 🟢 低 | 联调阶段错误检测 | taskApiAdapter 对 5xx 统一降级到 mock，可能掩盖真实后端 bug |
| **R9** | 旧 Session 只读适配未验证 | 🟢 低 | 历史数据可访问性 | sessionTaskAdapter 的 Session→TaskArchive 映射逻辑需全量回归 |

### 8.3 前端工程风险

| 编号 | 风险 | 严重度 | 影响范围 | 根因 |
|------|------|--------|----------|------|
| **R10** | Workbench 双源状态同步 | 🟡 中 | 状态机可靠性 | wbState vs executionWbState 两个源头合并逻辑隐晦 |
| **R11** | Polling 无限轮询 | 🟡 中 | 前端资源泄漏 | useTaskExecution 无最大轮询时间/次数保护 |
| **R12** | Settings 三个轻量视图待深化 | 🟢 低 | 功能完整性 | Rules/Runtime/Governance 已有 API-first 数据接入，深度编辑/编排未完整实现 |
| **R13** | Agent API 文件 1549 行 | 🟢 低 | 可维护性 | agent.ts 混合了主业务 API + Sessions + AssistantCenter，职责膨胀 |
| **R14** | 旧路由兼容策略待复核 | 🟢 低 | 代码整洁 | 17 条旧路由以 LegacyRouteUpgradeNotice 重定向保留，RC 阶段继续兼容不立即移除 |

---

## 九、当前问题归因表

| 问题 | 直接原因 | 根本原因 | 是否今日清理范围 | 建议阶段 |
|------|----------|----------|-----------------|----------|
| 主链路 mock timer 驱动 | taskService 硬编码 setTimeout | L2 模块 (analyzeFlow/searchFlow/scriptFlow) 未接入 taskService | ❌ | Phase 1 |
| retry/skip 等同 restart | useTaskExecution 未实现步骤级恢复 | 后端无步骤级断点续传接口 | ❌ | Phase 2 |
| Plan 规划只用关键词 | taskService.buildMissingInfo/Understanding 靠正则 | 0.6B 未接入 TaskPlan generation | ❌ | Phase 1 |
| Analysis 无 LLM | llm-rule disabled | 云端 LLM / 0.6B 未作为 llm-rule 后端 | ❌ | Phase 1 |
| Output 内容 mock | mockOutput.ts | scriptFlow 未接入 taskService.output | ❌ | Phase 2 |
| 0.6B 闲置 | 无调用者 | 主链路未设计 0.6B 介入点 | ❌ | Phase 1 |
| 内存存储 | taskService Map() | L2.5 DB 写入未接入 task 生命周期 | ❌ | Phase 3 |
| 双源状态 | effectiveWbState = executionWbState ?? wbState | 状态管理未统一到单一 hook | ✅ 可今日 | Phase 1 |
| Polling 无上限 | setInterval 无终止保护 | useTaskExecution 无 timeout/watchdog | ✅ 可今日 | Phase 1 |
| Workbench 6 个 atomic state 分散 | 6 个独立的 useState | 无 useReducer 统一管理 | ✅ 可今日 | Phase 1 |
| Settings 轻量治理视图 | Routes/Governance/Runtime 已有 API 数据，深度编辑未实现 | L2 流程与交互未完整打通 | ❌ | Phase 3 |
| agent.ts 臃肿 | 1549 行，职责混合 | 未拆分 by domain | ❌ | Phase 2 |

---

## 十、排雷优先级

### P0 (阻塞级，今日可处理)

| 排雷项 | 内容 | 涉及文件 | 工作量 |
|--------|------|----------|--------|
| **WF-1** | Workbench 状态管理整合：6 个 useState → useReducer | `src/pages/Workbench/index.tsx` | 2h |
| **WF-2** | 双源状态合并问题：effectiveWbState 逻辑 review + 加注释 | `src/pages/Workbench/index.tsx` | 1h |
| **WF-3** | Polling 加 watchdog：最大 120s 轮询超时 | `src/hooks/useTaskExecution.ts` | 0.5h |
| **WF-4** | retryStep / skipEvidenceAndContinue 加 TODO 标记 + 边界检查 | `src/hooks/useTaskExecution.ts` | 0.5h |

### P1 (Phase 1 核心)

| 排雷项 | 内容 | 涉及文件 | 工作量 |
|--------|------|----------|--------|
| **PL-1** | 0.6B 接入 TaskPlan generation (替代关键词 inferTaskType) | `taskService.js` + `embeddedModelAdapter.js` | 3d |
| **PL-2** | llm-rule 接入 0.6B (替代纯关键词 analysis) | `plugins/rule-engine/builtin/llm-rule.js` | 2d |
| **PL-3** | analyzeFlow / searchFlow / scriptFlow 接入 taskService 执行模拟 (替代 setTimeout mock timer) | `taskService.js` + `flows/*.js` | 3d |

### P2 (Phase 2 补充)

| 排雷项 | 内容 | 涉及文件 | 工作量 |
|--------|------|----------|--------|
| **P2-1** | Output 生成接入云端 LLM / 0.6B (替代 mock output) | `taskService.js` + `scriptFlow.js` + `apiLLMService.js` | 3d |
| **P2-2** | 步骤级 retry/continue 实现 | `taskService.js` + `useTaskExecution.ts` | 2d |
| **P2-3** | agent.ts 拆分为 runtime.ts / sessions.ts / assistant.ts | `src/api/agent.ts` | 1d |

### P3 (Phase 3 稳固)

| 排雷项 | 内容 | 涉及文件 | 工作量 |
|--------|------|----------|--------|
| **P3-1** | 内存 Map → SQLite 持久化 (task 生命周期接入 L2.5) | `taskService.js` + `data/*` | 3d |
| **P3-2** | Settings Rules / Runtime / Governance 深度交互实现 | `src/pages/Settings/Placeholders/*` | 5d |
| **P3-3** | 旧路由兼容策略复核 (LegacyRouteUpgradeNotice 保留，确认 RC 兼容边界) | `src/router/index.tsx` | 0.5d |

### 今日不做清单

| 项目 | 原因 |
|------|------|
| AutoRun (0.6B 自动主路径) | 需要 Phase 1 PL-1 先行 |
| 0.6B 主路径接入 | 需要先完成架构评审 + PM 确认介入点 |
| DB 回归 | 需要 L2.5 表结构冻结 |
| P3 清理 | 非阻塞，Phase 3 统一清理 |
| Settings / Output / History 改造 | 需要先收束 Task 主链路 |

### 今日验收标准：Workbench 手动主链收口

本批只处理 WF-1 到 WF-4，不碰 0.6B、AutoRun、Settings / Output / History。

- [ ] **TaskPlan 有效才可进入 plan_confirm**：`plan?.taskId` 存在、`plan?.steps?.length > 0`、`plan?.userGoal` 非空
- [ ] **currentTaskId 只能来自 plan.taskId / resumeContext.taskId**：不从 URL params 或 localStorage 推断
- [ ] **confirm 必须使用真实 taskId**：`start({ taskId: plan.taskId.trim(), userGoal })`，不可拼接或随机生成
- [ ] **confirm 阶段按钮锁定**：点击确认后立即 disabled，防止重复 confirm 导致任务中断
- [ ] **TASK_STATUS_CONFLICT 可恢复 execution**：冲突态重新拉取 `/execution` 而非直接进入 failed
- [ ] **polling 只有一个 interval**：新 polling 启动前强制 clearPoll 旧 interval
- [ ] **polling 有 120s watchdog**：累计 polling 时长超过 120s 自动终止，提示用户
- [ ] **done / degraded / cancelled / failed 为终态**：终态后 polling 停止，不再被 catch 覆盖为其他状态
- [ ] **done 后显示 OutputPreview 和查看 Output 入口**：`outputPreview` 存在且可点击进入 `/tasks/:taskId/output`
- [ ] **failed / cancelled 才显示"任务中断"**：done + degraded steps 不渲染 failed UI
- [ ] **Network 不再出现 `/api/tasks//confirm`**：taskId 为空时不发任何 confirm 请求

> 以上 11 条验收标准对应排雷项 WF-1 ~ WF-4，完成即标志着 Workbench 手动主链收口完毕。

---

## 十一、下一阶段任务拆分

### Phase 1：主链路补全 (目标：第一条非 mock 链路跑通)

```
Week 1: 0.6B 集成
  ├── Day 1-2: 0.6B 接入 TaskPlan generation
  │   ├── embeddedModelAdapter 集成到 taskService.createTask()
  │   ├── Schema: 从 userGoal → { taskType, steps[], missingInfo[], understanding }
  │   ├── Fallback: 0.6B 失败 → rule_engine keyword 降级
  │   └── 验证: POST /api/tasks/plans 返回 0.6B 生成的 plan
  │
  ├── Day 3-4: analyzeFlow 接入 taskService 执行链
  │   ├── taskService.runExecutionSimulation 改为调用 analyzeFlow
  │   ├── analyzeFlow 接入 rule_engine (keyword) + optional llm-rule (0.6B)
  │   └── 验证: Workbench 执行看到真实的 analysis step 结果
  │
  └── Day 5: Workbench 状态管理清理
      ├── useState → useReducer 重构
      ├── effectiveWbState 逻辑收敛
      └── Polling watchdog 添加

Week 2: searchFlow + scriptFlow 接入
  ├── Day 1-2: searchFlow 接入 taskService 执行链
  ├── Day 3-4: scriptFlow 接入 (formal/concise/spoken)
  └── Day 5: end-to-end 回归验证

验收标准:
  POST /api/tasks/plans  → 0.6B 生成 (keyword fallback)
  POST /confirm → 4 步按 analyzeFlow→searchFlow→scriptFlow 执行
  GET /output  → 基于 scriptFlow 生成的内容 (非 mock)
  Workbench 9 状态全路径覆盖
```

### Phase 2：质量加固

```
Week 3: Output 质量
  ├── 云端 LLM 接入 (可选, apiLLMService)
  ├── Output regenerate 接入真实 LLM
  └── Markdown 导出数据来源真实化

Week 4: 稳定性
  ├── 步骤级 retry/continue 断点续传
  ├── Error context 全链路透传
  ├── agent.ts 拆分
  └── useTaskExecution polling 重构

验收标准:
  Output regenerate 返回 LLM 生成结果
  retry 从断点继续而非 restart
  所有错误场景有明确 errorContext 传递到 Workbench
```

### Phase 3：工程化

```
Week 5: 数据持久化
  ├── task 数据从 Map → SQLite (L2.5)
  ├── task 生命周期 hook (创建/更新/删除/归档)
  └── DB 回归测试脚本

Week 6: 功能完善
  ├── Settings Rules / Runtime / Governance 深度交互实现 (规则编排/运行时操作/回滚闭环)
  ├── 旧路由兼容策略复核 (LegacyRouteUpgradeNotice 保留，不在 RC 阶段全量移除)
  └── 性能优化 (vite chunk splitting 校验)

验收标准:
  server 重启后 task 数据不丢失
  Settings Rules/Runtime/Governance 深度交互可用
  旧路由继续以 LegacyRouteUpgradeNotice 兼容保留，避免外部书签/历史链接 404
```

---

## 十二、附录：文件统计一览

| 分类 | 数量 | 关键路径 |
|------|------|----------|
| 前端页面 | 9 active + 3 轻量治理视图 + 17 旧路由兼容保留 | `src/pages/` |
| 前端组件 | 46 | `src/components/` |
| 前端 API 文件 | 12 | `src/api/` |
| 前端 Adapter/Normalizer | 16 | `src/utils/` |
| 前端类型定义 | 5 | `src/types/` |
| 前端 Hooks | 1 (核心) | `src/hooks/useTaskExecution.ts` |
| 后端路由 | 12 | `mock-server/routes/` |
| 后端服务 | 48+ | `mock-server/services/` |
| 后端 Flows | 5 | `mock-server/flows/` |
| 后端 Plugins | 12+ | `mock-server/plugins/` |
| 后端数据模型 | 3+ | `mock-server/data/models/` |
| API Gateway | 3 路由 | `api-gateway/src/routes/` |
| Platform Manager | 3 agents | `platform-manager/src/` |
| Python Runtime | 1 server | `python_runtime/app/` |
| 文档 | 6 | `docs/` |
| 脚本 | 10 | `scripts/` |
| 架构文档 | 2 | `ARCHITECTURE.md` `代码分类与功能说明.md` |
