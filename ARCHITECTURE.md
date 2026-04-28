# 五主层 + P2.5 工程架构

本文是本项目的正式架构边界说明。后续新增功能、修复缺陷、做代码评审和上线检查时，默认按这里的五个主层和 P2.5 数据访问层判断代码应该放在哪里，以及每一层允许和不允许承担什么职责。

## 一、总览

当前项目正式划分为五个主层，并在 P2 与 P3/P1 之间新增 `P2.5 数据访问层`：

| 层级 | 名称 | 核心职责 | 典型目录 |
| --- | --- | --- | --- |
| P0 | 安全与规则层 | 安全边界、权限、脱敏、治理规则、确定性规则、策略约束 | `mock-server/middleware`、`mock-server/services/*security*`、`mock-server/services/*Governance*`、`mock-server/plugins/*rule-engine*`、`python_runtime/app/middleware` |
| P1 | 协调层 | 任务分发、上下文装配、Assistant/Prompt/策略解析、工作流编排、Session 连续性、应用装配运行 | `mock-server/routes/runtimeRoutes.js`、`mock-server/services/taskWorkbenchService.js`、`mock-server/services/assistantContextService.js`、`mock-server/services/sessionService.js`、`mock-server/services/pluginRegistryService.js`、`mock-server/services/workflowNodeRegistry.js` |
| P1A | 应用装配能力 | 把真实业务需求沉淀成可发布、可运行、可审计的 Application Pack | `mock-server/data/models/applicationPack.js`、`mock-server/data/routes/internalApplicationPacks.js`、`docs/application-pack-spec.md` |
| P2 | 模块能力层 | 判断、检索、写作、模型、数据库、Python Runtime 等具体能力执行 | `mock-server/flows`、`mock-server/services/search*`、`mock-server/services/model*`、`mock-server/services/databaseService.js`、`mock-server/services/pythonRuntimeAdapterService.js`、`python_runtime/app` |
| P2.5 | 内部数据访问层 | 外部连接 API Key 引用与历史会话/消息的内部持久化 | `mock-server/data`、`mock-server/data/routes`、`mock-server/data/models`、`mock-server/data/database.js` |
| P3 | 界面层 | 页面展示、表单交互、前端接口适配、结果展示、用户流转 | `src/pages`、`src/components`、`src/api`、`src/utils`、`src/router`、`src/layout` |
| 监控层 | 观测与回归层 | 健康检查、运行事件、Tracing、告警、回归脚本、验证报告 | `mock-server/services/opsObservabilityService.js`、`mock-server/tracing.js`、`scripts`、`mock-server/test-results`、`data/opsRuntimeDashboard.json` |

调用方向默认是：

```text
P3 界面层 -> P1 协调层 -> P0 安全与规则层 / P2 模块能力层 / P2.5 数据访问层
监控层横向观测 P0/P1/P2/P2.5/P3，但不直接承接业务决策。
```

P0 可以拦截、降级或拒绝 P1/P2/P2.5 的执行。P1 负责组织流程，不直接写具体模块算法。P2 负责能力执行，不决定页面跳转和全局治理策略。P2.5 负责结构化数据访问，不承接业务决策。P3 负责展示与交互，不写核心业务规则。监控层只记录和告警，不偷偷改变业务结果。

`P1A 应用装配能力` 不是新增业务页面，而是 P1 的产品化子能力：它把“真实需求表 / 业务痛点 / 数据源 / 工具 / 工作流 / 规则 / 输出合同 / 人审策略 / 验收用例”合成为 `Application Pack`。Pack 的定义存放在 P2.5，发布和运行由 P1 调度，安全、人审和高影响决策边界由 P0 约束。

## 二、P0 安全与规则层

P0 是最高优先级层，负责所有必须先于业务执行生效的安全、权限、规则和治理约束。

允许做：

- 定义和执行脱敏、出站控制、权限隔离、SSO、租户隔离、密钥托管、安全态势检查。
- 定义确定性规则，例如分析规则、检索规则、外发规则、Prompt 完整性校验、策略白名单。
- 管理 Assistant、Prompt、Settings、数据库关系等治理注册表和版本审计。
- 给 P1/P2 返回结构化的允许、拒绝、降级、fallback、审计结果。
- 对高风险输入或不合规执行进行阻断。

不允许做：

- 不直接渲染页面或处理 UI 状态。
- 不直接决定用户下一步跳转到哪个页面。
- 不把临时页面默认值、表单占位文案写成规则。
- 不绕过 P1 直接调用业务模块形成完整业务链路。
- 不把监控告警当作业务结果返回给用户，除非该告警已经被定义为安全策略的一部分。

典型文件：

- `mock-server/middleware/security.js`
- `mock-server/services/securityMiddlewareService.js`
- `mock-server/services/sanitizationService.js`
- `mock-server/services/secretVaultService.js`
- `mock-server/services/settingsGovernanceService.js`
- `mock-server/services/settingsGovernanceBridgeService.js`
- `mock-server/services/governanceRegistryService.js`
- `mock-server/services/governanceAuditService.js`
- `mock-server/plugins/rule-engine`
- `mock-server/plugins/search-rule-engine`
- `python_runtime/app/middleware/safety.py`

## 三、P1 协调层

P1 是运行链路的大脑，负责把用户任务、当前 Assistant、Prompt、策略、Session、模块能力组织成一次可追踪的执行。

允许做：

- 接收运行态接口请求，规范化输入并生成执行上下文。
- 解析当前激活 Assistant、模块 Prompt、策略、数据范围和数据库关系。
- 判断任务应该进入判断、检索、写作或工作台推荐。
- 维护 Session、Step、Evidence、Continue Payload，保证跨页面上下文连续。
- 调度 P2 模块能力，并把 P0 的规则结果合并到最终返回。
- 处理工作流插件、canary/stable 路由、fallback 和降级。
- 装配和解析 Application Pack，将真实业务需求转成可执行工作流、数据契约和输出合同。

不允许做：

- 不直接实现具体分析、检索、写作算法。
- 不直接持有页面展示状态。
- 不绕过 P0 安全检查调用 P2。
- 不在协调层硬编码某个行业模板的表单默认文案。
- 不把模型、数据库、外部数据源的底层细节暴露给 P3。
- 不把某个行业场景硬编码成单独页面；必须沉淀为可复用的 Pack 配置。

典型文件：

- `mock-server/routes/runtimeRoutes.js`
- `mock-server/services/taskWorkbenchService.js`
- `mock-server/services/assistantContextService.js`
- `mock-server/services/sessionService.js`
- `mock-server/services/pluginRegistryService.js`
- `mock-server/services/workflowNodeRegistry.js`
- `mock-server/services/promptService.js`
- `mock-server/services/settingsService.js`
- `mock-server/data/models/applicationPack.js`
- `mock-server/data/routes/internalApplicationPacks.js`

## 三点五、P1A 应用装配能力

P1A 用来解决“真实业务需求如何变成可运行 Agent 应用”的共性问题。它的产物是 `Application Pack`，不是页面、不是单个 Prompt，也不是某个工具调用。

允许做：

- 从需求表、访谈记录或业务说明中提炼应用名称、痛点、目标、边界、资源需求和验收条件。
- 定义业务对象，例如 `CustomerProfile`、`RiskSignal`、`RiskReport`、`ReviewDecision`。
- 定义数据契约，包括输入合同、输出合同、字段映射、证据引用和错误格式。
- 绑定工具、外部连接、内部数据源、知识规则、生成模板和人审策略。
- 定义可执行工作流节点，例如输入、证据收集、工具调用、规则评分、报告生成、人审。
- 保存 Pack 版本、发布状态和验收用例，为后续运行、回归和审计提供统一依据。

不允许做：

- 不直接成为业务执行页面；页面只能消费 Pack 的定义和运行结果。
- 不绕过 P0 自动做授信、拒绝、医疗、法律、财务等高影响最终决策。
- 不把工具返回值直接当业务结论；必须经过规则、证据和输出合同装配。
- 不把 Pack 数据和真实密钥混存；工具密钥仍由 P2.5 外部连接和后续密钥仓库托管。
- 不跳过验收用例直接发布生产 Pack。

Application Pack 的最小组成：

- `requirementSource`：真实需求来源和原始字段。
- `businessObjects`：业务对象和字段。
- `dataContracts`：输入、输出和中间数据契约。
- `toolBindings`：工具、provider、入参映射和必选性。
- `workflowSpec`：节点、依赖、入口、输出。
- `ruleBindings`：规则包、评分规则、安全规则。
- `outputContract`：固定 JSON、报告模板和禁止动作。
- `reviewPolicy`：人审策略、审批角色和触发原因。
- `acceptanceTests`：场景验收样例和预期字段。

## 四、P2 模块能力层

P2 是具体能力层，负责“真正做事”：判断、检索、写作、模型调用、数据库访问、Python Runtime、外部数据源。

允许做：

- 实现判断、检索、写作三类业务能力。
- 调用本地模型、云模型、Python Runtime、数据库、检索连接器、外部数据源。
- 生成结构化业务结果，例如判断摘要、证据列表、文稿草稿、模型路由结果。
- 接受 P1 传入的执行上下文和 P0 传入的规则约束。
- 对能力执行失败提供模块内 fallback，但 fallback 必须返回给 P1 统一装配。

不允许做：

- 不直接读取或修改前端页面状态。
- 不决定当前激活 Assistant 或治理版本。
- 不跳过 P1 自行创建用户会话链路。
- 不把安全、权限、出站控制当作普通业务逻辑随意处理。
- 不把监控日志写成业务唯一事实来源。

典型文件：

- `mock-server/flows/analyzeFlow.js`
- `mock-server/flows/searchFlow.js`
- `mock-server/flows/scriptFlow.js`
- `mock-server/services/analyzeLLMService.js`
- `mock-server/services/searchAdapterService.js`
- `mock-server/services/searchEvidenceBuilder.js`
- `mock-server/services/searchPolicyService.js`
- `mock-server/services/searchSummaryService.js`
- `mock-server/services/modelRouter.js`
- `mock-server/services/apiLLMService.js`
- `mock-server/services/localLLMService.js`
- `mock-server/services/databaseService.js`
- `mock-server/services/externalDataSourceService.js`
- `mock-server/services/pythonRuntimeAdapterService.js`
- `python_runtime/app`

## 五、P2.5 数据访问层

P2.5 是内部数据服务层，只负责把外部连接密钥和历史会话/消息从 mock-server 的本地进程状态中抽离出来，形成可独立运行、可独立持久化、只被后端内部调用的数据底座。

允许做：

- 提供内部会话、消息、外部连接密钥的 REST 接口。
- 使用 SQLite 做轻量持久化，并保留后续替换为 Postgres/MySQL 的边界。
- 为 P1 协调层提供历史会话上下文和对话消息。
- 保存外部连接的 API Key 引用和 `has_api_key` 状态，真实密钥只放在进程内环境变量或后续密钥仓库中。
- 提供初始化脚本，只初始化内部数据库结构。
- 在不可用时允许 P1 触发本地降级。

不允许做：

- 不直接执行业务判断、检索、写作。
- 不绕过 P0 安全与规则层暴露敏感数据。
- 不保存或决定当前启用模型、本地大模型、云模型连接、模型路由策略。
- 不保存或决定 Assistant 激活、Prompt 发布、Prompt 模板、工作流策略和页面跳转。
- 不直接渲染页面或处理前端状态。
- 不作为前端公开 API 使用；只能由后端内部直接调用或通过 `/internal/data/*` 本地内部路由访问。

典型文件：

- `mock-server/data/database.js`
- `mock-server/data/models/session.js`
- `mock-server/data/models/externalConnection.js`
- `mock-server/data/routes/internalData.js`
- `mock-server/data/seed.js`

运行态边界：

- `mock-server/data/*.db`、`data/*.db`、`*.sqlite*`、`*.jsonl`、`data/secretVault.json` 只属于本地运行态或密钥仓库，不进入 Git 提交。
- P2.5 只允许保存 API Key 引用、哈希或脱敏状态，不保存真实 API Key、Bearer token 或 master key。

## 六、P3 界面层

P3 是用户交互层，负责让用户看见、输入、确认、跳转和理解结果。

允许做：

- 展示页面、表单、卡片、结果、状态、错误提示和跳转按钮。
- 调用 `src/api` 中的接口方法，并把接口响应转换为页面展示状态。
- 承接 Session 恢复、页面导航状态、表单填充和轻量前端适配。
- 读取后端返回的 Assistant 默认值，并用于表单默认值和占位文案。
- 展示运行上下文、Prompt、模型、数据库关系、Evidence 和告警摘要。

不允许做：

- 不直接实现核心判断、检索、写作规则。
- 不直接读写后端数据文件、数据库或治理注册表。
- 不硬编码行业模板的业务默认值作为真实来源。
- 不绕过 `src/api` 直接拼后端请求细节。
- 不把页面状态当作 Session 或治理事实来源。

典型文件：

- `src/pages/Home`
- `src/pages/Workbench`
- `src/pages/Analyze`
- `src/pages/Search`
- `src/pages/Script`
- `src/pages/AssistantCenter`
- `src/pages/ModelCenter`
- `src/pages/DatabaseManager`
- `src/pages/Settings`
- `src/components`
- `src/api`
- `src/utils`
- `src/router`
- `src/layout`

## 七、监控层

监控层横向覆盖所有层，用来回答“系统有没有跑通、哪里降级、哪里失败、成本和延迟如何、有没有告警”。

允许做：

- 记录服务启动、请求量、成功率、失败率、耗时、token、成本、fallback、Python Runtime 健康状态。
- 输出健康检查、告警、运行看板、回归测试报告。
- 接入 OpenTelemetry、Jaeger、日志文件、本地验证脚本。
- 给 P3 提供只读看板数据，给上线检查提供验证报告。

不允许做：

- 不直接生成业务判断、检索证据或写作内容。
- 不绕过 P0/P1/P2 修改业务结果。
- 不在没有 P0 策略授权的情况下自动屏蔽、删除或重写用户数据。
- 不把测试结果文件当作生产配置。
- 不因为监控失败就静默吞掉业务错误；必须显式返回健康或告警状态。

典型文件：

- `mock-server/services/opsObservabilityService.js`
- `mock-server/tracing.js`
- `mock-server/routes/settingsRoutes.js` 中的运维与健康接口
- `scripts/local-stack.mjs`
- `scripts/settings-governance-regression.mjs`
- `scripts/workflow-release-regression.mjs`
- `scripts/workflow-platform-regression.mjs`
- `mock-server/test-results`
- `data/opsRuntimeDashboard.json`

`mock-server/test-results`、`test-results`、`test-evidence` 和 `data/opsRuntimeDashboard.json` 是本地测试证据或运行态观测产物，默认不进入 Git 提交。

## 八、常见变更应该放哪

| 需求 | 应放层级 | 优先位置 |
| --- | --- | --- |
| 新增页面、新卡片、新按钮、新表单 | P3 | `src/pages`、`src/components` |
| 新增前端接口方法 | P3 | `src/api` |
| 新增页面恢复、表单默认值适配 | P3 | `src/utils` |
| 新增 Assistant 模板、Prompt 治理、发布/激活规则 | P0/P1 | `mock-server/routes/assistantCenterRoutes.js`、`mock-server/services/*Governance*`、`data/assistantProfiles.json`、`data/promptRegistry.json` |
| 新增任务工作台推荐逻辑 | P1 | `mock-server/services/taskWorkbenchService.js` |
| 新增跨模块 Continue 链路 | P1/P3 | `mock-server/services/sessionService.js`、`src/utils/sessionResume.ts` |
| 新增历史会话、消息、外部连接 API Key 内部存储接口 | P2.5 | `mock-server/data` |
| 新增判断能力 | P2 | `mock-server/flows/analyzeFlow.js`、`mock-server/services/analyzeLLMService.js` |
| 新增检索连接器或证据整理 | P2/P0 | `mock-server/services/search*`、`mock-server/services/searchPolicyService.js` |
| 新增写作能力 | P2 | `mock-server/flows/scriptFlow.js` |
| 新增模型路由或 Python Runtime 调用 | P2 | `mock-server/services/modelRouter.js`、`mock-server/services/pythonRuntimeAdapterService.js`、`python_runtime/app` |
| 新增安全策略、脱敏、出站控制 | P0 | `mock-server/services/sanitizationService.js`、`mock-server/services/securityMiddlewareService.js` |
| 新增健康检查、运行指标、回归脚本 | 监控层 | `opsObservabilityService.js`、`scripts` |

## 九、边界检查清单

改代码前先问这几个问题：

- 这个改动是否会影响安全、权限、脱敏、出站或治理版本？如果会，必须进入 P0。
- 这个改动是否只是组织流程、选择模块、恢复 Session 或解析当前 Assistant？如果是，优先进入 P1。
- 这个改动是否是在真正执行判断、检索、写作、模型、数据库或 Python Runtime？如果是，优先进入 P2。
- 这个改动是否是在提供历史会话、消息、外部连接 API Key 的内部数据接口？如果是，进入 P2.5。
- 这个改动是否只是页面展示、表单、按钮、请求封装或前端状态？如果是，进入 P3。
- 这个改动是否只是记录、告警、健康检查或回归验证？如果是，进入监控层。
- 如果一个改动跨层，是否已经把“规则来源、流程编排、能力执行、页面展示、观测记录”拆开提交？

## 十、强制约定

- P3 不得成为业务事实来源。页面可以展示和承接默认值，但默认值来源必须来自后端治理或当前 Assistant。
- P2 不得绕过 P1 写 Session、发结果或决定页面跳转。
- P2.5 不得执行业务能力或治理决策，只提供受控数据访问。
- P2.5 不得承接本地大模型、云模型连接、当前启用模型或模型路由；这些必须留在 P2 模块插件。
- P1 不得绕过 P0 调用能力模块。
- P0 的拒绝、降级和审计结果必须结构化返回，不能只写日志。
- 监控层默认只读观察，除非 P0 明确规定某类告警会触发阻断或降级。
- 新增行业模板时，不允许在 `src/pages` 中硬编码模板文案；应进入 Assistant/Prompt 治理数据，并由 P3 读取。
- 新增外部数据源或模型能力时，必须明确 P0 的权限、脱敏和出站边界。
