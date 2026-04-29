# 数据库回归环境变量说明

## test:db:api — 单实例 API 集成回归

通过 CLI 参数或环境变量提供目标数据库连接信息，执行完整的数据库 CRUD API 回归链路。

### 必需参数

| CLI 参数 | 环境变量 | 说明 |
|---|---|---|
| `--db-type=mysql\|postgres` | `DB_TYPE` | 数据库类型 |
| `--db-host=<host>` | `DB_HOST` | 数据库主机地址 |
| `--db-port=<port>` | `DB_PORT` | 数据库端口（MySQL 默认 3306，Postgres 默认 5432） |
| `--db-username=<user>` | `DB_USERNAME` | 数据库用户名 |

### 可选参数

| CLI 参数 | 环境变量 | 说明 |
|---|---|---|
| `--db-password=<pwd>` | `DB_PASSWORD` | 数据库密码 |
| `--db-admin-username=<user>` | `DB_ADMIN_USERNAME` | admin 用户名 |
| `--db-admin-password=<pwd>` | `DB_ADMIN_PASSWORD` | admin 密码 |
| `--db-name=<name>` | `DB_NAME` | 数据库名称（默认自动生成） |
| `--api-base-url=<url>` | `API_BASE_URL` | API 基地址（默认 http://127.0.0.1:3001） |

### 示例

```bash
npm run test:db:api -- \
  --db-type=mysql \
  --db-host=127.0.0.1 \
  --db-port=3306 \
  --db-username=root
```

### 环境未配置时的行为

缺少必需参数时，脚本会输出清晰的 preflight 报告并退出，不执行断言步骤。

---

## test:db:enterprise — 企业 MySQL/PostgreSQL 多目标回归

同时回归 MySQL 和 PostgreSQL 两个目标。参数通过 `config/database-enterprise.env` 文件或进程环境变量提供。

### 配置文件

基于 `config/database-enterprise.env.example` 创建 `config/database-enterprise.env`：

```bash
cp config/database-enterprise.env.example config/database-enterprise.env
```

### 环境变量一览

#### MySQL 目标

| 环境变量 | 说明 | 默认值 |
|---|---|---|
| `MYSQL_HOST` | 主机地址 | 127.0.0.1 |
| `MYSQL_PORT` | 端口 | 3306 |
| `MYSQL_USERNAME` | 用户名 | root |
| `MYSQL_PASSWORD` | 密码 | *(空)* |
| `MYSQL_NAME` | 数据库名称 | 自动生成 |
| `MYSQL_ADMIN_USERNAME` | admin 用户名 | *(空)* |
| `MYSQL_ADMIN_PASSWORD` | admin 密码 | *(空)* |

#### PostgreSQL 目标

| 环境变量 | 说明 | 默认值 |
|---|---|---|
| `POSTGRES_HOST` | 主机地址 | 127.0.0.1 |
| `POSTGRES_PORT` | 端口 | 5432 |
| `POSTGRES_USERNAME` | 用户名 | postgres |
| `POSTGRES_PASSWORD` | 密码 | *(空)* |
| `POSTGRES_NAME` | 数据库名称 | 自动生成 |
| `POSTGRES_ADMIN_USERNAME` | admin 用户名 | *(空)* |
| `POSTGRES_ADMIN_PASSWORD` | admin 密码 | *(空)* |

### 开关

| 环境变量 | 说明 |
|---|---|
| `DB_ENTERPRISE_REQUIRE_ALL` | 要求所有目标通过才算成功（默认 false） |
| `DB_ENTERPRISE_SKIP_MYSQL` | 跳过 MySQL 回归 |
| `DB_ENTERPRISE_SKIP_POSTGRES` | 跳过 PostgreSQL 回归 |

### 环境未配置时的行为

未配置任何目标时，两个目标状态均为 warning，脚本输出 preflight 报告并退出。
如果至少一个目标配置了参数但预检失败，脚本也会退出并给出提示。

### 安全说明

- **不提交真实凭据**：密码字段留空或使用占位符。
- `config/database.env` 和 `config/database-enterprise.env` 已在 `.gitignore` 中排除。
- 仅提交 `.example` 模板文件。
