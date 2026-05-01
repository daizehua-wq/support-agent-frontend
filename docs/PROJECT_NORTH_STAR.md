# 项目北极星：从现在 → 可上线

单一口径：能**自动理解任务 → 自动执行 → 产出结果**的 Agent 平台（Workbench 手动态 → **AutoRun**）。

---

## 一、总目标（一句话）

做一个可演进的 **Agent 平台**：单任务先跑稳，再自动跑，再多任务与企业级能力。

---

## 二、阶段地图

| 阶段 | 焦点 | 完成判据（摘要） |
|------|------|------------------|
| **Phase 1** | 单任务闭环 | 输入 → Planner → TaskPlan → **手动 Confirm** → Step Runner → analyze/search/script Flow → Save → Output / Archive；链稳定、结果可信 |
| **Phase 1.5（Fix-5）** | AutoRun | TaskPlan → **自动 confirm** → 自动执行（不改业务编排语义） |
| **Phase 2** | 多任务 / Agent | 一目标拆多子任务、调度、执行、汇总 |
| **Phase 3** | 企业级平台 | 多模型、多数据源、权限 / 审计 / 归档 |

---

## 三、当前阶段子目标（优先级）

1. **系统稳定性（Fix-4，当前唯一硬目标）**  
   `TaskPlan → confirm → execution → done → Output` 不踩坑：不重复 confirm（无「双成功」）、无空 `taskId` URL、UI 与轮询不乱、watchdog 不误杀。

2. **数据真实性（Fix-3b，已完成）**  
   Output / Evidence 来自执行链与 taskStore，而非纯 mock；`step.source` 可区分 flow / rule-engine / fallback / template 等。

3. **状态单一真相**  
   禁止 `done` 与 `failed` 并存、Workbench 与 execution 口径一致。

4. **Fallback 策略化**  
   flow → rule-engine → template；UI 不白屏；来源可观测。

5. **可观测性**  
   `step.source`、`durationMs`、`currentStepId`、planner `source` / `fallbackReason` 等可解释。

---

## 四、三层目标（对外一句话）

- **当前必须完成**：单任务稳定闭环（**Fix-4**）。  
- **下一步**：AutoRun（**Fix-5**）。  
- **中长期**：多任务 Agent + 企业级平台。

---

## 五、Fix-4：验收与自动化

**目标**：封口主链风险，不加功能。

### 5.1 一键 API 回归（需 mock-server 已启动）

```bash
npm run verify:frontend   # lint + type-check + build（CI 同源）
npm run test:fix4         # 需 mock-server :3001
```

默认请求 `http://127.0.0.1:3001`（可用环境变量 `API_BASE_URL` 覆盖）。

脚本覆盖：双 confirm 行为、空路径 confirm、执行完成后四步 `done` 与 `step.source`、Output / Archive 可读、敏感信息粗扫等。  
**不替代** Playwright 级 UI 验收；Workbench 四步 UI、History 摘要等见下方手测清单。

### 5.1b Playwright：手测表自动化（API + UI）

首次需安装浏览器（一次性）：

```bash
npx playwright install chromium
```

一键（会自动启动 mock + Vite，若端口已占用则复用）：

```bash
npm run test:fix4:e2e
```

仅在本机已手动拉起 `:3001` / `:5173` 时：

```bash
FIX4_E2E_USE_EXISTING=1 npm run test:fix4:e2e
```

API + 主链 UI 合并验收：

```bash
npm run test:fix4:all
```

全量 Fix-4 收口（含 `task-main-chain-smoke`）：

```bash
npm run test:fix4:verify
```

### 5.2 手测清单（Fix-4）

| # | 项 | 说明 |
|---|----|------|
| 1 | flow source | 执行完成后各步 `source` 符合预期（与脚本断言一致或肉眼核对 Network） |
| 2 | Output API | `GET .../output` 在 done 后为 200，内容与执行链一致 |
| 3 | Evidence / Archive | 详情页证据包与摘要存在且合理 |
| 4 | fallback | 人为制造 flow 失败时仍完成链、不白屏；API 回归见 `__FIX4_AF__` / `__FIX4_OT__` 前缀（`taskService` 仅测试路径） |
| 5 | Workbench | 四步均为 done，状态与轮询一致 |
| 6 | History detail | 摘要、输出入口正常 |
| 7 | 无 secret 泄露 | Network / 响应体无密钥模式 |
| 8 | embedded 两分支 | `phase1-fix4-regression` §8 多次采样 `executionContext.source`；`FIX4_REQUIRE_DUAL_PLANNER=1` 时强制两种都出现 |

**与 §5.1 / §5.1b 的对应关系**

| 手测 # | `npm run test:fix4` | `npm run test:fix4:e2e` |
|--------|---------------------|-------------------------|
| 1 | 断言 `step.source` 非空 | 再次用 `page.request` 校验 execution JSON |
| 2 | GET output 结构 | 浏览器进入 Output 页 + 请求体验证 `formalVersion` |
| 3 | Archive 字段 | UI：历史详情「最终输出摘要」+ API `outputSummary` |
| 4 | `__FIX4_AF__` / `__FIX4_OT__` 用例 | 强制跳过 flow，断言降级 source + 全链 `done` |
| 5 | 轮询与 done（API） | UI：时间线四个「已完成」+「任务完成」 |
| 6 | 列表/详情部分 | UI：`进入 Output 工作台` |
| 7 | 响应粗扫 | execution / output / detail 文本密钥模式扫描 |
| 8 | §8 多次 `POST /plans` 采样 | 可选 `FIX4_REQUIRE_DUAL_PLANNER=1` 强校验两分支 |

---

## 六、Fix-5（AutoRun）— 已实现开关

- **默认**：与 Phase 1 一致，仍为 **手动** 点「确认并开始执行」。
- **开启**：构建/开发环境设置 `VITE_WORKBENCH_AUTORUN=true`（例如 `.env.local`）。  
  TaskPlan 就绪（`plan_confirm`、无必填 missing、执行侧为 `idle`）后，**自动调用一次** `start({ taskId, userGoal })`，即单次 `POST .../confirm` + 轮询；**409 / `TASK_STATUS_CONFLICT`** 仍走 `useTaskExecution` 既有恢复逻辑。
- **防双发**：同一 `taskId` 仅自动触发一次；生成**新** `taskId` 时会 `reset()` 并清空 AutoRun 记忆。
- **CI**：根目录 `frontend-ci.yml` 当前不跑 Playwright；全量 Fix-4 门禁请本地或单独 job 执行 `npm run test:fix4:verify`。

---

## 七、落地排期（按北极星执行）

以下为**批次 → 门禁 → 主要触点**，与 `docs/Agent_Platform_架构与排雷路线图.md` 中 Phase 1/2/3 对齐，但以北极星阶段为准绳。

### 批次 A — Fix-4 收口（当前，约 2–4 人日）

| 工作包 | 做什么 | 主要触点 | 出门禁 |
|--------|--------|----------|--------|
| A1 API + UI 回归 | 主链稳定性自动化 | `npm run test:fix4:verify`（含 `task-main-chain-smoke` + E2E；需 `npx playwright install chromium` 一次）、可选 `npm run test:workflow:release` | `test:fix4:verify` 全绿即 Fix-4 自动化收口 |
| A2 UI 手测 | 北极星 §5.2 八条 | `src/pages/Workbench`、`src/pages/Tasks/*`、`useTaskExecution` | 记录截图或 checklist 打勾，无 `/api/tasks//confirm`、无重复成功 confirm |
| A3 状态与轮询 | 单一真相与终态 | `useTaskExecution.ts`、`Workbench/index.tsx` | 无 done+failed 同屏；`TASK_STATUS_CONFLICT` 仅触发重拉 execution，不脏写 |
| A4 Fallback 抽检 | 非白屏与 source | `mock-server/services/taskService.js`、各 `*Flow` | 人为断流/异常后链完成或可控失败，Network 中 `step.source` 可读 |
| A5 证据归档 | Fix-4 完成声明 | PR 描述或内部 wiki 一段 | 引用本文件 §五 + 手测表 |

**批次 A 总门禁**：在 mock 栈拉起前提下，`type-check` + `lint` + `build` + `test:fix4` + `test:task:main`（若已接 CI）全绿；手测表完成。

### 批次 B — Fix-5 AutoRun（进行中）

| 工作包 | 做什么 | 主要触点 | 出门禁 |
|--------|--------|----------|--------|
| B1 开关与策略 | `VITE_WORKBENCH_AUTORUN`，默认关闭 | `Workbench/index.tsx` | 不设 env 时与现网一致 |
| B2 自动 confirm | 就绪后单次 `start()` | 同上 + `useTaskExecution` | 同 taskId 不重复；409 走既有路径 |
| B3 观测 | AutoRun 提示 + 可搜日志 | `message.info` / 后续可加 debug 前缀 | 可区分触发源 |
| B4 回归 | 手动 + `VITE_WORKBENCH_AUTORUN=true` 各一条 | 本地 / stack | 两条路径均 done + Output |

**批次 B 总门禁**：手动模式零回归；AutoRun 开环跑通一条主链（可与 Fix-4 E2E 分拆）。

### 批次 C — Phase 2 入口（AutoRun 稳定后，按需拆分）

| 方向 | 做什么 | 备注 |
|------|--------|------|
| 子任务模型 | TaskPlan 拆多 step 或多 `childTaskId` | 先协议与 UI 空态，再调度 |
| 调度 | 队列/优先级/并发上限 | 与 `taskService` 持久化（路线图 P3-1）解耦，可先内存 |
| 汇总 | 多子任务 output 合并进 Archive | 依赖 Output 版本模型不变 |

### 批次 D — Phase 3 企业级（并行准备，不阻塞 A/B）

权限/审计、多模型路由、数据源治理：按路线图 P3 与 `ARCHITECTURE.md` 边界推进；**不进入 Fix-4/5 的同一 PR**。

### 每周节奏建议

1. **每周开始**：对照本文件「阶段地图」确认当前只推进一个主目标（本周 = Fix-4 或 Fix-5）。  
2. **每周结束**：更新一次「批次门禁」是否满足；未满足则**不扩 scope**（不加新功能项）。  
3. **与路线图关系**：细节排期仍以 `Agent_Platform_架构与排雷路线图.md` 为补充；冲突时**以北极星阶段门禁为准**。
