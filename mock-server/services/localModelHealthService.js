import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getEmbeddedModelStatus,
  initializeEmbeddedModel,
  runEmbeddedModelJson,
} from '../plugins/model-adapters/embeddedModelAdapter.js';
import {
  EMBEDDED_MODEL_TASKS,
  normalizeEmbeddedModelTask,
} from '../plugins/model-adapters/embeddedModelSchemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const ROOT_SETTINGS_PATH = path.join(projectRoot, 'data', 'system-settings.json');
const MOCK_SETTINGS_PATH = path.join(projectRoot, 'mock-server', 'data', 'system-settings.json');

export const DEFAULT_EMBEDDED_MODEL_CONFIG = Object.freeze({
  enabled: true,
  provider: 'node-llama-cpp',
  modelName: 'qwen3-0.6b-q5_k_m',
  modelPath: 'models/Qwen3-0.6B-Q5_K_M.gguf',
  preloadOnStart: true,
  contextSize: 1024,
  temperature: 0,
  classificationMaxTokens: 24,
  jsonMaxTokens: 64,
  routeDecisionTimeoutMs: 1200,
  fieldExtractionTimeoutMs: 2500,
  structuredTransformTimeoutMs: 3000,
  defaultTimeoutMs: 3000,
  fallback: {
    onLoadFailed: 'main_workflow',
    onTimeout: 'main_workflow',
    onInvalidJson: 'main_workflow',
    onLowConfidence: 'main_workflow',
  },
});

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readJsonFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const rawText = fs.readFileSync(filePath, 'utf-8');
    return rawText.trim() ? JSON.parse(rawText) : null;
  } catch (error) {
    console.warn('[localModelHealthService] failed to read settings:', filePath, error.message);
    return null;
  }
};

const toPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeText = (value = '') => String(value || '').trim();

const readEnvBoolean = (key = '') => {
  const value = normalizeText(process.env[key]).toLowerCase();
  if (!value) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return undefined;
};

export const normalizeEmbeddedModelConfig = (input = {}) => {
  const normalizedInput = isPlainObject(input) ? input : {};
  const fallbackInput = isPlainObject(normalizedInput.fallback) ? normalizedInput.fallback : {};
  const envEnabled = readEnvBoolean('AP_EMBEDDED_MODEL_ENABLED');
  const envPreloadOnStart = readEnvBoolean('AP_EMBEDDED_MODEL_PRELOAD_ON_START');

  return {
    ...DEFAULT_EMBEDDED_MODEL_CONFIG,
    ...normalizedInput,
    enabled:
      envEnabled !== undefined
        ? envEnabled
        : normalizedInput.enabled === undefined
          ? DEFAULT_EMBEDDED_MODEL_CONFIG.enabled
          : normalizedInput.enabled === true,
    provider: normalizeText(normalizedInput.provider) || DEFAULT_EMBEDDED_MODEL_CONFIG.provider,
    modelName: normalizeText(normalizedInput.modelName) || DEFAULT_EMBEDDED_MODEL_CONFIG.modelName,
    modelPath: normalizeText(normalizedInput.modelPath) || DEFAULT_EMBEDDED_MODEL_CONFIG.modelPath,
    preloadOnStart:
      envPreloadOnStart !== undefined
        ? envPreloadOnStart
        : normalizedInput.preloadOnStart === undefined
          ? DEFAULT_EMBEDDED_MODEL_CONFIG.preloadOnStart
          : normalizedInput.preloadOnStart === true,
    contextSize: toPositiveNumber(
      normalizedInput.contextSize,
      DEFAULT_EMBEDDED_MODEL_CONFIG.contextSize,
    ),
    temperature:
      Number.isFinite(Number(normalizedInput.temperature))
        ? Number(normalizedInput.temperature)
        : DEFAULT_EMBEDDED_MODEL_CONFIG.temperature,
    classificationMaxTokens: toPositiveNumber(
      normalizedInput.classificationMaxTokens,
      DEFAULT_EMBEDDED_MODEL_CONFIG.classificationMaxTokens,
    ),
    jsonMaxTokens: toPositiveNumber(
      normalizedInput.jsonMaxTokens,
      DEFAULT_EMBEDDED_MODEL_CONFIG.jsonMaxTokens,
    ),
    routeDecisionTimeoutMs: toPositiveNumber(
      normalizedInput.routeDecisionTimeoutMs || normalizedInput.timeoutMs,
      DEFAULT_EMBEDDED_MODEL_CONFIG.routeDecisionTimeoutMs,
    ),
    fieldExtractionTimeoutMs: toPositiveNumber(
      normalizedInput.fieldExtractionTimeoutMs || normalizedInput.timeoutMs,
      DEFAULT_EMBEDDED_MODEL_CONFIG.fieldExtractionTimeoutMs,
    ),
    structuredTransformTimeoutMs: toPositiveNumber(
      normalizedInput.structuredTransformTimeoutMs || normalizedInput.timeoutMs,
      DEFAULT_EMBEDDED_MODEL_CONFIG.structuredTransformTimeoutMs,
    ),
    defaultTimeoutMs: toPositiveNumber(
      normalizedInput.defaultTimeoutMs || normalizedInput.timeoutMs,
      DEFAULT_EMBEDDED_MODEL_CONFIG.defaultTimeoutMs,
    ),
    fallback: {
      ...DEFAULT_EMBEDDED_MODEL_CONFIG.fallback,
      ...fallbackInput,
    },
  };
};

export const getEmbeddedModelConfig = () => {
  const mockSettings = readJsonFile(MOCK_SETTINGS_PATH);
  const rootSettings = readJsonFile(ROOT_SETTINGS_PATH);
  const configSeed =
    (isPlainObject(mockSettings?.embeddedModel) && mockSettings.embeddedModel) ||
    (isPlainObject(rootSettings?.embeddedModel) && rootSettings.embeddedModel) ||
    {};

  return normalizeEmbeddedModelConfig(configSeed);
};

export const getLocalModelHealthSnapshot = () => {
  const config = getEmbeddedModelConfig();
  const adapterStatus = getEmbeddedModelStatus();

  return {
    ...adapterStatus,
    enabled: config.enabled,
    provider: config.provider,
    modelName: config.modelName,
    modelPath: config.modelPath,
    preloadOnStart: config.preloadOnStart,
    contextSize: config.contextSize,
    classificationMaxTokens: config.classificationMaxTokens,
    jsonMaxTokens: config.jsonMaxTokens,
    routeDecisionTimeoutMs: config.routeDecisionTimeoutMs,
    fieldExtractionTimeoutMs: config.fieldExtractionTimeoutMs,
    structuredTransformTimeoutMs: config.structuredTransformTimeoutMs,
    defaultTimeoutMs: config.defaultTimeoutMs,
    timeoutMs: config.defaultTimeoutMs,
    fallback: config.fallback,
  };
};

export const warmupLocalModel = async (options = {}) => {
  const config = getEmbeddedModelConfig();
  const status = await initializeEmbeddedModel(config, {
    force: options.force === true,
  });

  return {
    ...getLocalModelHealthSnapshot(),
    ...status,
  };
};

export const startLocalModelPreload = () => {
  const config = getEmbeddedModelConfig();

  if (!config.enabled || !config.preloadOnStart) {
    return {
      started: false,
      reason: config.enabled ? 'preload_disabled' : 'embedded_model_disabled',
      status: getLocalModelHealthSnapshot(),
    };
  }

  warmupLocalModel().catch((error) => {
    console.warn('[embedded-model] preload failed:', error.message);
  });

  return {
    started: true,
    reason: 'preload_started',
    status: getLocalModelHealthSnapshot(),
  };
};

export const resolveTimeoutMsForTask = (task = EMBEDDED_MODEL_TASKS.ROUTE_DECISION, config = {}) => {
  const normalizedTask = normalizeEmbeddedModelTask(task);

  if (normalizedTask === EMBEDDED_MODEL_TASKS.ROUTE_DECISION) {
    return toPositiveNumber(config.routeDecisionTimeoutMs, DEFAULT_EMBEDDED_MODEL_CONFIG.routeDecisionTimeoutMs);
  }

  if (normalizedTask === EMBEDDED_MODEL_TASKS.FIELD_EXTRACTION) {
    return toPositiveNumber(
      config.fieldExtractionTimeoutMs,
      DEFAULT_EMBEDDED_MODEL_CONFIG.fieldExtractionTimeoutMs,
    );
  }

  if (normalizedTask === EMBEDDED_MODEL_TASKS.STRUCTURED_TRANSFORM) {
    return toPositiveNumber(
      config.structuredTransformTimeoutMs,
      DEFAULT_EMBEDDED_MODEL_CONFIG.structuredTransformTimeoutMs,
    );
  }

  return toPositiveNumber(config.defaultTimeoutMs, DEFAULT_EMBEDDED_MODEL_CONFIG.defaultTimeoutMs);
};

export const resolveMaxTokensForTask = (task = EMBEDDED_MODEL_TASKS.ROUTE_DECISION, config = {}) => {
  const normalizedTask = normalizeEmbeddedModelTask(task);

  if (normalizedTask === EMBEDDED_MODEL_TASKS.ROUTE_DECISION) {
    return toPositiveNumber(
      config.classificationMaxTokens,
      DEFAULT_EMBEDDED_MODEL_CONFIG.classificationMaxTokens,
    );
  }

  return toPositiveNumber(config.jsonMaxTokens, DEFAULT_EMBEDDED_MODEL_CONFIG.jsonMaxTokens);
};

export const runLocalModelPreprocess = async (input = {}, options = {}) => {
  const config = getEmbeddedModelConfig();
  const status = getEmbeddedModelStatus();
  const task = normalizeEmbeddedModelTask(options.task || input.task);

  if (status.status !== 'ready') {
    const error = new Error(`embedded model not ready: ${status.status}`);
    error.code =
      status.status === 'load_failed'
        ? 'MODEL_LOAD_FAILED'
        : status.status === 'unavailable'
          ? 'MODEL_UNAVAILABLE'
          : 'MODEL_NOT_READY';
    error.status = status;
    throw error;
  }

  return runEmbeddedModelJson(input, {
    task,
    timeoutMs: options.timeoutMs || resolveTimeoutMsForTask(task, config),
    maxTokens: options.maxTokens || resolveMaxTokensForTask(task, config),
    temperature: options.temperature ?? config.temperature,
    minConfidence: options.minConfidence ?? 0.6,
  });
};
