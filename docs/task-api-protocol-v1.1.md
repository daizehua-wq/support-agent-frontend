# Agent Platform Task API Protocol v1.1

> **定位**：对 v1 的补充与澄清。v1 所有内容仍然有效，v1.1 仅覆盖增量修复和 PM 审定后的决策确认。
> **前置阅读**：`docs/task-api-protocol-v1.md`（数据结构、状态机、字段定义等全部沿用）

---

## 一、API 端点完整清单（18 个，一一确认）

v1 文档标题声明「18 个 RESTful 端点」，但速览表只列了 13 个，缺失 5 个。以下为补全后的完整清单及其在 v1 中的出处：

### 1.1 TaskPlan（4 个）

| # | 方法 | 路径 | v1 速览 | v1 出处 | 用途 |
|---|------|------|---------|---------|------|
| 1 | `POST` | `/api/tasks/plans` | ✅ 已列 | §8.1 第 1 行 | 生成 TaskPlan（同时创建 draft task，详见第二章） |
| 2 | `GET` | `/api/tasks/plans/:taskId` | ✅ 已列 | §8.1 第 2 行 | 获取 TaskPlan 快照 |
| 3 | `PUT` | `/api/tasks/plans/:taskId` | ❌ 缺失 | §8.1 第 3 行 | 编辑 TaskPlan 业务字段（标题、输出对象、语气、备注） |
| 4 | `POST` | `/api/tasks/plans/:taskId/versions` | ❌ 缺失 | §8.1 第 4 行 | 创建新 TaskPlanVersion（edit-goal 模式触发） |

### 1.2 TaskExecution（4 个）

| # | 方法 | 路径 | v1 速览 | v1 出处 | 用途 |
|---|------|------|---------|---------|------|
| 5 | `POST` | `/api/tasks/:taskId/confirm` | ✅ 已列 | §8.2 第 1 行 | 确认并开始执行 |
| 6 | `GET` | `/api/tasks/:taskId/execution` | ✅ 已列 | §8.2 第 2 行 | 获取执行状态（P0 轮询，详见第三章） |
| 7 | `POST` | `/api/tasks/:taskId/stop` | ✅ 已列 | §8.2 第 3 行 | 停止执行 |
| 8 | `POST` | `/api/tasks/:taskId/retry` | ✅ 已列 | §8.2 第 4 行 | 重试失败步骤 |

### 1.3 Output Version（5 个）

| # | 方法 | 路径 | v1 速览 | v1 出处 | 用途 |
|---|------|------|---------|---------|------|
| 9 | `GET` | `/api/tasks/:taskId/output` | ✅ 已列 | §8.3 第 1 行 | 获取当前版本 Output 详情 |
| 10 | `GET` | `/api/tasks/:taskId/output/versions` | ✅ 已列 | §8.3 第 2 行 | 获取所有 Output 版本历史列表 |
| 11 | `POST` | `/api/tasks/:taskId/output/regenerate` | ✅ 已列 | §8.3 第 3 行 | 重新生成 Output（唯一创建新版本的写操作） |
| 12 | `PUT` | `/api/tasks/:taskId/output/set-current` | ❌ 缺失 | §8.3 第 4 行 | 切换当前版本指针（纯指针操作，不生成版本） |
| 13 | `GET` | `/api/tasks/:taskId/output/export/markdown` | ❌ 缺失 | §8.3 第 5 行 | 导出当前版本为 Markdown 文本 |

### 1.4 Task Archive（5 个）

| # | 方法 | 路径 | v1 速览 | v1 出处 | 用途 |
|---|------|------|---------|---------|------|
| 14 | `GET` | `/api/tasks` | ✅ 已列 | §8.4 第 1 行 | 历史任务列表（支持 type/status/q 筛选） |
| 15 | `GET` | `/api/tasks/:taskId` | ✅ 已列 | §8.4 第 2 行 | 历史任务详情（聚合视图含所有版本记录） |
| 16 | `GET` | `/api/tasks/recent` | ✅ 已列 | §8.4 第 3 行 | 最近 N 个任务（Home 页） |
| 17 | `POST` | `/api/tasks/:taskId/continue` | ✅ 已列 | §8.4 第 4 行 | 继续推进（4 种模式） |
| 18 | `PUT` | `/api/tasks/:taskId/set-current-version` | ❌ 缺失 | §8.4 第 5 行 | 跨版本类型设置当前有效版本（plan/evidence/output） |

**结论：v1 文档速览确实漏了 #3、#4、#12、#13、#18，现全部补齐。端点总数确认为 18。**

---

### 1.5 端点设计方法确认（回应 PM 关注点）

| 问题 | v1 方法 | v1.1 确认 | 理由 |
|------|---------|-----------|------|
| `POST /api/tasks/:taskId/output/set-current`？ | `PUT` | **确认为 `PUT`** | 设置当前版本是指定到已知 versionId 的幂等操作，语义上符合 PUT |
| `POST /api/tasks/:taskId/output/export/markdown`？ | `GET` | **确认为 `GET`** | 纯读取、无副作用，RESTful 标准。如需自定义导出格式参数，走 query string |
| `GET /api/tasks/:taskId/versions`？ | 不存在 | **不在 v1 中，无需单独新增** | `GET /api/tasks/:taskId`（Archive 详情）已内嵌 `planVersions[]`、`evidencePackVersions[]`、`outputVersions[]` 三个数组。如需按类型过滤的轻量查询，可放入 P2 补充 |
| Evidence Pack 独立接口？ | 不存在 | **v1 无独立接口** | Evidence Pack Version 目前作为 Task 的子资源隐式管理：① 由 `supplement-regenerate` 模式隐式创建；② 版本记录通过 `GET /api/tasks/:taskId` 的 `.evidencePackVersions[]` 返回。本章 1.6 给出 P2 补充建议 |

### 1.6 Evidence Pack（P2 新增建议）

当前 Evidence Pack 无独立 REST 端点。建议 P2 补充两个只读接口以支持独立的证据版本浏览：

| 方法 | 路径 | 用途 | 优先级 |
|------|------|------|--------|
| `GET` | `/api/tasks/:taskId/evidence` | 列出所有 Evidence Pack Version 摘要 | P2 |
| `GET` | `/api/tasks/:taskId/evidence/:versionId` | 获取指定 Evidence Pack Version 详情 | P2 |

> 加上这 2 个后总计 20 个端点，但 v1/v1.1 范围内以 18 个为准。

---

## 二、TaskPlan 生成 = 创建 Task（POST /api/tasks/plans）

### 2.1 决策

**`POST /api/tasks/plans` 必须同时创建 draft task 并返回 `taskId`。**

### 2.2 行为

```
用户输入 userGoal
      │
      ▼
POST /api/tasks/plans
      │
      ├── 1. 创建 task 记录（status=draft），分配 taskId
      ├── 2. 调用规划器生成 TaskPlan
      ├── 3. 将 TaskPlan 挂载到该 task
      └── 4. 返回 taskId + planId + planVersion + status + taskPlan
```

### 2.3 响应体

```typescript
// POST /api/tasks/plans 响应
{
  "success": true,
  "data": {
    "taskId": "uuid",             // ← 返回给前端，用于后续所有操作
    "planId": "uuid",             // TaskPlan 自身的 ID
    "planVersion": "v1",          // TaskPlan Version 标识
    "status": "waiting_confirmation",  // draft → planning → waiting_confirmation
    "taskPlan": { ... }           // 完整 TaskPlan 对象
  }
}
```

### 2.4 已有 taskId 场景

如果前端已持有 taskId（如 clone-task-structure 后），需要基于已有 task 重新规划：

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/tasks/plans`（传入 `{ taskId }`） | 基于已有 task 生成新 TaskPlan（用于 clone 后重新规划） |

响应同上，但 taskId 为已存在的值。

### 2.5 与 v1 差异

v1 没有显式写出 `taskId` 在响应中。v1.1 明确：
- **每次 POST /api/tasks/plans 都创建一个 task（可能是新的，也可能是已有 task 的新 plan）**
- **taskId 是前端与 Task 交互的一级标识，所有后续请求都在 `:taskId` 路径上**

---

## 三、TaskExecution 推送策略

### 3.1 决策

**P0 阶段使用 polling。SSE / WebSocket 放入 P1/P2。**

### 3.2 Polling 模型

```
POST /api/tasks/:taskId/confirm
      │
      ▼
      返回 TaskExecution（status=running）
      │
      ▼
前端轮询 GET /api/tasks/:taskId/execution
      │
      ├── 推荐间隔：running 态 2s，idle/degraded 态 5s
      ├── 最大轮询时长：前端自行控制（建议 120s 超时提示）
      └── 终止条件：status 变为 done / failed / cancelled
```

### 3.3 GET /api/tasks/:taskId/execution 响应

```typescript
{
  "success": true,
  "data": {
    "taskId": "uuid",
    "status": "running",           // idle | running | done | degraded | failed | cancelled
    "currentStepId": "step-2",     // 当前正在执行的 step
    "steps": [ ... ],              // TaskStepExecution[] 含实时 status/duration/detail
    "degradedMarkers": [],
    "outputPreview": { ... },      // 仅在 done 时填充
    "errorContext": { ... },       // 仅在 failed/degraded 时填充
    "startedAt": "ISO",
    "completedAt": null
  }
}
```

### 3.4 未来推送方案

| 阶段 | 方案 | 端点 | 说明 |
|------|------|------|------|
| P0 | Polling | `GET /api/tasks/:taskId/execution` | 当前方案 |
| P1 | SSE | `GET /api/tasks/:taskId/execution/stream` | 服务端推送步骤状态变更事件 |
| P2 | WebSocket | `ws://.../tasks/:taskId/execution` | 双向实时通信，支持 stop/retry 指令 |

### 3.5 Polling 负载注意事项

- 服务端应缓存 TaskExecution 快照，避免每次 polling 都重新查询所有子资源
- 建议响应 `ETag` 或 `Last-Modified`，前端可配合 `If-None-Match` 减少传输
- `steps[].details[]` 字段可能较大（分析/证据的详细文本），建议在 polling 响应中截断到 200 字摘要，完整内容通过 `GET /api/tasks/:taskId/output` 获取

---

## 四、Output Version currentVersion 规则

### 4.1 核心原则

| 操作 | 是否生成新版本 | 触及的资源 | 说明 |
|------|:---:|------|------|
| 查看 Output 版本历史 | ❌ 否 | — | `GET /output/versions` 纯读取 |
| 复制历史版本内容 | ❌ 否 | — | 前端行为，不涉及服务端 |
| 切换当前版本 | ❌ 否 | `isCurrent` 指针 | `PUT /output/set-current` 仅修改 `isCurrent` 布尔字段 |
| 重新生成 | ✅ 是 | 新 `OutputVersion` | `POST /output/regenerate` |
| 补充资料后重新生成 | ✅ 是 | 新 `EvidencePack Version` + 新 `OutputVersion` | `POST /continue`（supplement-regenerate 模式） |
| 修改任务目标 | ✅ 是 | 新 `TaskPlan Version` | `POST /plans/:taskId/versions`（edit-goal 模式） |

### 4.2 各操作详解

#### 4.2.1 切换当前版本 (`PUT /output/set-current`)

```
请求：PUT /api/tasks/:taskId/output/set-current
Body：{ "versionId": "output-v3" }

行为：
  1. 校验 versionId 属于该 task
  2. 遍历所有 OutputVersion，将当前 isCurrent=true 的设为 false
  3. 将目标版本 isCurrent 设为 true
  4. 返回 { success: true }

不创建：新 OutputVersion、新 EvidencePackVersion、新 TaskPlanVersion
```

#### 4.2.2 重新生成 (`POST /output/regenerate`)

```
请求：POST /api/tasks/:taskId/output/regenerate
Body：{ "mode": "continue-output", "toneStyle?": "formal" }

行为：
  1. 复用当前 EvidencePack + TaskPlan
  2. 调用输出模型生成新内容
  3. 创建新 OutputVersion（isCurrent=true，旧版本 isCurrent=false）
  4. 返回 { outputVersionId: "output-v4" }

创建：新 OutputVersion
```

#### 4.2.3 补充资料后重新生成 (`POST /continue` supplement-regenerate)

```
请求：POST /api/tasks/:taskId/continue
Body：{ "mode": "supplement-regenerate", "supplementedInfo": {...} }

行为：
  1. 合并用户补充信息，创建新 EvidencePackVersion
  2. 基于新 EvidencePack 重新收集/验证证据
  3. 基于新证据 调用输出模型生成
  4. 创建新 OutputVersion（关联新的 evidencePackVersionId）
  5. 返回 { evidenceVersionId, outputVersionId }

创建：新 EvidencePackVersion + 新 OutputVersion
```

#### 4.2.4 修改任务目标 (`POST /plans/:taskId/versions`)

```
请求：POST /api/tasks/plans/:taskId/versions
Body：{ "userGoal": "新的任务目标" }

行为：
  1. 创建新 TaskPlanVersion（基于新 userGoal 重新规划）
  2. 旧 TaskPlan 状态标记为 superseded
  3. 新 TaskPlan 状态设为 waiting_confirmation
  4. 返回 { taskId, newPlanVersionId }

创建：新 TaskPlanVersion
（不自动创建新 EvidencePack 或 OutputVersion，需用户重新 confirm 后才生成）
```

### 4.3 版本链关系

```
TaskPlan Version v1 ──→ EvidencePack Version v1 ──→ Output Version v1 (isCurrent)
                                                  ├── Output Version v2 (regenerated)
                                                  └── Output Version v3 (set-current 后变 isCurrent)
                         EvidencePack Version v2 ──→ Output Version v4 (isCurrent, supplement-regenerate)
TaskPlan Version v2 ───────────────────────────────── (edit-goal, 尚未 confirm)
```

---

## 五、旧 Session → Task 兼容：第一阶段（只读适配层）

### 5.1 决策

**第一阶段不做存储迁移，仅实现只读适配层。**

```
┌──────────────────────────────────────────────────────────┐
│                     API Layer                            │
│  GET /api/tasks          ──→  TaskService.list()         │
│  GET /api/tasks/:taskId  ──→  TaskService.get(id)       │
│                              │                           │
│               ┌──────────────┴──────────────┐            │
│               │     Adapter (Phase 1)        │            │
│               │                              │            │
│               │  1. 查询新 task-store        │            │
│               │  2. 若未命中 → 查旧 session- │            │
│               │     store 并映射为 TaskArchive│           │
│               │  3. 合并返回                  │            │
│               └──────────────────────────────┘            │
└──────────────────────────────────────────────────────────┘
```

### 5.2 适配层行为

| 场景 | 行为 |
|------|------|
| taskId 在新 task-store 中有记录 | 直接返回 TaskArchive |
| taskId 只在旧 session-store 中有记录 | 通过映射表转换为 TaskArchive 返回 |
| taskId 两处都不存在 | 返回 `TASK_NOT_FOUND` |
| 列表查询（`GET /api/tasks`） | 合并新 task-store + 映射后的旧 session-store，按 `updatedAt` 排序，去重 |

### 5.3 映射表（Session → TaskArchive）

适配层需要将旧 session 结构转换为 TaskArchiveItem。完整映射表见 v1 §7.1。适配层实现要点：

```typescript
// 伪代码：Adapter.mapSessionToTaskArchive(session): TaskArchiveItem
{
  taskId: session.id,
  taskTitle: session.title || session.goal?.slice(0, 28),
  taskType: mapSessionType(session.type),      // 'full_workflow' | ...
  status: mapSessionStatus(session),           // session.steps 状态 → TaskArchiveStatus
  recentStep: getLastActiveStep(session),
  assistantName: resolveAssistantName(session.assistantId),
  updatedAt: session.updatedAt,
  taskGoal: session.goal,
  planVersions: [{ versionId: session.id + '-plan-v1', label: 'v1', kind: 'task_plan', ... }],
  evidencePackVersions: mapEvidenceToVersions(session.evidences),
  outputVersions: mapOutputToVersions(session.steps),
  executionContext: mapContext(session),
  hasOutput: session.steps?.some(s => s.type === 'generate-script' && s.status === 'completed'),
  // ... 其余字段使用默认值
}
```

### 5.4 与新写的隔离

| 操作 | 是否写旧 store |
|------|:---:|
| `POST /api/tasks/plans` | ❌ 不写旧 store |
| `POST /api/tasks/:taskId/confirm` | ❌ 不写旧 store |
| `POST /api/tasks/:taskId/output/regenerate` | ❌ 不写旧 store |
| 所有写操作 | ❌ 仅写新 task-store |

**旧 session-store 从 Phase 1 起就冻结写入，只保留查询映射能力。这避免了双写一致性问题，也避免了旧页面（Analyze/Search/Script）产生新格式数据。**

### 5.5 后续阶段（Phase 2/3）

| 阶段 | 说明 | v1 出处 |
|------|------|---------|
| Phase 1（当前） | 只读适配层，旧数据通过映射暴露 | 本次明确 |
| Phase 2 | 一次性数据迁移脚本 + 前端切新路由 | v1 §7.2 阶段 3 |
| Phase 3 | 删除旧 session-store 和旧路由 | v1 §7.2 阶段 3 |

> v1 原「阶段 1 双写」被 PM 否决，改为 v1.1 的「只读适配 + 新数据只写新 store」。

---

## 六、P0 接口开发顺序（三批）

### 6.1 排序原则

1. 解除前端核心 mock 依赖优先
2. 每组接口内部字段可以自洽（前端不需要在两步之间等后端）
3. 先完成执行闭环，再做查看/管理

### 6.2 P0-1：TaskPlan 生成 + 确认 + 执行轮询

**目标：打通「输入目标 → 看到规划 → 确认执行 → 看到步骤推进」的完整链路。**

| 接口 | 说明 | 前端 mock 替代 |
|------|------|:---:|
| `POST /api/tasks/plans` | 生成 TaskPlan + 创建 draft task | `mockTaskPlanner.ts` |
| `GET /api/tasks/plans/:taskId` | 获取 TaskPlan（confirm 页刷新时用） | `mockTaskPlanner.ts` |
| `POST /api/tasks/:taskId/confirm` | 确认并开始执行 | `mockTaskExecutor.ts` |
| `GET /api/tasks/:taskId/execution` | 轮询执行状态 | `mockTaskExecutor.ts` |

**数据链路：**
```
POST /plans → taskId
     ↓
用户确认
     ↓
POST /confirm → TaskExecution (running)
     ↓
GET /execution (轮询) → 步骤状态推进 → done
```

### 6.3 P0-2：Output Version 查看 / 重新生成 / 切换版本

**目标：打通「执行完成 → 看到 Output → 管理版本 → 重新生成」链路。**

| 接口 | 说明 | 前端 mock 替代 |
|------|------|:---:|
| `GET /api/tasks/:taskId/output` | 获取当前版本 Output 详情 | `mockOutput.ts` |
| `GET /api/tasks/:taskId/output/versions` | 获取 Output 版本历史列表 | `mockOutput.ts` 版本历史 |
| `POST /api/tasks/:taskId/output/regenerate` | 重新生成 Output（创建新版本） | `mockOutput.ts` Regenerating |
| `PUT /api/tasks/:taskId/output/set-current` | 切换当前版本指针 | 无 mock，前端版本管理 UI |
| `GET /api/tasks/:taskId/output/export/markdown` | 导出 Markdown | 无 mock，前端导出按钮 |

### 6.4 P0-3：Task Archive 列表 / 详情 / 最近 / 继续

**目标：打通「历史任务列表 → 点击查看 → 继续执行」链路。**

| 接口 | 说明 | 前端 mock 替代 |
|------|------|:---:|
| `GET /api/tasks` | 历史任务列表（含筛选） | `mockTasks.ts` |
| `GET /api/tasks/:taskId` | 历史任务详情（聚合视图） | `mockTasks.ts` 详情 |
| `GET /api/tasks/recent` | 最近 N 个任务（Home 页） | 无 mock，Home 页组件 |
| `POST /api/tasks/:taskId/continue` | 继续推进（4 种模式） | `mockTasks.ts` ContinueTaskModal |

### 6.5 P0 接口总览

| 批次 | 接口数 | 累计解除 mock |
|------|:--:|------|
| P0-1 | 4 | `mockTaskPlanner.ts` + `mockTaskExecutor.ts` |
| P0-2 | 5 | `mockOutput.ts` |
| P0-3 | 4 | `mockTasks.ts` |
| **合计** | **13** | **全部核心 mock 解除** |

### 6.6 与 v1 优先级调整对比

| 接口 | v1 优先级 | v1.1 优先级 | 调整理由 |
|------|:---:|:---:|------|
| `GET /api/tasks/output/versions` | P1 | P0-2 | 版本管理是 Output 页基础功能，不放 P1 |
| `PUT /api/tasks/output/set-current` | P2 | P0-2 | 同上，版本切换是 Output 版本管理闭环必备 |
| `GET /api/tasks/output/export/markdown` | — | P0-2 | v1 未出现在优先级表中，Output 页面导出硬需求 |
| `GET /api/tasks/recent` | P1 | P0-3 | Home 页依赖，P0 最后一批 |
| `POST /api/tasks/continue` | P1 | P0-3 | 历史任务继续推进闭环，P0 收尾 |

---

## 七、补充说明

### 7.1 文档勘误记录

| 位置 | v1 原文 | 修正 |
|------|---------|------|
| 标题 | "18 个 RESTful 端点" | 确认 18 个，速览表遗漏 5 个（见第一章） |
| §7.2 阶段 1 | "创建 GET /api/tasks?legacy=true 时同时查询旧 session 表...新 task 写入时也写一份到旧 session 表" | **废除双写方案**，改为只读适配层（见第五章） |
| §8.5 | 无 | v1.1 补充完整端点速览（见第一章） |

### 7.2 待决策项（不阻塞 P0 开发）

| 事项 | 当前状态 | 建议 |
|------|------|------|
| Evidence Pack 独立端点 | v1 无 | P2 新增 `GET /api/tasks/:taskId/evidence` 和 `GET /api/tasks/:taskId/evidence/:versionId` |
| SSE 执行推送 | v1 提及但未设计 | P1 设计 `GET /api/tasks/:taskId/execution/stream` |
| WebSocket 双向信道 | v1 未提及 | P2 评估 |
| TaskPlan 版本历史查询 | v1 无独立端点 | 当前通过 `GET /api/tasks/:taskId` 的 `planVersions[]` 获取，暂不新增 |
| Markdown 导出格式参数 | GET 无 body | 如需指定格式参数用 query string，不建议改 POST |

---

### 7.3 时间字段规范

**P0 Task API 所有时间字段统一使用 ISO 8601 UTC 格式。**

| 字段 | 格式 | 示例 |
|------|------|------|
| `createdAt` | `YYYY-MM-DDTHH:mm:ss.sssZ` | `2026-04-28T15:58:03.186Z` |
| `updatedAt` | 同上 | `2026-04-28T15:58:03.186Z` |
| `startedAt` | 同上 | `2026-04-28T15:58:22.375Z` |
| `completedAt` | 同上或 `null` | `2026-04-28T15:58:29.876Z` |
| `durationMs` | `number`（毫秒） | `2000` |

**职责边界：**
- **后端**：所有时间字段返回 UTC（`new Date().toISOString()`）
- **前端**：负责本地化展示（`dayjs(date).format(...)` 或 `new Date(date).toLocaleString()`）

> 不可在后端做 `+08:00` 偏移或 `YYYY-MM-DD HH:mm:ss` 格式化，维持 API 时区中立项。

### 7.4 Status 枚举确认

P0 仅使用前端 `src/types/taskPlan.ts` 已声明的枚举值，不使用任何临时状态名。

| 上下文 | 枚举类型 | 合法值 | P0 使用 |
|------|------|------|:--:|
| TaskPlan.status | `TaskPlanStatus` | `draft` \| `planning` \| `waiting_confirmation` | `waiting_confirmation` |
| TaskExecution.status | `TaskExecutionStatus` | `idle` \| `running` \| `failed` \| `degraded` \| `done` \| `cancelled` | `idle` / `running` / `done` |
| TaskStepExecution.status | `TaskStepExecutionStatus` | `pending` \| `running` \| `done` \| `failed` \| `degraded` \| `skipped` | `pending` / `running` / `done` |
| ExecutionContext.taskPlanner.source | `PlannerSource` | `embedded_model` \| `rule_engine` \| `fallback` | `rule_engine` |
| ExecutionContext.assistantSource | `AssistantSource` | `manual` \| `app_default` \| `user_default` \| `global_default` \| `fallback` | `global_default` |
| DataSource status | `DataSourceStatus` | `healthy` \| `degraded` \| `unavailable` \| `disabled` \| `unknown` | `healthy` / `unknown` |

**禁止使用的值：**`completed`、`success`、`in_progress`、`generating`、`error` 等未在前端类型中声明的状态名。

### 7.5 Step Title 文案规范

后端返回的 step `title` 字段必须与前端 Handoff 展示一致：

| step type | title | 说明 |
|------|------|------|
| `analysis` | `分析客户场景` | 对应 Analyze 阶段 UI |
| `evidence` | `检索资料与证据` | 对应 Evidence 阶段 UI |
| `output` | `生成输出` | 对应 Output 阶段 UI |
| `save` | `保存历史任务` | 对应 Save 阶段 UI |

> 这些 title 同时出现在 `TaskPlan.steps[].title` 和 `TaskExecution.steps[].title` 中，必须保持一致。

---

## 八、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1 | — | 初始协议，PM 初审通过 |
| v1.1 | 2026-04-28 | 补齐 18 端点完整清单；明确 TaskPlan 生成返回 taskId；确定 P0 polling 策略；定义 Output Version 创建/不创建的精确规则；修正旧 Session 兼容为只读适配层；重排 P0 开发顺序为 3 个子批次；补充时间字段规范（ISO 8601 UTC）；确认 status 枚举只使用前端已声明值；规范 step title 文案 |
