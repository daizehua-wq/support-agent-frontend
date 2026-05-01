# v0.1.0-rc.1 — Release Candidate

**Commit**: `480ace1f88fa6b51dd4888d0917818940d005c1a`
**Date**: 2026-04-29
**Tag**: `v0.1.0-rc.1`

---

## 变更摘要

### 前端替换工程 (P0)
- feat(api): 主链 Task API 闭环 (output/archive/session compat)
- feat(api): RBAC 权限摘要、Settings 聚合 API 接入
- feat(ui): workbench 实时轮询、Output workspace 版本管理
- feat(ui): 历史任务表组件、旧路由升级提示

### P3 清理与类型安全
- chore(cleanup): 移除无用 exports、老旧 standalone 页面
- chore(cleanup): 移除非必需 settings 和 common 组件
- chore(types): 全局 `any` → `unknown` 替换，新增 `unknownRecord` 类型安全工具库

### QA & 代码门禁
- fix(qa): 第一轮 + 第二轮阻塞 UI 缺陷全部修复
- fix(gate): 预发布验证阻塞项全部清除
- chore(api): mock fallback 策略标准化

### UI / DX
- style(ui): responsive design 系统收尾

---

## 验收矩阵

| 项目 | 结论 |
|---|---|
| 前端替换工程 | ✅ 完成 |
| P0 主链 API 闭环 | ✅ 完成 |
| P1 稳定性/兼容性/权限 | ✅ 完成 |
| P2 Settings 聚合 API | ✅ 完成 |
| QA 功能验收 | ✅ 通过 |
| 预发布代码门禁 | ✅ 通过 |
| P3 无用代码清理 | ✅ 完成 |
| 7 套 Smoke | ✅ 259/259 |
| 旧路由兼容 | ✅ 保留 |
| mock fallback | ✅ 保留 |
| LegacyRouteUpgradeNotice | ✅ 保留 |
| Session Compat | ✅ 18/18 |
| 敏感信息 | ✅ 无泄露 |

---

## 证据路径

| 类型 | 路径 |
|---|---|
| 回归测试证据 | `test-evidence/2026-04-24-regression/` |
| 可用性测试证据 | `test-evidence/2026-04-25-usability/` |
| 手动测试日志 | `test-results/manual-test-log.jsonl` |
| DB API 回归报告 | `mock-server/test-results/database-api-integration-*.json` |
| DB Enterprise 回归报告 | `mock-server/test-results/database-enterprise-regression-*.json` |

---

## 待办（进入 CI/预发布后）

- [ ] `npm run test:db:api` — 需注入 `DB_TYPE`, `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` 等
- [ ] `npm run test:db:enterprise` — 需基于 `config/database-enterprise.env.example` 创建 `config/database-enterprise.env` 并填入 `MYSQL_*` / `POSTGRES_*`

---

## 提交历史（自首笔 API 接入起）

```
480ace1 chore(types): replace any with unknown, add type-safe record utilities
9a0037d chore(cleanup): finalize unused exports and responsive polish
27c19b7 chore(cleanup): remove legacy standalone pages
5e21aa2 chore(cleanup): remove unused settings and common components
5df1e8d fix(qa): resolve remaining second-round defects
074bcf5 fix(qa): resolve first-round blocking UI defects
595d2d2 fix(gate): clear release validation blockers
e3544ad feat(api): connect settings center aggregate APIs
6dd4424 feat(api): add minimal RBAC permission summary
d26f273 feat(api): add legacy session task archive compatibility
846a66f chore(api): standardize task mock fallback policy
... (共 20 commits)
```
