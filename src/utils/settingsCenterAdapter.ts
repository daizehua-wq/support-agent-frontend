import { message } from 'antd';
import * as settingsApi from '../api/settingsCenter';
import { getMockSettingsCenter } from '../utils/mockSettingsCenter';
import { MOCK_RULES, MOCK_KNOWLEDGE, MOCK_STRATEGIES, MOCK_RUNTIME, MOCK_GOVERNANCE } from '../utils/mockSettingsModules';
import { asUnknownRecord, type UnknownRecord } from './unknownRecord';

const FORCE_MOCK = import.meta.env.VITE_USE_SETTINGS_MOCK === 'true';
const FALLBACK_WARNING = '已切换至离线设置模式，当前展示的是本地示例数据。';

function showFallbackWarning() { message.warning(FALLBACK_WARNING, 3); }

type ApiError = {
  response?: { status?: number };
};

function isClientError(error: unknown): boolean {
  const e = error as ApiError;
  const status = e?.response?.status;
  if (status && status >= 400 && status < 500 && status !== 429) return true;
  return false;
}

function isNetworkOrServerError(error: unknown): boolean {
  const e = error as ApiError;
  if (!e?.response) return true;
  return (e.response?.status ?? 0) >= 500;
}

function unwrap(raw: unknown): UnknownRecord {
  const root = asUnknownRecord(raw);
  const data = asUnknownRecord(root.data);
  const nested = asUnknownRecord(data.data);
  if (Object.keys(nested).length) return nested;
  if (Object.keys(data).length) return data;
  return root;
}

// ===== Overview =====

export async function getOverview(): Promise<UnknownRecord> {
  if (FORCE_MOCK) return getMockSettingsCenter() as unknown as UnknownRecord;
  try {
    const raw = await settingsApi.getSettingsCenterOverview();
    return unwrap(raw);
  } catch (e: unknown) {
    if (isClientError(e)) throw e;
    if (isNetworkOrServerError(e)) { showFallbackWarning(); return getMockSettingsCenter() as unknown as UnknownRecord; }
    throw e;
  }
}

// ===== Models =====

export async function getModels(): Promise<UnknownRecord> {
  if (FORCE_MOCK) return getFallbackModels();
  try {
    const raw = await settingsApi.getSettingsCenterModels();
    return unwrap(raw);
  } catch (e: unknown) {
    if (isClientError(e)) throw e;
    if (isNetworkOrServerError(e)) { showFallbackWarning(); return getFallbackModels(); }
    throw e;
  }
}

function getFallbackModels() {
  return {
    plannerModel: { status: 'ready', source: 'embedded_model', modelName: 'gpt-4o-mini', fallbackStrategy: '默认任务模板' },
    defaultModel: { id: 'default', name: 'gpt-4o-mini', provider: 'local', status: 'healthy' },
    models: [],
    moduleBindings: {},
    fallbackRules: { modelFallback: 'blocked', plannerFallback: '默认任务模板' },
    runtimeStatus: { python: 'healthy', embeddedModel: 'loading' },
  };
}

// ===== Assistants =====

export async function getAssistants(): Promise<UnknownRecord> {
  if (FORCE_MOCK) return { assistants: [], prompts: [], currentPublished: null, moduleBindings: {}, strategyConfigs: [], governanceEvents: [] };
  try {
    const raw = await settingsApi.getSettingsCenterAssistants();
    return unwrap(raw);
  } catch (e: unknown) {
    if (isClientError(e)) throw e;
    if (isNetworkOrServerError(e)) { showFallbackWarning(); return { assistants: [], prompts: [], currentPublished: null, moduleBindings: {}, strategyConfigs: [], governanceEvents: [] }; }
    throw e;
  }
}

// ===== Data Sources =====

export async function getDataSources(): Promise<UnknownRecord> {
  if (FORCE_MOCK) return { overview: { total: 0, healthy: 0, degraded: 0 }, internalSources: [], externalSources: [], referencePacks: [], lightBindings: [], providerStates: [], credentialReferences: [] };
  try {
    const raw = await settingsApi.getSettingsCenterDataSources();
    return unwrap(raw);
  } catch (e: unknown) {
    if (isClientError(e)) throw e;
    if (isNetworkOrServerError(e)) { showFallbackWarning(); return { overview: { total: 0, healthy: 0, degraded: 0 }, internalSources: [], externalSources: [], referencePacks: [], lightBindings: [], providerStates: [], credentialReferences: [] }; }
    throw e;
  }
}

// ===== Apps =====

export async function getApps(): Promise<UnknownRecord> {
  if (FORCE_MOCK) return { apps: [], apiKeys: [], channels: [], applicationPacks: [], platformManager: { requiredPermission: 'canAccessPlatformManager' }, adminUi: { requiredPermission: 'canAccessAdminUi' }, rulesKnowledgeSummary: {} };
  try {
    const raw = await settingsApi.getSettingsCenterApps();
    return unwrap(raw);
  } catch (e: unknown) {
    if (isClientError(e)) throw e;
    if (isNetworkOrServerError(e)) { showFallbackWarning(); return { apps: [], apiKeys: [], channels: [], applicationPacks: [], platformManager: { requiredPermission: 'canAccessPlatformManager' }, adminUi: { requiredPermission: 'canAccessAdminUi' }, rulesKnowledgeSummary: {} }; }
    throw e;
  }
}

// ===== Rules =====

export async function getRules(): Promise<UnknownRecord> {
  if (FORCE_MOCK) return { rules: MOCK_RULES, knowledgeSources: MOCK_KNOWLEDGE, applicationPackBindings: [], strategyStates: MOCK_STRATEGIES, governanceEvents: [] };
  try {
    const raw = await settingsApi.getSettingsCenterRules();
    return unwrap(raw);
  } catch (e: unknown) {
    if (isClientError(e)) throw e;
    if (isNetworkOrServerError(e)) { showFallbackWarning(); return { rules: MOCK_RULES, knowledgeSources: MOCK_KNOWLEDGE, applicationPackBindings: [], strategyStates: MOCK_STRATEGIES, governanceEvents: [] }; }
    throw e;
  }
}

// ===== Runtime =====

export async function getRuntime(): Promise<UnknownRecord> {
  if (FORCE_MOCK) return MOCK_RUNTIME as unknown as UnknownRecord;
  try {
    const raw = await settingsApi.getSettingsCenterRuntime();
    return unwrap(raw);
  } catch (e: unknown) {
    if (isClientError(e)) throw e;
    if (isNetworkOrServerError(e)) { showFallbackWarning(); return MOCK_RUNTIME as unknown as UnknownRecord; }
    throw e;
  }
}

// ===== Governance =====

export async function getGovernance(): Promise<UnknownRecord> {
  if (FORCE_MOCK) return { events: MOCK_GOVERNANCE, filters: [], rollbackState: { available: false, reason: '回滚能力将在后续版本开放' } };
  try {
    const raw = await settingsApi.getSettingsCenterGovernance();
    return unwrap(raw);
  } catch (e: unknown) {
    if (isClientError(e)) throw e;
    if (isNetworkOrServerError(e)) { showFallbackWarning(); return { events: MOCK_GOVERNANCE, filters: [], rollbackState: { available: false, reason: '回滚能力将在后续版本开放' } }; }
    throw e;
  }
}
