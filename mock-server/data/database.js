import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = process.env.AP_SQLITE_DB_PATH
  ? path.resolve(process.env.AP_SQLITE_DB_PATH)
  : path.join(__dirname, 'sqlite.db');

let db = null;

const ensureColumn = (database, tableName, columnName, columnDefinition) => {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
};

const initializeSchema = (database) => {
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      app_id TEXT,
      title TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      app_id TEXT,
      role TEXT CHECK(role IN ('user','assistant','system')),
      content TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS external_connections (
      id TEXT PRIMARY KEY,
      provider TEXT UNIQUE,
      api_key_ref TEXT,
      has_api_key INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      health_status TEXT DEFAULT 'unknown',
      last_checked_at DATETIME,
      health_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      api_key_hash TEXT NOT NULL,
      api_key_prefix TEXT,
      status TEXT DEFAULT 'active',
      rate_limit_per_min INTEGER DEFAULT 60,
      max_tokens_per_day INTEGER DEFAULT 100000,
      idempotency_key TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT,
      date TEXT,
      api_calls INTEGER DEFAULT 0,
      tokens_used INTEGER DEFAULT 0,
      UNIQUE(app_id, date),
      FOREIGN KEY (app_id) REFERENCES apps(id)
    );

    CREATE TABLE IF NOT EXISTS knowledge_rules (
      id TEXT PRIMARY KEY,
      app_id TEXT,
      domain_type TEXT NOT NULL,
      topic TEXT,
      workflow_stage TEXT,
      keywords TEXT,
      scenario TEXT,
      suggestions TEXT,
      risk_notes TEXT,
      created_by TEXT DEFAULT 'human',
      confidence REAL DEFAULT 1.0,
      last_hit_at DATETIME,
      hit_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS knowledge_resources (
      id TEXT PRIMARY KEY,
      app_id TEXT,
      domain_type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      applicable_scenarios TEXT,
      is_shareable INTEGER DEFAULT 0,
      content_type TEXT,
      link TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS generation_templates (
      id TEXT PRIMARY KEY,
      app_id TEXT,
      scene TEXT NOT NULL,
      output_target TEXT,
      template_content TEXT NOT NULL,
      variables TEXT,
      created_by TEXT DEFAULT 'human',
      usage_count INTEGER DEFAULT 0,
      avg_rating REAL DEFAULT 0.0,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guidance_notes (
      id TEXT PRIMARY KEY,
      scene TEXT NOT NULL,
      note_type TEXT,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT NOT NULL UNIQUE,
      system_prompt TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS channel_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT,
      channel_type TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      config_json TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_by TEXT DEFAULT 'human',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS application_packs (
      id TEXT PRIMARY KEY,
      scenario_key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'draft',
      version TEXT DEFAULT '0.1.0',
      requirement_source TEXT,
      business_objects TEXT,
      data_contracts TEXT,
      tool_bindings TEXT,
      workflow_spec TEXT,
      rule_bindings TEXT,
      output_contract TEXT,
      review_policy TEXT,
      acceptance_tests TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      published_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS application_pack_runs (
      id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL,
      app_id TEXT,
      status TEXT DEFAULT 'created',
      input_payload TEXT,
      output_payload TEXT,
      audit_summary TEXT,
      human_review_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pack_id) REFERENCES application_packs(id)
    );

    CREATE TABLE IF NOT EXISTS model_call_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT,
      model TEXT NOT NULL,
      success INTEGER NOT NULL DEFAULT 1,
      latency_ms INTEGER,
      tokens_used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS knowledge_gaps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      app_id TEXT,
      user_query TEXT NOT NULL,
      matched_rule_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cached_company_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL,
      credit_code TEXT,
      basic_info_json TEXT,
      risk_info_json TEXT,
      operation_info_json TEXT,
      raw_response_json TEXT,
      data_source TEXT DEFAULT 'qichacha',
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      basic_expires_at DATETIME,
      risk_expires_at DATETIME,
      operation_expires_at DATETIME,
      UNIQUE(credit_code)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session_id_created_at
      ON messages(session_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id_updated_at
      ON sessions(user_id, updated_at);

    CREATE INDEX IF NOT EXISTS idx_apps_api_key_hash
      ON apps(api_key_hash);

    CREATE INDEX IF NOT EXISTS idx_app_usage_app_id_date
      ON app_usage(app_id, date);

    CREATE INDEX IF NOT EXISTS idx_knowledge_rules_domain_topic
      ON knowledge_rules(domain_type, topic);

    CREATE INDEX IF NOT EXISTS idx_knowledge_rules_workflow_stage
      ON knowledge_rules(workflow_stage);

    CREATE INDEX IF NOT EXISTS idx_knowledge_resources_domain_type
      ON knowledge_resources(domain_type);

    CREATE INDEX IF NOT EXISTS idx_generation_templates_scene
      ON generation_templates(scene);

    CREATE INDEX IF NOT EXISTS idx_guidance_notes_scene
      ON guidance_notes(scene);

    CREATE INDEX IF NOT EXISTS idx_app_prompts_app_id
      ON app_prompts(app_id);

    CREATE INDEX IF NOT EXISTS idx_channel_configs_app_status
      ON channel_configs(app_id, status);

    CREATE INDEX IF NOT EXISTS idx_channel_configs_type_status
      ON channel_configs(channel_type, status);

    CREATE INDEX IF NOT EXISTS idx_application_packs_status
      ON application_packs(status);

    CREATE INDEX IF NOT EXISTS idx_application_pack_runs_pack_id_created_at
      ON application_pack_runs(pack_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_model_call_logs_model_created_at
      ON model_call_logs(model, created_at);

    CREATE INDEX IF NOT EXISTS idx_model_call_logs_app_id_created_at
      ON model_call_logs(app_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_created_at
      ON knowledge_gaps(created_at);

    CREATE INDEX IF NOT EXISTS idx_cached_company_name
      ON cached_company_data(company_name);

    CREATE INDEX IF NOT EXISTS idx_cached_credit_code
      ON cached_company_data(credit_code);
  `);

  ensureColumn(database, 'sessions', 'app_id', 'TEXT');
  ensureColumn(database, 'messages', 'app_id', 'TEXT');
  ensureColumn(database, 'external_connections', 'health_status', "TEXT DEFAULT 'unknown'");
  ensureColumn(database, 'external_connections', 'last_checked_at', 'DATETIME');
  ensureColumn(database, 'external_connections', 'health_message', 'TEXT');
  ensureColumn(database, 'apps', 'idempotency_key', 'TEXT');
  ensureColumn(database, 'knowledge_rules', 'app_id', 'TEXT');
  ensureColumn(database, 'knowledge_rules', 'created_by', "TEXT DEFAULT 'human'");
  ensureColumn(database, 'knowledge_rules', 'confidence', 'REAL DEFAULT 1.0');
  ensureColumn(database, 'knowledge_rules', 'last_hit_at', 'DATETIME');
  ensureColumn(database, 'knowledge_rules', 'hit_count', 'INTEGER DEFAULT 0');
  ensureColumn(database, 'knowledge_rules', 'status', "TEXT DEFAULT 'active'");
  ensureColumn(database, 'knowledge_resources', 'app_id', 'TEXT');
  ensureColumn(database, 'generation_templates', 'app_id', 'TEXT');
  ensureColumn(database, 'generation_templates', 'created_by', "TEXT DEFAULT 'human'");
  ensureColumn(database, 'generation_templates', 'usage_count', 'INTEGER DEFAULT 0');
  ensureColumn(database, 'generation_templates', 'avg_rating', 'REAL DEFAULT 0.0');
  ensureColumn(database, 'generation_templates', 'status', "TEXT DEFAULT 'active'");

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_app_id_updated_at
      ON sessions(app_id, updated_at);

    CREATE INDEX IF NOT EXISTS idx_messages_app_id_created_at
      ON messages(app_id, created_at);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_apps_idempotency_key
      ON apps(idempotency_key)
      WHERE idempotency_key IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_knowledge_rules_status_last_hit_at
      ON knowledge_rules(status, last_hit_at);

    CREATE INDEX IF NOT EXISTS idx_knowledge_rules_app_status
      ON knowledge_rules(app_id, status);

    CREATE INDEX IF NOT EXISTS idx_knowledge_resources_app_domain
      ON knowledge_resources(app_id, domain_type);

    CREATE INDEX IF NOT EXISTS idx_generation_templates_status_usage
      ON generation_templates(status, usage_count);

    CREATE INDEX IF NOT EXISTS idx_generation_templates_app_scene_status
      ON generation_templates(app_id, scene, status);
  `);
};

export const getDb = () => {
  if (!db) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    initializeSchema(db);
  }

  return db;
};

export const getDbPath = () => dbPath;

getDb();
