import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nowLocalIso, toLocalIso } from '../../utils/localTime.js';
import {
  EMBEDDED_MODEL_GBNF_GRAMMARS,
  EMBEDDED_MODEL_JSON_SCHEMAS,
  buildEmbeddedModelPrompt,
  normalizeEmbeddedModelTask,
  parseEmbeddedModelJson,
  validateEmbeddedModelOutput,
} from './embeddedModelSchemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..', '..');

const DEFAULT_MODEL_PATH = 'models/Qwen3-0.6B-Q5_K_M.gguf';
const DEFAULT_TIMEOUT_MS = 800;

const state = {
  status: 'idle',
  enabled: true,
  provider: 'node-llama-cpp',
  modelName: 'qwen3-0.6b-q5_k_m',
  modelPath: DEFAULT_MODEL_PATH,
  resolvedModelPath: path.join(projectRoot, DEFAULT_MODEL_PATH),
  modelPresent: false,
  loadStartedAt: null,
  loadedAt: null,
  lastError: null,
  lastInference: null,
  llama: null,
  model: null,
  context: null,
  session: null,
  grammars: {},
  loadingPromise: null,
  inferenceQueue: Promise.resolve(),
};

const normalizeText = (value = '') => String(value || '').trim();

const toPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveModelPath = (modelPath = DEFAULT_MODEL_PATH) => {
  const normalizedPath = normalizeText(modelPath) || DEFAULT_MODEL_PATH;
  return path.isAbsolute(normalizedPath)
    ? normalizedPath
    : path.resolve(projectRoot, normalizedPath);
};

const updateStateFromConfig = (config = {}) => {
  const resolvedModelPath = resolveModelPath(config.modelPath || DEFAULT_MODEL_PATH);

  state.enabled = config.enabled !== false;
  state.provider = normalizeText(config.provider) || 'node-llama-cpp';
  state.modelName = normalizeText(config.modelName) || 'qwen3-0.6b-q5_k_m';
  state.modelPath = normalizeText(config.modelPath) || DEFAULT_MODEL_PATH;
  state.resolvedModelPath = resolvedModelPath;
  state.modelPresent = fs.existsSync(resolvedModelPath);
};

const serializeError = (error = null) => {
  if (!error) {
    return null;
  }

  return {
    code: normalizeText(error.code) || 'EMBEDDED_MODEL_ERROR',
    message: normalizeText(error.message) || 'embedded model error',
  };
};

const getDurationMs = (startedAt = 0) => Math.max(0, Date.now() - startedAt);

const markUnavailable = (code, message) => {
  const error = new Error(message);
  error.code = code;
  state.status = code === 'EMBEDDED_MODEL_DISABLED' ? 'disabled' : 'unavailable';
  state.lastError = serializeError(error);
  return state.lastError;
};

const buildStatusSnapshot = () => {
  return {
    status: state.status,
    enabled: state.enabled,
    provider: state.provider,
    modelName: state.modelName,
    modelPath: state.modelPath,
    resolvedModelPath: state.resolvedModelPath,
    modelPresent: fs.existsSync(state.resolvedModelPath),
    ready: state.status === 'ready',
    loading: state.status === 'loading',
    loadedAt: state.loadedAt,
    loadStartedAt: state.loadStartedAt,
    lastError: state.lastError,
    lastInference: state.lastInference,
  };
};

const resetRuntime = async () => {
  const session = state.session;
  const context = state.context;
  const model = state.model;
  const llama = state.llama;

  state.session = null;
  state.context = null;
  state.model = null;
  state.llama = null;
  state.grammars = {};

  try {
    session?.dispose?.({ disposeSequence: true });
  } catch {
    // best effort cleanup only
  }

  try {
    await context?.dispose?.();
  } catch {
    // best effort cleanup only
  }

  try {
    await model?.dispose?.();
  } catch {
    // best effort cleanup only
  }

  try {
    await llama?.dispose?.();
  } catch {
    // best effort cleanup only
  }
};

const loadRuntime = async ({ config = {}, gpu = 'auto', gpuLayers = 'auto' } = {}) => {
  const { getLlama, LlamaChatSession, LlamaGrammar } = await import('node-llama-cpp');
  const llama = await getLlama({
    gpu,
    build: 'never',
    skipDownload: true,
    progressLogs: false,
  });
  const model = await llama.loadModel({
    modelPath: state.resolvedModelPath,
    gpuLayers,
  });
  const context = await model.createContext({
    contextSize: toPositiveNumber(config.contextSize, 1024),
    sequences: 1,
  });
  const grammars = {};
  for (const [task, schema] of Object.entries(EMBEDDED_MODEL_JSON_SCHEMAS)) {
    const compactGrammar = EMBEDDED_MODEL_GBNF_GRAMMARS[task];
    grammars[task] = compactGrammar
      ? new LlamaGrammar(llama, {
          grammar: compactGrammar,
          trimWhitespaceSuffix: true,
        })
      : await llama.createGrammarForJsonSchema(schema);
  }
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt: '只输出符合当前任务 schema 的 JSON。',
    autoDisposeSequence: true,
  });

  return {
    llama,
    model,
    context,
    grammars,
    session,
  };
};

export const getEmbeddedModelStatus = () => {
  state.modelPresent = fs.existsSync(state.resolvedModelPath);
  return buildStatusSnapshot();
};

export const initializeEmbeddedModel = async (config = {}, options = {}) => {
  updateStateFromConfig(config);

  if (state.status === 'ready' && options.force !== true) {
    return getEmbeddedModelStatus();
  }

  if (state.loadingPromise && options.force !== true) {
    await state.loadingPromise;
    return getEmbeddedModelStatus();
  }

  if (!state.enabled) {
    markUnavailable('EMBEDDED_MODEL_DISABLED', 'embedded model is disabled');
    return getEmbeddedModelStatus();
  }

  if (state.provider !== 'node-llama-cpp') {
    markUnavailable('UNSUPPORTED_EMBEDDED_MODEL_PROVIDER', `unsupported provider: ${state.provider}`);
    return getEmbeddedModelStatus();
  }

  if (!state.modelPresent) {
    markUnavailable(
      'MODEL_FILE_MISSING',
      `embedded model file not found: ${state.resolvedModelPath}`,
    );
    return getEmbeddedModelStatus();
  }

  const loadStartedAt = Date.now();
  state.status = 'loading';
  state.loadStartedAt = toLocalIso(new Date(loadStartedAt));
  state.loadedAt = null;
  state.lastError = null;

  state.loadingPromise = (async () => {
    try {
      await resetRuntime();

      let runtime = null;
      try {
        runtime = await loadRuntime({
          config,
          gpu: config.gpu ?? 'auto',
          gpuLayers: config.gpuLayers ?? 'auto',
        });
      } catch (primaryError) {
        await resetRuntime();
        if (config.allowCpuFallback === false || config.gpu === false) {
          throw primaryError;
        }

        runtime = await loadRuntime({
          config,
          gpu: false,
          gpuLayers: 0,
        });
      }

      state.llama = runtime.llama;
      state.model = runtime.model;
      state.context = runtime.context;
      state.grammars = runtime.grammars;
      state.session = runtime.session;
      state.status = 'ready';
      state.loadedAt = nowLocalIso();
      state.lastError = null;

      return getEmbeddedModelStatus();
    } catch (error) {
      state.status = 'load_failed';
      state.lastError = serializeError(error);
      await resetRuntime();
      return getEmbeddedModelStatus();
    } finally {
      state.loadingPromise = null;
      state.lastInference = {
        ...(state.lastInference || {}),
        lastLoadDurationMs: getDurationMs(loadStartedAt),
      };
    }
  })();

  await state.loadingPromise;
  return getEmbeddedModelStatus();
};

const assertReady = () => {
  if (state.status !== 'ready' || !state.session || !state.grammars) {
    const error = new Error(`embedded model is not ready: ${state.status}`);
    error.code =
      state.status === 'load_failed'
        ? 'MODEL_LOAD_FAILED'
        : state.status === 'unavailable'
          ? 'MODEL_UNAVAILABLE'
          : 'MODEL_NOT_READY';
    throw error;
  }
};

const runExclusive = async (task) => {
  const previous = state.inferenceQueue.catch(() => null);
  const next = previous.then(task, task);
  state.inferenceQueue = next.catch(() => null);
  return next;
};

export const runEmbeddedModelJson = async (input = {}, options = {}) => {
  assertReady();

  return runExclusive(async () => {
    assertReady();

    const startedAt = Date.now();
    const task = normalizeEmbeddedModelTask(options.task || input.task);
    const grammar = state.grammars[task];

    if (!grammar) {
      const error = new Error(`embedded model grammar is not ready: ${task}`);
      error.code = 'MODEL_NOT_READY';
      throw error;
    }

    const timeoutMs = Math.max(1, toPositiveNumber(options.timeoutMs, DEFAULT_TIMEOUT_MS));
    const maxTokens = Math.max(16, toPositiveNumber(options.maxTokens, 128));
    const temperature = Number.isFinite(Number(options.temperature))
      ? Number(options.temperature)
      : 0;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error(`embedded model timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      state.session.resetChatHistory();
      const rawText = await state.session.prompt(buildEmbeddedModelPrompt(input, { task }), {
        grammar,
        maxTokens,
        temperature,
        signal: controller.signal,
        stopOnAbortSignal: true,
        trimWhitespaceSuffix: true,
      });

      if (timedOut) {
        const error = new Error(`embedded model timed out after ${timeoutMs}ms`);
        error.code = 'MODEL_TIMEOUT';
        throw error;
      }

      const parsed = parseEmbeddedModelJson(rawText);
      const validation = validateEmbeddedModelOutput(parsed, {
        task,
        minConfidence: options.minConfidence,
      });

      state.lastInference = {
        success: validation.ok,
        task,
        durationMs: getDurationMs(startedAt),
        reason: validation.reason,
        at: nowLocalIso(),
      };

      if (!validation.ok) {
        const error = new Error(`embedded model output rejected: ${validation.reason}`);
        error.code = validation.reason === 'low_confidence' ? 'LOW_CONFIDENCE' : 'INVALID_JSON';
        error.embeddedModel = validation.data;
        throw error;
      }

      return {
        rawText,
        data: validation.data,
        durationMs: getDurationMs(startedAt),
      };
    } catch (error) {
      const normalizedCode = timedOut ? 'MODEL_TIMEOUT' : normalizeText(error.code) || 'MODEL_INFERENCE_FAILED';
      state.lastInference = {
        success: false,
        task,
        durationMs: getDurationMs(startedAt),
        reason: normalizedCode,
        at: nowLocalIso(),
      };
      error.code = normalizedCode;
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  });
};

export const generate = async (prompt = '', options = {}) => {
  assertReady();

  return runExclusive(async () => {
    assertReady();

    const startedAt = Date.now();
    const timeoutMs = Math.max(1, toPositiveNumber(options.timeoutMs, DEFAULT_TIMEOUT_MS));
    const maxTokens = Math.max(1, toPositiveNumber(options.maxTokens, 64));
    const temperature = Number.isFinite(Number(options.temperature))
      ? Number(options.temperature)
      : 0;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error(`embedded model timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      state.session.resetChatHistory();
      const responseText = await state.session.prompt(normalizeText(prompt), {
        maxTokens,
        temperature,
        signal: controller.signal,
        stopOnAbortSignal: true,
        trimWhitespaceSuffix: true,
      });

      if (timedOut) {
        const error = new Error(`embedded model timed out after ${timeoutMs}ms`);
        error.code = 'MODEL_TIMEOUT';
        throw error;
      }

      state.lastInference = {
        success: true,
        durationMs: getDurationMs(startedAt),
        reason: 'text_generation_success',
        at: nowLocalIso(),
      };

      return normalizeText(responseText);
    } catch (error) {
      const normalizedCode = timedOut ? 'MODEL_TIMEOUT' : normalizeText(error.code) || 'MODEL_GENERATE_FAILED';
      state.lastInference = {
        success: false,
        durationMs: getDurationMs(startedAt),
        reason: normalizedCode,
        at: nowLocalIso(),
      };
      error.code = normalizedCode;
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  });
};

export const extractJSON = (rawText = '') => {
  return parseEmbeddedModelJson(rawText);
};

export const disposeEmbeddedModel = async () => {
  await resetRuntime();
  state.status = 'idle';
  state.loadedAt = null;
  state.loadStartedAt = null;
  state.lastError = null;
};
