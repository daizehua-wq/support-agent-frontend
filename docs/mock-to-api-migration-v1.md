# 前端 mock → BE API 替换清单 v1

> **基于**：`docs/task-api-protocol-v1.md` + 当前前端实现
> **规则**：本清单为只读分析，前端先不替换 mock。

---

## 一、mock → API 映射表

### 1. mockTaskPlanner.ts → `POST /api/tasks/plans`

| 维度 | 详情 |
|---|---|
| mock 文件 | `src/utils/mockTaskPlanner.ts`（120 行） |
| 使用页面 | `src/pages/Workbench/index.tsx` |
| 当前调用 | `generateTaskPlan(taskInput)` — 同步返回 `TaskPlan` |
| 目标 BE API | `POST /api/tasks/plans` |
| 请求体差异 | 当前：`string`; BE：`{ userGoal: string, appId?: string }` |
| 响应体差异 | 当前：同步 `TaskPlan`; BE：异步返回 `TaskPlan`（含 `createdAt/updatedAt` 等服务端字段） |
| 替换优先级 | **P0** — Workbench 规划态核心依赖 |
| 替换风险 | **低**。类型 `TaskPlan` 字段完全对齐，仅 `taskId` 生成权从前端→后端 |

**替换要点：**
```diff
- const generatedPlan = generateTaskPlan(taskInput);
+ const response = await request.post('/api/tasks/plans', { userGoal: taskInput });
+ const generatedPlan = response.data;
```

**前端适配工作量**：约 10 分钟，1 处调用替换 + 等待异步（加入 loading）

---

### 2. mockTaskExecutor.ts → `POST /api/tasks/:id/confirm` + `GET /api/tasks/:id/execution`

| 维度 | 详情 |
|---|---|
| mock 文件 | `src/utils/mockTaskExecutor.ts`（196 行） |
| 使用页面 | `src/hooks/useTaskExecution.ts` → `src/pages/Workbench/index.tsx` |
| 当前调用 | `runMockExecution(goal, taskId, onStepUpdate, signal)` — 内部模拟 4 步延迟 + 回调更新 |
| 目标 BE API | `POST /api/tasks/:id/confirm`（发起执行） + `GET /api/tasks/:id/execution`（轮询状态） |
| 请求体差异 | 当前：goal + taskId; BE：`POST confirm` 只需 `missingInfoValues?`，`GET execution` 无参数 |
| 响应体差异 | 当前：前端逐步回调模拟; BE：返回完整 `TaskExecution`，前端需要轮询 |
| 替换优先级 | **P0** — Workbench 执行态核心依赖 |
| 替换风险 | **中**。状态机从"前端模拟"变为"后端驱动"，需要改造 `useTaskExecution` hook 的 `start/stop/retry/skipExternal` 全部方法 |

**替换要点：**
```diff
- await runMockExecution(goal, taskId, (step, allSteps) => { ... }, signal);
+ await request.post(`/api/tasks/${taskId}/confirm`, { missingInfoValues });
+ // 轮询 GET /api/tasks/:id/execution
+ const interval = setInterval(async () => {
+   const res = await request.get(`/api/tasks/${taskId}/execution`);
+   const execution = res.data;
+   setExecution(execution);
+   if (['done', 'failed', 'cancelled'].includes(execution.status)) clearInterval(interval);
+ }, 1000);
```

**额外需要适配的 mock 方法：**
| mock 方法 | 对应 BE API | 说明 |
|---|---|---|
| `stop()` (abort signal) | `POST /api/tasks/:id/stop` | 取消前端 timer → 调用后端 stop |
| `retryStep(stepId)` | `POST /api/tasks/:id/retry` | 前端模拟重试 → 调用后端 retry |
| `skipEvidenceAndContinue()` | `POST /api/tasks/:id/retry` + `skipExternal=true` | 或在 retry body 中增加 `{ skipExternal: true }` |

**前端适配工作量**：约 1-2 小时，需要重写 `useTaskExecution.ts` 的部分逻辑

---

### 3. mockOutput.ts → `GET /api/tasks/:id/output` + `GET /api/tasks/:id/output/versions` + `POST /api/tasks/:id/output/regenerate`

| 维度 | 详情 |
|---|---|
| mock 文件 | `src/utils/mockOutput.ts`（137 行） |
| 使用页面 | `src/pages/Tasks/Output.tsx` |
| 当前调用 | `generateMockOutput(taskId)` — 同步返回 `OutputDetail`（通过 taskId 关键词判断状态） |
| 目标 BE API | `GET /api/tasks/:id/output`（当前版本）+ `GET /api/tasks/:id/output/versions`（版本列表）+ `POST /api/tasks/:id/output/regenerate`（重新生成） |
| 请求体差异 | 当前：`string` taskId; BE：`GET /output` 无需参数，`POST regenerate` 需 `{ mode, toneStyle? }` |
| 响应体差异 | 当前：`OutputDetail`; BE：结构完全一致，增加了 `modelInfo` 等元数据 |
| 替换优先级 | **P0** — Output 工作台核心依赖 |
| 替换风险 | **低**。类型 `OutputDetail` 字段已对齐，仅需将 taskId 关键词状态判断改为读 BE 返回的 `status` 字段 |

**替换要点：**
```diff
- const output = generateMockOutput(taskId);
+ const response = await request.get(`/api/tasks/${taskId}/output`);
+ const output = response.data;
```

**重新生成 mock → API：**
```diff
- // mock 内部 2s 延迟 + 本地创建新版本
- setTimeout(() => { setOutput(prev => ({ ...prev, versions: [...prev.versions, newVersion] })); }, 2000);
+ const res = await request.post(`/api/tasks/${taskId}/output/regenerate`, { mode, toneStyle });
+ // 轮询 output 状态直到 generating → success/failed
```

**前端适配工作量**：约 1 小时，output 状态替换 + 重新生成轮询

---

### 4. mockTasks.ts → `GET /api/tasks` + `GET /api/tasks/:id`

| 维度 | 详情 |
|---|---|
| mock 文件 | `src/utils/mockTasks.ts`（163 行） |
| 使用页面 | `src/pages/Tasks/index.tsx`, `src/pages/Tasks/Detail.tsx` |
| 当前调用 | `MOCK_TASKS` — 静态数组 import，两页共享 | `MOCK_TASKS.find(t => t.taskId === taskId)` |
| 目标 BE API | `GET /api/tasks?type=&status=&q=`（列表）+ `GET /api/tasks/:id`（详情） |
| 请求体差异 | 当前：无请求; BE：GET query params 筛选 |
| 响应体差异 | 当前：`TaskArchiveItem[]`; BE：完全对齐 |
| 替换优先级 | **P1** — 历史任务是核心闭环但不是每日必用 |
| 替换风险 | **低**。类型已对齐，前端仅需将静态 import → API 调用 |

**替换要点：**
```diff
// Tasks list
- const tasks = MOCK_TASKS;
+ const response = await request.get('/api/tasks', { params: { type, status, q } });
+ const tasks = response.data;

// Task Detail
- const task = MOCK_TASKS.find(t => t.taskId === taskId);
+ const response = await request.get(`/api/tasks/${taskId}`);
+ const task = response.data;
```

**前端适配工作量**：约 30 分钟，2 处 API 调用替换

---

### 5. mockSettingsCenter.ts → `GET /api/capabilities/summary` + 现有 Settings API 聚合

| 维度 | 详情 |
|---|---|
| mock 文件 | `src/utils/mockSettingsCenter.ts`（83 行） |
| 使用页面 | `src/pages/Settings/index.tsx` |
| 当前调用 | `getMockSettingsCenter()` / `getDegraded()` / `getMissingDefaults()` / `getUserView()` / `getNoPermission()` — 5 个场景函数 |
| 目标 BE API | 现有 `GET /api/settings`（已就绪） + 新增 `GET /api/capabilities/summary`（P2） |
| 请求体差异 | 当前：无请求; BE：Settings 已有，capabilities 需新增 |
| 响应体差异 | 当前 `SettingsCenterState`; BE：大部分字段可从 `GET /api/settings` 聚合 |
| 替换优先级 | **P2** — Settings 现有接口已经就绪（FE-6 使用了独立的 mock，但 Settings API 本身已可用） |
| 替换风险 | **低**。当前 Settings 页面的 demo scenario selector 仅在 `import.meta.env.DEV` 可见，不影响生产 |

**替换策略：**
- `getMockSettingsCenter()` 的 capability 字段 → 聚合 `GET /api/settings/models` + `GET /api/settings/assistants` + `GET /api/settings/data-sources`
- 场景切换（degraded/missingDefaults）→ `GET /api/capabilities/summary` + 各模块健康端点聚合
- `getUserView()` → 需要真实 RBAC 系统（P1）
- `getNoPermission()` → 需要真实 RBAC 系统（P1）

**前端适配工作量**：约 2 小时（跨模块聚合 + 权限系统）

---

### 6. mockSettingsModules.ts → 现有 Settings API（大部分已就绪）

| 维度 | 详情 |
|---|---|
| mock 文件 | `src/utils/mockSettingsModules.ts`（69 行） |
| 使用页面 | `Rules.tsx`, `Runtime.tsx`, `Governance.tsx` |
| 当前调用 | `MOCK_RULES`, `MOCK_KNOWLEDGE`, `MOCK_APP_PACKS`, `MOCK_STRATEGIES`, `MOCK_RUNTIME`, `MOCK_GOVERNANCE` — 6 个静态 mock 导出 |
| 目标 BE API | 现有 `GET /api/settings/*`（Settings API 已就绪）- 大部分不需要新增接口 |
| 现有覆盖 | Rules 规则列表 / Knowledge 知识库 / Runtime 运行状态 / Governance 治理日志 — 均可从已有 Settings API 读取 |
| 替换优先级 | **P2** — Settings 子模块现有接口已就绪，mock 主要缺少真实数据 |
| 替换风险 | **最低**。现有 API 路径 `GET /api/settings/models`, `GET /api/settings/assistants` 等已存在，前端 mock 与真实 API 结构差异小 |

**替换策略：**
- `MOCK_RULES` → `GET /api/settings/governance/overview` 聚合
- `MOCK_KNOWLEDGE` → `GET /api/settings/data-sources` 聚合
- `MOCK_APP_PACKS` → `GET /api/settings/apps`（需要 BE 扩展）
- `MOCK_RUNTIME` → 聚合 `GET /api/settings/ops-dashboard` + `GET /api/settings/python-runtime/health` + `GET /api/settings/security/posture`
- `MOCK_GOVERNANCE` → `GET /api/settings/governance/history`

**前端适配工作量**：约 1-2 小时（跨模块聚合，3 个页面分别替换）

---

## 二、P0 替换建议（立即执行，解除前端 Unblock）

| 优先级 | mock 文件 | 页面影响 | 前端适配量 | 依赖 BE 就绪 |
|---|---|---|---|---|
| **P0** | `mockTaskPlanner.ts` | Workbench 规划态 | 10 分钟 | `POST /api/tasks/plans` |
| **P0** | `mockTaskExecutor.ts` | Workbench 执行态 | 1-2 小时 | `POST /api/tasks/:id/confirm` + `GET /api/tasks/:id/execution` |
| **P0** | `mockOutput.ts` | Output 工作台 | 1 小时 | `GET /api/tasks/:id/output` + `POST regenerate` |

**P0 合计：** 3 个 mock 文件，3 个页面受影响，约 3 小时前端适配。

---

## 三、P1 替换建议（可等 BE 就绪后替换）

| 优先级 | mock 文件 | 页面影响 | 前端适配量 | 依赖 |
|---|---|---|---|---|
| **P1** | `mockTasks.ts` | Tasks 列表 + 详情 | 30 分钟 | `GET /api/tasks` + `GET /api/tasks/:id` |
| **P1** | `mockTasks.ts` (Continue) | ContinueTaskModal | 30 分钟 | `POST /api/tasks/:id/continue` |
| **P1** | `mockOutput.ts` (versions) | Output 版本列表 | 15 分钟 | `GET /api/tasks/:id/output/versions` |

**P1 合计：** 约 1.5 小时前端适配。

---

## 四、P2 替换建议（可延后）

| 优先级 | mock 文件 | 说明 | 依赖 |
|---|---|---|---|
| **P2** | `mockSettingsCenter.ts` | Settings 现有接口已就绪，mock 仅用于场景切换 demo | 真实 RBAC（P1）+ capabilities 聚合 |
| **P2** | `mockSettingsModules.ts` | Settings 子模块现有接口已就绪，mock 主要缺失真实数据 | `GET /api/settings/apps` 扩展 |

---

## 五、未定前不应替换的接口

| 接口 | 原因 |
|---|---|
| `PUT /api/tasks/plans/:id` (编辑 TaskPlan) | BE v1 未最终定稿，编辑流程可能在 v1.1 调整 |
| `PUT /api/tasks/:id/output/set-current` (切换版本) | 首期前端 toast 即可，BE 版本管理可能后续才实现 |
| `GET /api/capabilities/summary` | 聚合逻辑待 BE 确认 |
| Old Session → Task 迁移 | 渐进策略，前端先不替换 |

---

## 六、是否需要新增 `src/api/tasks.ts`

**建议新增。**

当前前端 API 文件现状：
| 文件 | 覆盖范围 |
|---|---|
| `src/api/agent.ts` | 旧 Analyze/Search/Script/Workbench 接口 |
| `src/api/settings.ts` | Settings 全部接口 |
| `src/api/modelCenter.ts` | Model 管理 |
| `src/api/assistantCenter.ts` | Assistant/Prompt 管理 |
| `src/api/databaseManager.ts` | 数据源管理 |

**缺失：** 没有 `src/api/tasks.ts` 统一管理 Task 相关 API。

建议新增结构：
```typescript
// src/api/tasks.ts

import request from './request';
import type { TaskPlan, TaskExecution, TaskOutputPreview } from '../types/taskPlan';
import type { OutputDetail, OutputVersion } from '../types/output';
import type { TaskArchiveItem, ContinueTaskMode } from '../types/taskArchive';

// P0
export async function createTaskPlan(userGoal: string, appId?: string): Promise<TaskPlan> { ... }
export async function confirmTask(taskId: string, missingInfoValues?: Record<string, string>): Promise<TaskExecution> { ... }
export async function getTaskExecution(taskId: string): Promise<TaskExecution> { ... }
export async function getTaskOutput(taskId: string): Promise<OutputDetail> { ... }
export async function regenerateOutput(taskId: string, mode: ContinueTaskMode, toneStyle?: string): Promise<{ outputVersionId: string }> { ... }

// P1
export async function listTasks(params?: { type?: string; status?: string; q?: string }): Promise<TaskArchiveItem[]> { ... }
export async function getTaskDetail(taskId: string): Promise<TaskArchiveItem> { ... }
export async function stopTask(taskId: string): Promise<TaskExecution> { ... }
export async function continueTask(taskId: string, mode: ContinueTaskMode): Promise<{ taskId: string }> { ... }
export async function getOutputVersions(taskId: string): Promise<OutputVersion[]> { ... }
export async function setCurrentOutputVersion(taskId: string, versionId: string): Promise<void> { ... }
```

**建议路径：** `src/api/tasks.ts`
**建议在 P0 替换后立即新增，用于替换 `mockTaskPlanner.ts` 的直接使用。**

---

## 七、P0 替换顺序与批次定义

### 7.1 批次划分

P0 拆为 3 个独立 FE 批次，顺序执行、各自验证：

| 批次 | 名称 | mock → API | 涉及文件 | 预估时间 |
|---|---|---|---|---|
| **P0-FE-1** | TaskPlan 对接 | `mockTaskPlanner.ts` → `POST /api/tasks/plans` | `src/api/tasks.ts`, `src/pages/Workbench/index.tsx` | 30 分钟 |
| **P0-FE-2** | TaskExecution 对接 | `mockTaskExecutor.ts` → `POST /api/tasks/:id/confirm` + `GET /api/tasks/:id/execution` | `src/api/tasks.ts`, `src/hooks/useTaskExecution.ts`, `src/pages/Workbench/index.tsx` | 1.5-2 小时 |
| **P0-FE-3** | Output 对接 | `mockOutput.ts` → `GET /api/tasks/:id/output` + `POST /api/tasks/:id/output/regenerate` | `src/api/tasks.ts`, `src/pages/Tasks/Output.tsx` | 1 小时 |

### 7.2 执行顺序

```
P0-FE-1: TaskPlan 对接
  ├── 新增 src/api/tasks.ts（createTaskPlan）
  ├── Workbench handleGeneratePlan 替换
  ├── 验证：type-check / build / stack:verify
  └── commit

P0-FE-2: TaskExecution 对接
  ├── src/api/tasks.ts 新增（confirmTask, getTaskExecution, stopTask, retryStep）
  ├── useTaskExecution.ts 重写（fetch + 轮询）
  ├── Workbench 执行态适配
  ├── 验证：type-check / build / stack:verify
  └── commit

P0-FE-3: Output 对接
  ├── src/api/tasks.ts 新增（getTaskOutput, regenerateOutput, getOutputVersions）
  ├── Output.tsx 替换
  ├── 验证：type-check / build / stack:verify
  └── commit
```

---

## 八、mock fallback 开关策略

### 8.1 环境变量控制

使用 Vite 环境变量控制 mock/API 模式：

```bash
# .env
VITE_USE_TASK_MOCK=true

# .env.production
VITE_USE_TASK_MOCK=false
```

### 8.2 实现模式（src/utils/taskApiAdapter.ts）

```typescript
// src/utils/taskApiAdapter.ts
const USE_MOCK = import.meta.env.VITE_USE_TASK_MOCK !== 'false';

export async function createTaskPlan(userGoal: string, appId?: string): Promise<TaskPlan> {
  if (USE_MOCK) {
    return generateTaskPlan(userGoal);
  }
  try {
    const res = await tasksApi.createTaskPlan(userGoal, appId);
    return res;
  } catch (error) {
    console.warn('[taskApiAdapter] createTaskPlan API failed, falling back to mock:', error);
    return generateTaskPlan(userGoal);
  }
}
```

### 8.3 fallback 矩阵

| API 调用 | mock fallback 函数 | fallback 条件 |
|---|---|---|
| `POST /api/tasks/plans` | `generateTaskPlan(goal)` | API 不可用 / 超时 / 500 |
| `POST /api/tasks/:id/confirm` | `runMockExecution(...)` | API 不可用 / 超时 |
| `GET /api/tasks/:id/execution` | 返回 mock TaskExecution | 同上 |
| `GET /api/tasks/:id/output` | `generateMockOutput(taskId)` | 同上 |
| `POST /api/tasks/:id/output/regenerate` | 本地 mock 重新生成 | 同上 |
| `GET /api/tasks` | `MOCK_TASKS` | 同上 |

### 8.4 切换规则

- `VITE_USE_TASK_MOCK=true`（默认）：始终使用 mock，不调用真实 API
- `VITE_USE_TASK_MOCK=false`：调用真实 API，API 失败时 fallback 到 mock
- 生产环境 `VITE_USE_TASK_MOCK=false` 且移除 fallback（不暴露 mock 数据）

---

## 九、response normalize 策略

### 9.1 目的

BE API 响应可能与前端类型有微小差异（字段名格式、枚举值、时间格式等）。在每个 API 调用后立即 normalize，保证页面层收到的数据格式一致。

### 9.2 Normalize 函数（建议位置：`src/utils/taskNormalizer.ts`）

```typescript
// normalizeTaskPlanResponse
// BE 可能返回 snake_case，前端期望 camelCase
export function normalizeTaskPlanResponse(raw: any): TaskPlan {
  return {
    taskId: raw.taskId || raw.task_id,
    taskTitle: raw.taskTitle || raw.task_title,
    taskType: raw.taskType || raw.task_type || 'full_workflow',
    userGoal: raw.userGoal || raw.user_goal || '',
    understanding: raw.understanding || '',
    status: raw.status || 'draft',
    steps: (raw.steps || []).map(normalizeTaskStep),
    missingInfo: (raw.missingInfo || raw.missing_info || []).map(normalizeMissingInfo),
    executionContext: normalizeExecutionContext(raw.executionContext || raw.execution_context || {}),
    riskHints: raw.riskHints || raw.risk_hints || [],
    createdAt: raw.createdAt || raw.created_at || '',
    updatedAt: raw.updatedAt || raw.updated_at || '',
    appId: raw.appId || raw.app_id,
  };
}

export function normalizeTaskExecutionResponse(raw: any): TaskExecution {
  return {
    taskId: raw.taskId || raw.task_id,
    planVersionId: raw.planVersionId || raw.plan_version_id || '',
    status: raw.status || 'idle',
    currentStepId: raw.currentStepId || raw.current_step_id,
    steps: (raw.steps || []).map(normalizeTaskStepExecution),
    outputPreview: raw.outputPreview || raw.output_preview || undefined,
    degradedMarkers: raw.degradedMarkers || raw.degraded_markers || [],
    startedAt: raw.startedAt || raw.started_at || '',
    completedAt: raw.completedAt || raw.completed_at,
    errorContext: raw.errorContext || raw.error_context,
  };
}

export function normalizeOutputResponse(raw: any): OutputDetail {
  return {
    taskId: raw.taskId || raw.task_id,
    taskTitle: raw.taskTitle || raw.task_title,
    taskGoal: raw.taskGoal || raw.task_goal || '',
    outputTarget: raw.outputTarget || raw.output_target,
    tone: raw.tone,
    status: raw.status || 'success',
    currentVersionId: raw.currentVersionId || raw.current_version_id || '',
    versions: (raw.versions || []).map(normalizeOutputVersion),
    evidences: (raw.evidences || []).map(normalizeEvidence),
    risks: (raw.risks || []).map(normalizeRisk),
    executionSteps: raw.executionSteps || raw.execution_steps || [],
  };
}

export function normalizeTaskArchiveResponse(raw: any): TaskArchiveItem {
  return {
    taskId: raw.taskId || raw.task_id,
    taskTitle: raw.taskTitle || raw.task_title,
    taskType: raw.taskType || raw.task_type || 'full_workflow',
    status: raw.status || 'completed',
    recentStep: raw.recentStep || raw.recent_step,
    assistantName: raw.assistantName || raw.assistant_name || '',
    updatedAt: raw.updatedAt || raw.updated_at || '',
    taskGoal: raw.taskGoal || raw.task_goal || '',
    planVersions: raw.planVersions || raw.plan_versions || [],
    evidencePackVersions: raw.evidencePackVersions || raw.evidence_pack_versions || [],
    outputVersions: raw.outputVersions || raw.output_versions || [],
    analysisSummary: raw.analysisSummary || raw.analysis_summary,
    evidenceSummary: raw.evidenceSummary || raw.evidence_summary,
    risks: raw.risks || [],
    executionContext: normalizeExecutionContext(raw.executionContext || raw.execution_context || {}),
    failedStep: raw.failedStep || raw.failed_step,
    failureKind: raw.failureKind || raw.failure_kind,
    failureReason: raw.failureReason || raw.failure_reason,
    completedSteps: raw.completedSteps || raw.completed_steps,
    pendingSteps: raw.pendingSteps || raw.pending_steps,
    hasOutput: Boolean(raw.hasOutput ?? raw.has_output ?? false),
  };
}
```

### 9.3 Normalize 规则

| 规则 | 示例 |
|---|---|---|
| snake_case → camelCase | `task_id` → `taskId`, `user_goal` → `userGoal` |
| 枚举值兼容 | `"waiting_confirmation"` / `"waiting-confirmation"` → `"waiting_confirmation"` |
| 空值保护 | `null` / `undefined` → 类型默认值（`''`, `[]`, `false`） |
| 时间格式 | 服务端 ISO → 保持 ISO，前端按需 `formatDateTimeToLocalTime()` |
| 布尔值 | `0`/`1` → `false`/`true` |

### 9.4 Normalize 位置

在每个 `src/api/tasks.ts` 函数内部统一调用：

```typescript
export async function createTaskPlan(userGoal: string, appId?: string): Promise<TaskPlan> {
  const res = await request.post('/api/tasks/plans', { userGoal, appId });
  return normalizeTaskPlanResponse(res.data);
}
```

---

## 十、回滚策略表

### 10.1 回滚触发条件

| 条件 | 处理 |
|---|---|
| BE API 持续 5xx | 前端自动切到 mock fallback（`VITE_USE_TASK_MOCK=true` 或 adapter catch） |
| BE v1.1 字段破坏性变更 | 前端暂不回退，通过 normalize 层适配新字段 |
| 执行态异常（超过 N 次失败） | 前端保留 mock fallback，不阻塞页面可访问性 |
| BE 暂停维护 | 通过环境变量 `VITE_USE_TASK_MOCK=true` 全局回退到 mock |

### 10.2 回滚操作表

| 回退场景 | 操作 | 影响范围 | 用户感知 |
|---|---|---|---|
| `POST /api/tasks/plans` 不可用 | `VITE_USE_TASK_MOCK=true` 或 adapter catch → `generateTaskPlan()` | Workbench 规划态 | 无感知（mock 行为与真实 API 一致） |
| `POST /api/tasks/:id/confirm` 不可用 | `VITE_USE_TASK_MOCK=true` 或 adapter catch → `runMockExecution()` | Workbench 执行态 | 无感知（mock 行为与真实 API 一致） |
| `GET /api/tasks/:id/output` 不可用 | `VITE_USE_TASK_MOCK=true` 或 adapter catch → `generateMockOutput()` | Output 工作台 | 无感知（mock 行为与真实 API 一致） |
| `GET /api/tasks` 不可用 | `VITE_USE_TASK_MOCK=true` 或 adapter catch → `MOCK_TASKS` | 历史任务 | 无感知（mock 行为与真实 API 一致） |
| 全部 P0 接口不可用 | `VITE_USE_TASK_MOCK=true` 全局回退 | 所有 Task 页面 | 退回 FE-5 状态，页面完全可用 |

### 10.3 回滚验证

回退后执行：
```bash
npm run type-check
npm run build
npm run stack:verify -- --no-jaeger
```

预期：全部通过，Workbench/Output/Tasks 页面正常渲染 mock 数据。

---

## 十一、P0 替换批次验收命令

### P0-FE-1：TaskPlan 对接

```bash
# 验证 mock 模式（VITE_USE_TASK_MOCK=true，默认）
npm run type-check
npm run build
npm run stack:verify -- --no-jaeger

# 验证 API 模式（需 BE 就绪）
VITE_USE_TASK_MOCK=false npm run build
# 手动验证：首页 → 输入任务 → Workbench → 看到 TaskPlan
```

### P0-FE-2：TaskExecution 对接

```bash
# 验证 mock 模式
npm run type-check
npm run build
npm run stack:verify -- --no-jaeger

# 验证 API 模式（需 BE 就绪）
VITE_USE_TASK_MOCK=false npm run build
# 手动验证：PlanConfirm → 确认执行 → Running → Done → OutputPreview
```

### P0-FE-3：Output 对接

```bash
# 验证 mock 模式
npm run type-check
npm run build
npm run stack:verify -- --no-jaeger

# 验证 API 模式（需 BE 就绪）
VITE_USE_TASK_MOCK=false npm run build
# 手动验证：/tasks/:id/output → 三版输出 → 版本列表 → 重新生成
```

### BE v1.1 确认后补真实接口 smoke

```bash
# 全部 P0-P1 接口 smoke
VITE_USE_TASK_MOCK=false npm run dev

# curl 验证关键端点
curl -X POST http://127.0.0.1:3001/api/tasks/plans \
  -H 'Content-Type: application/json' \
  -d '{"userGoal":"测试任务目标"}'

curl http://127.0.0.1:3001/api/tasks

curl http://127.0.0.1:3001/api/tasks/{taskId}/output
```

---

## 十二、完整验收清单

| # | 检查项 | P0-FE-1 | P0-FE-2 | P0-FE-3 |
|---|---|---|---|---|
| 1 | `npm run type-check` | ✅ | ✅ | ✅ |
| 2 | `npm run build` | ✅ | ✅ | ✅ |
| 3 | `npm run stack:verify -- --no-jaeger` | ✅ | ✅ | ✅ |
| 4 | mock 模式功能正常 | ✅ | ✅ | ✅ |
| 5 | API 模式功能正常（BE 就绪后） | — | — | — |
| 6 | mock fallback 在 API 失败时可用 | ✅ | ✅ | ✅ |
| 7 | 不引入真实 API Key / secret | ✅ | ✅ | ✅ |
| 8 | 不破坏旧 Analyze/Search/Script 页面 | ✅ | ✅ | ✅ |
| 9 | `git status --short -uall` 干净 | ✅ | ✅ | ✅ |
| 10 | commit 仅含目标文件 | ✅ | ✅ | ✅ |
