# Application Pack Spec

`Application Pack` 是平台从真实业务需求到可运行 Agent 应用的标准装配单元。它不是 Demo 页面，也不是单个 Prompt，而是一份可发布、可运行、可审计的应用配置包。

## 目标

- 把业务需求表中的痛点、目标、资源、计划和验收条件结构化。
- 把工具、内部数据、知识规则、工作流、输出合同和人审策略装配成一个整体。
- 让每个新场景都能按同一标准进入工程实现，而不是重复定制页面。

## 最小字段

```json
{
  "scenarioKey": "marketing-risk-control",
  "name": "营销智能风控系统",
  "description": "从客户名称出发生成可人审的风控报告。",
  "status": "draft",
  "version": "0.1.0",
  "requirementSource": {},
  "businessObjects": [],
  "dataContracts": [],
  "toolBindings": [],
  "workflowSpec": {},
  "ruleBindings": [],
  "outputContract": {},
  "reviewPolicy": {},
  "acceptanceTests": []
}
```

## 字段职责

| 字段 | 职责 |
| --- | --- |
| `requirementSource` | 保留需求来源、原始业务字段和提炼依据 |
| `businessObjects` | 定义业务对象、字段和对象关系 |
| `dataContracts` | 定义输入、输出、中间结果、错误结果的 JSON Schema |
| `toolBindings` | 绑定工具名、provider、入参映射和是否必需 |
| `workflowSpec` | 定义执行节点、依赖关系、入口节点和输出节点 |
| `ruleBindings` | 绑定规则包、评分规则、安全规则和行业约束 |
| `outputContract` | 定义最终 JSON、报告模板、证据引用和禁止动作 |
| `reviewPolicy` | 定义人审要求、审批角色和触发原因 |
| `acceptanceTests` | 定义最小验收样例，作为回归测试和上线检查依据 |

## 装配流程

1. 需求摄取：读取需求表、访谈材料或用户描述。
2. 需求结构化：提炼项目名、痛点、业务目标、当前差距、下一步计划、资源需求。
3. 业务对象建模：确定核心实体，例如客户、风险信号、报告、审批结论。
4. 数据契约定义：固定输入、输出、中间结果和错误结构。
5. 工具与数据绑定：选择企查查、内部交易库、知识库、模型等能力。
6. 工作流编排：定义节点和依赖，形成可执行链路。
7. 规则与输出合同：定义评分规则、报告模板、证据要求和禁止自动动作。
8. 人审与验收：配置审批策略和测试样例。
9. 发布：通过内部接口把 Pack 从 `draft` 改为 `published`。

## 高影响场景边界

涉及信用、授信、拒绝合作、财务、医疗、法律、雇佣等高影响场景时，Pack 必须设置：

```json
{
  "reviewPolicy": {
    "humanReviewRequired": true
  },
  "outputContract": {
    "forbiddenActions": [
      "auto_approve_credit",
      "auto_reject_customer",
      "auto_adjust_credit_limit"
    ]
  }
}
```

Agent 可以生成证据、风险提示和建议动作，但不能自动做最终决策。

## 内部接口

- `GET /internal/application-packs`
- `POST /internal/application-packs`
- `POST /internal/application-packs/compile`
- `GET /internal/application-packs/:id`
- `PUT /internal/application-packs/:id`
- `POST /internal/application-packs/:id/publish`
- `DELETE /internal/application-packs/:id`

所有接口只允许内部调用，必须经过 `/internal` 防护。
