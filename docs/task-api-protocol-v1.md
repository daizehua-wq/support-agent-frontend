# Agent Platform TaskPlan / TaskExecution / OutputVersion 后端接口方案 v1

> **对接对象**：`mock-server` P2.5 数据层 + P1 协调层（runtimeRoutes.js）
> **前端参考**：`src/types/taskPlan.ts`, `src/types/output.ts`, `src/types/taskArchive.ts`
> **现有基础**：`GET/POST /internal/data/sessions`, `sessionService.js`

---

## 一、TaskPlan 数据结构

### 1.1 概念

`TaskPlan` 是用户确认执行前的任务规划快照，由系统自动生成（经由任务规划器小模型），包含步骤蓝图、缺失信息、执行上下文和风险提示。

**生命周期**：
```
draft → planning → waiting_confirmation → [确认后转为 TaskExecution]
```

### 1.2 字段定义

```typescript
interface TaskPlan {
  taskId: string;                    // UUID，规划时分配
  taskTitle: string;                 // ≤28 字自动摘要
  taskType: TaskType;                // full_workflow | customer_analysis | evidence_search | output_generation
  userGoal: string;                  // 用户输入的任务目标原文
  understanding: string;             // 系统对目标的语义理解（用于 Plan Confirm 展示）
  status: TaskPlanStatus;            // draft | planning | waiting_confirmation
  steps: TaskStep[];                 // 计划步骤蓝图（4 步固定）
  missingInfo: MissingInfoItem[];    // 缺失信息列表（含阻断级）
  executionContext: ExecutionContext; // 执行时依赖的上下文快照
  riskHints: string[];               // 规划时识别到的潜在风险
  createdAt: string;                 // ISO 时间
  updatedAt: string;
  appId?: string;                    // 关联的 Application Pack ID
}

type TaskType = 'full_workflow' | 'customer_analysis' | 'evidence_search' | 'output_generation';
type TaskPlanStatus = 'draft' | 'planning' | 'waiting_confirmation';

interface TaskStep {
  stepId: string;
  order: number;                     // 1-4
  type: 'analysis' | 'evidence' | 'output' | 'save';
  title: string;                     // 展示名称
  required: boolean;                 // 是否必须执行（目前全部 true）
  status: 'pending';                 // 规划态始终 pending
}

interface MissingInfoItem {
  field: string;                     // 字段 key，用于前端表单绑定
  label: string;                     // 展示文案
  level: 'required' | 'recommended' | 'optional';
  reason?: string;                   // 为什么需要这个信息
}

interface ExecutionContext {
  assistantName: string;
  assistantSource: 'manual' | 'app_default' | 'user_default' | 'global_default' | 'fallback';
  modelName: string;
  dataSources: Array<{
    name: string;
    status: 'healthy' | 'degraded' | 'unavailable' | 'disabled' | 'unknown';
  }>;
  taskPlanner: {
    status: 'ready' | 'degraded' | 'unavailable' | 'unknown';
    source: 'embedded-planner' | 'rule-engine' | 'fallback';
  };
}
```

### 1.3 MissingInfo 规则（服务端逻辑）

这些规则必须在服务端实现，不可依赖前端判断：

```
1. 前置规则：任何任务都有 taskGoal（必填），初始由用户输入提供。
2. companyName 默认 recommended；如果 userGoal 匹配正则 /企查查|工商背景|企业画像|经营风险|公开企业资料/i → required。
3. outputTarget 始终 recommended。
4. recentCommunication 始终 recommended。
5. toneStyle 始终 optional。
6. 如果 executionContext 中 taskPlanner.status === 'unavailable'：
   → taskPlanner 相关字段标记为不可编辑但可继续（系统降级提示前端可展示）
7. 如果所有数据源都 unavailable，不阻断执行但在 riskHints 中标高
```

---

## 二、TaskExecution 状态机

### 2.1 概念

`TaskExecution` 是确认后的运行时数据，记录 4 个步骤的实时状态、中间产出和最终结果。

**生命周期**：
```
idle → running →  done
              →  degraded → done
              →  failed (可进 cancelled)
              →  cancelled (可进 continuable)
```

### 2.2 字段定义

```typescript
interface TaskExecution {
  taskId: string;
  planVersionId: string;              // 关联的 TaskPlan Version ID
  status: TaskExecutionStatus;
  currentStepId?: string;             // 当前正在执行的 step
  steps: TaskStepExecution[];         // 4 步的运行时状态
  outputPreview?: TaskOutputPreview;  // done 时填入
  degradedMarkers?: string[];         // 有降级时的标记键
  startedAt: string;
  completedAt?: string;
  errorContext?: {                    // 失败/降级时附加
    failedStepId: string;
    failureKind: StepFailureKind;
    reason: string;
    recoverable: boolean;
  };
}

type TaskExecutionStatus = 'idle' | 'running' | 'failed' | 'degraded' | 'done' | 'cancelled';

interface TaskStepExecution {
  stepId: string;
  type: 'analysis' | 'evidence' | 'output' | 'save';
  title: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'degraded' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  summary?: string;
  details?: string[];
  riskNotes?: string[];
  degradedReason?: string;
  failureReason?: string;
  failureKind?: StepFailureKind;
}

type StepFailureKind = 
  | 'external_source'
  | 'external_dependency_high_risk'
  | 'internal_knowledge'
  | 'analysis'
  | 'output'
  | 'save';
```

### 2.3 状态转移规则

```
idle → running:          用户确认 TaskPlan，调用 POST /api/tasks/:id/confirm
running → done:          4 步全部 done
running → degraded:      某步降级但可继续（evidence degraded 常见）
degraded → done:         后续步骤正常完成
running → failed:        某步失败且不可恢复
failed → running:        重试 / 跳过外部源后继续
failed → cancelled:      用户选择保留进度
running → cancelled:     用户主动停止
cancelled → running:     用户从历史任务继续
```

### 2.4 外部源 degraded 记录方式

当 Evidence Step 因外部源不可用而降级时：

```json
{
  "stepId": "task-xxx-evidence",
  "status": "degraded",
  "degradedReason": "外部资料源（企查查）不可用，已降级为内部检索。",
  "riskNotes": ["本次证据基于内部知识库生成，不含外部权威数据源验证。"],
  "degradedMarkers": ["external_source_qichacha"]
}
```

执行级别标记：
```json
{
  "degradedMarkers": ["external_source_qichacha"],
  "outputPreview": {
    "degradedNote": "外部源降级，本次输出基于内部知识库和 Reference Pack 生成。"
  }
}
```

### 2.5 小模型不可用 fallback

当任务规划器小模型不可用时：

```json
{
  "executionContext": {
    "taskPlanner": {
      "status": "unavailable",
      "source": "fallback",
      "fallbackReason": "embedded-planner 调用超时，已降级为 rule-engine 默认模板。"
    }
  },
  "riskHints": ["任务规划器小模型不可用，使用默认模板生成任务计划。Output 将标记为 degraded。"]
}
```

---

## 三、Evidence Pack Version

### 3.1 概念

`Evidence Pack` 记录某次执行的证据收集结果快照。当用户"补充资料后重新生成"时，会创建新的 Evidence Pack Version。

### 3.2 字段定义

```typescript
interface EvidencePack {
  versionId: string;
  taskId: string;
  label: string;                     // v1, v2, ...
  reason: string;                    // 为什么创建该版本
  createdAt: string;
  status: 'active' | 'archived';
  evidenceItems: Array<{
    id: string;
    title: string;
    sourceType: 'internal_knowledge' | 'reference_pack' | 'external_source' | 'customer_data';
    sourceName: string;
    status: 'healthy' | 'degraded' | 'unavailable' | 'not_used';
    summary: string;
  }>;
  degradedNote?: string;
}
```

---

## 四、Output Version

### 4.1 概念

`Output Version` 是三版交付内容的一个完整快照。每次重新生成、补充资料后生成、调整语气后生成都会创建新版本。

### 4.2 字段定义

```typescript
interface OutputVersion {
  versionId: string;
  taskId: string;
  label: string;                     // v1, v2, v3, ...
  status: OutputVersionStatus;
  isCurrent: boolean;                // 当前激活版本
  reason: string;                    // 生成原因描述
  createdAt: string;
  formalVersion: string;             // 正式交付版全文
  conciseVersion: string;            // 简洁沟通版全文
  spokenVersion: string;             // 口语跟进版全文
  evidencePackVersionId: string;     // 关联的 Evidence Pack Version
  planVersionId: string;             // 关联的 TaskPlan Version
  failureReason?: string;
  degradedNote?: string;
  toneStyle?: string;                // 语气标记
  modelInfo: {                       // 生成该版本的模型信息
    modelName: string;
    provider: string;
  };
}

type OutputVersionStatus = 'success' | 'evidence_insufficient' | 'degraded' | 'generating' | 'failed';
```

---

## 五、Task Archive

### 5.1 概念

`Task Archive` 是历史任务列表和详情的聚合视图，从 TaskPlan + TaskExecution + OutputVersion 中提取关键摘要字段。

### 5.2 字段定义（同前端 `TaskArchiveItem`）

```typescript
interface TaskArchiveItem {
  taskId: string;
  taskTitle: string;
  taskType: TaskType;
  status: TaskArchiveStatus;         // continuable | failed | running | needs_info | completed | draft
  recentStep?: string;
  assistantName: string;
  updatedAt: string;
  taskGoal: string;
  planVersions: TaskVersionRecord[];
  evidencePackVersions: TaskVersionRecord[];
  outputVersions: TaskVersionRecord[];
  analysisSummary?: string;
  evidenceSummary?: string;
  risks: Array<{ level: string; title: string; description: string }>;
  executionContext: ExecutionContext;
  failedStep?: string;
  failureKind?: StepFailureKind;
  failureReason?: string;
  completedSteps?: string[];
  pendingSteps?: string[];
  hasOutput: boolean;
}

type TaskArchiveStatus = 'continuable' | 'failed' | 'running' | 'needs_info' | 'completed' | 'draft';

interface TaskVersionRecord {
  versionId: string;
  label: string;
  kind: 'task_plan' | 'evidence_pack' | 'output';
  reason: string;
  createdAt: string;
  status: 'active' | 'archived' | 'failed';
  failureReason?: string;
  summary?: string;
}
```

---

## 六、继续推进规则

### 6.1 ContinueTaskMode

```typescript
type ContinueTaskMode =
  | 'continue-output'        // 基于当前结果继续输出 → 同 task 追加 OutputVersion
  | 'supplement-regenerate'  // 补充资料后重新生成 → 新 EvidencePackVersion + OutputVersion
  | 'edit-goal'              // 修改任务目标 → 新 TaskPlanVersion
  | 'clone-task-structure';  // 新建类似任务 → 复制结构但不复制敏感数据
```

### 6.2 服务端行为

| mode | 服务端操作 | 返回给前端 |
|---|---|---|
| `continue-output` | 复用当前 EvidencePack + TaskPlan，直接生成新 OutputVersion | `{ taskId, newOutputVersionId }` |
| `supplement-regenerate` | 创建新 EvidencePackVersion（合并用户补充信息），然后生成新 OutputVersion | `{ taskId, newEvidenceVersionId, newOutputVersionId }` |
| `edit-goal` | 创建新 TaskPlanVersion，将当前 TaskPlan 状态重置为 `waiting_confirmation`，生成新 planVersionId | `{ taskId, newPlanVersionId }` |
| `clone-task-structure` | 复制 taskType/steps/executionContext（不复制 userGoal/evidence/output/risk），返回新 taskId | `{ newTaskId }` |

### 6.3 安全规则（clone-task-structure）

复制规则：
- ✅ 复制：`taskType`, `executionContext`（不含 secret）, `steps` 蓝图
- ❌ 不复制：`userGoal`（需用户重新输入）, `evidenceItems`, `outputVersions`, `risks`, 客户敏感资料

---

## 七、旧 Session → Task 兼容映射

### 7.1 映射关系

| 旧 Session 概念 | 新 Task 概念 | 兼容策略 |
|---|---|---|
| `session.id` | `taskId` | 一对一映射，旧 sessionId 可直接复用 |
| `session.steps[*]` | `taskExecution.steps[*]` | 步骤类型映射：`analyze-customer` → `analysis`, `search-documents` → `evidence`, `generate-script` → `output` |
| `session.steps[*].output` | `planVersion / evidenceVersion / outputVersion` | 旧步骤无版本概念，初始迁移为 v1 |
| `session.evidences[*]` | `evidencePack.evidenceItems[*]` | 一对一平移 |
| `session.continuePayload` | `continueContext` | 保留 continue 能力，迁移时填充到 executionContext |
| `session.assistantId` | `executionContext.assistantName` | 通过 assistantId 查找 assistantName |

### 7.2 渐进迁移策略

**阶段 1（兼容双写）：**
- 创建 `GET /api/tasks?legacy=true` 时同时查询旧 session 表
- 新 task 写入时也写一份到旧 session 表（兼容旧 Analyze/Search/Script 页面）

**阶段 2（只读旧表）：**
- 前端切到新路由后，旧页面不再访问
- session 表只保留查询，不再写入

**阶段 3（数据迁移）：**
- 一次性将 session 表数据迁移到 task 表
- 后续删除旧路由时删除 session 表

---

## 八、API 端点设计

### 8.1 TaskPlan

| 方法 | 路径 | 用途 | 请求体 | 响应体 |
|---|---|---|---|---|
| `POST` | `/api/tasks/plans` | 生成 TaskPlan | `{ userGoal: string, appId?: string }` | `TaskPlan` |
| `GET` | `/api/tasks/plans/:taskId` | 获取当前 TaskPlan | — | `TaskPlan` |
| `PUT` | `/api/tasks/plans/:taskId` | 更新 TaskPlan（编辑业务字段） | `{ taskTitle?, outputTarget?, tone?, contextNote? }` | `TaskPlan` |
| `POST` | `/api/tasks/plans/:taskId/versions` | 创建新 TaskPlanVersion（edit-goal） | `{ userGoal: string, ... }` | `{ taskId, newPlanVersionId }` |

### 8.2 TaskExecution

| 方法 | 路径 | 用途 | 请求体 | 响应体 |
|---|---|---|---|---|
| `POST` | `/api/tasks/:taskId/confirm` | 确认并开始执行 | `{ missingInfoValues?: Record }` | `TaskExecution` (status=running) |
| `GET` | `/api/tasks/:taskId/execution` | 获取执行状态（轮询） | — | `TaskExecution` |
| `POST` | `/api/tasks/:taskId/stop` | 停止执行 | — | `TaskExecution` (status=cancelled) |
| `POST` | `/api/tasks/:taskId/retry` | 重试失败步骤 | `{ stepId }` | `TaskExecution` |

### 8.3 OutputVersion

| 方法 | 路径 | 用途 | 请求体 | 响应体 |
|---|---|---|---|---|
| `GET` | `/api/tasks/:taskId/output` | 获取 Output 详情（当前版本） | — | `OutputDetail` |
| `GET` | `/api/tasks/:taskId/output/versions` | 获取所有 Output 版本列表 | — | `OutputVersion[]` |
| `POST` | `/api/tasks/:taskId/output/regenerate` | 生成新 OutputVersion | `{ mode: ContinueTaskMode, toneStyle?, ... }` | `{ outputVersionId }` |
| `PUT` | `/api/tasks/:taskId/output/set-current` | 切换当前版本 | `{ versionId }` | `{ success: true }` |
| `GET` | `/api/tasks/:taskId/output/export/markdown` | 导出当前版本 Markdown | — | `{ markdown: string }` 或直接 `text/markdown` |

### 8.4 Task Archive

| 方法 | 路径 | 用途 | 请求体 | 响应体 |
|---|---|---|---|---|
| `GET` | `/api/tasks` | 列出历史任务 | `?type=&status=&q=` | `TaskArchiveItem[]` |
| `GET` | `/api/tasks/:taskId` | 获取历史任务详情 | — | `TaskArchiveItem` |
| `GET` | `/api/tasks/recent` | 获取最近 N 个任务（Home 页） | `?limit=5` | `RecentTask[]` |
| `POST` | `/api/tasks/:taskId/continue` | 继续推进 | `{ mode: ContinueTaskMode, ... }` | `{ taskId, ... }` |
| `PUT` | `/api/tasks/:taskId/set-current-version` | 设为当前有效版本 | `{ versionId, kind }` | `{ success: true }` |

### 8.5 响应信封

沿用现有 API 规范：

```json
{
  "success": true,
  "message": "ok",
  "data": { ... }
}
```

错误：
```json
{
  "success": false,
  "message": "...",
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "指定的任务不存在",
    "details": {}
  }
}
```

### 8.6 错误码约定

| 错误码 | 说明 |
|---|---|
| `TASK_NOT_FOUND` | taskId 不存在 |
| `TASK_STATUS_CONFLICT` | 当前任务状态不允许该操作（如已确认后不能编辑 TaskPlan） |
| `STEP_EXECUTION_FAILED` | 步骤执行失败，包含 failureKind |
| `MISSING_REQUIRED_INFO` | 存在必填信息缺失 |
| `MODEL_UNAVAILABLE` | 小模型/输出模型不可用 |
| `EXTERNAL_SOURCE_DEGRADED` | 外部资料源降级 |
| `QUOTA_EXCEEDED` | 调用配额超限 |
| `PERMISSION_DENIED` | 当前角色无权执行该操作 |
| `VERSION_NOT_FOUND` | versionId 不存在 |

---

## 九、前端 mock 字段 → 真实 API 字段映射表

| 前端 mock 文件 | 前端字段（mock 使用） | 真实 API 路径 | 真实 API 字段 | 优先级 |
|---|---|---|---|---|
| `mockTaskPlanner.ts`  | `generateTaskPlan(goal)` | `POST /api/tasks/plans` | body: `{ userGoal }`, response: `TaskPlan` | P0 |
| `mockTaskExecutor.ts` | `runMockExecution(goal, taskId, onStep)` | `POST /api/tasks/:id/confirm` → stream/poll `GET /api/tasks/:id/execution` | response: `TaskExecution` | P0 |
| `mockOutput.ts` | `generateMockOutput(taskId)` | `GET /api/tasks/:id/output` | response: `OutputDetail` | P0 |
| `mockOutput.ts` | 版本 history | `GET /api/tasks/:id/output/versions` | response: `OutputVersion[]` | P0 |
| `mockOutput.ts` | Regenerating | `POST /api/tasks/:id/output/regenerate` | body: `{ mode }` | P0 |
| `mockTasks.ts` | `MOCK_TASKS` 列表 | `GET /api/tasks` | response: `TaskArchiveItem[]` | P1 |
| `mockTasks.ts` | 单个任务详情 | `GET /api/tasks/:id` | response: `TaskArchiveItem` | P1 |
| `mockTaskPlanner.ts` | MissingInfo 规则 | 服务端实现 | 同前端规则 | P1 |
| `mockTaskExecutor.ts` | stop/retry/skipExternal | `POST /api/tasks/:id/stop` / `retry` | body: `{ stepId? }` | P1 |
| `mockTasks.ts` | ContinueTaskModal 4 模式 | `POST /api/tasks/:id/continue` | body: `{ mode }` | P1 |
| `mockSettingsCenter.ts` | capabilities 摘要 | `GET /api/capabilities/summary` | response: `CapabilityStatus` | P2 |
| `mockSettingsModules.ts` | rules/runtime/governance | 已有 Settings API 聚合 | 复用现有 `GET /api/settings/*` | P2 |
| `useTaskExecution.ts` | hook 状态管理 | 不涉及 API，前端 adapter 封装 | — | — |

---

## 十、实施优先级与分批建议

### P0（立即对接，前端 Unblock 必须）

| 接口 | 说明 |
|---|---|
| `POST /api/tasks/plans` | 替代 `mockTaskPlanner.ts`，解除 Workbench 规划态 mock |
| `POST /api/tasks/:id/confirm` | 替代 `mockTaskExecutor.ts`，解除 Workbench 执行态 mock |
| `GET /api/tasks/:id/execution` | 执行状态查询 |
| `GET /api/tasks/:id/output` | 替代 `mockOutput.ts`，解除 Output 页面 mock |
| `POST /api/tasks/:id/output/regenerate` | 替代 Output Regenerating mock |

### P1（核心闭环）

| 接口 | 说明 |
|---|---|
| `GET /api/tasks` | 替代 `mockTasks.ts` 列表 |
| `GET /api/tasks/:id` | 替代 `mockTasks.ts` 详情 |
| `POST /api/tasks/:id/stop` | 停止执行 |
| `POST /api/tasks/:id/continue` | 继续推进 4 模式 |
| `GET /api/tasks/recent` | Home 页最近任务 |
| `GET /api/tasks/:id/output/versions` | Output 版本历史 |

### P2（增强体验）

| 接口 | 说明 |
|---|---|
| `POST /api/tasks/:id/retry` | 重试特定步骤 |
| `PUT /api/tasks/:id/output/set-current` | 切换当前版本 |
| `GET /api/tasks/:id/output/export/markdown` | 服务端 Markdown 生成 |
| `GET /api/capabilities/summary` | 能力摘要聚合 |
| `POST /api/tasks/plans/:id/versions` | TaskPlan 版本管理 |
| Old Session → Task 迁移 | 数据迁移一次执行 |
