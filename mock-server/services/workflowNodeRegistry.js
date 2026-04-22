import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { runAnalyzeCustomerFlow } from '../flows/analyzeFlow.js';
import { runSearchDocumentsFlow } from '../flows/searchFlow.js';
import { runGenerateScriptFlow } from '../flows/scriptFlow.js';
import {
  isPythonRuntimeEnabled,
  runPythonAnalyzeNode,
  runPythonSearchNode,
  runPythonScriptNode,
  handlePythonRuntimeFallback,
} from './pythonRuntimeAdapterService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeString = (value = '') => String(value || '').trim();

const withTimeout = async (promise, timeoutMs = 90000, label = 'workflow node') => {
  const effectiveTimeout = Number.isFinite(Number(timeoutMs))
    ? Number(timeoutMs)
    : 90000;

  if (effectiveTimeout <= 0) {
    return promise;
  }

  let timer = null;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${effectiveTimeout}ms`));
        }, effectiveTimeout);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const CORE_NODE_HANDLER_REGISTRY = {
  'analyze.customer.v1': async ({ input = {}, context = {} } = {}) => {
    if (isPythonRuntimeEnabled(context.settings || {})) {
      try {
        return await runPythonAnalyzeNode({ input, context });
      } catch (error) {
        handlePythonRuntimeFallback({
          error,
          nodeType: 'analyze.customer.v1',
          runtimeSettings: context.settings || {},
        });
      }
    }

    return runAnalyzeCustomerFlow(
      {
        ...(isPlainObject(input) ? input : {}),
      },
      {
        settings: context.settings,
      },
    );
  },
  'search.documents.v1': async ({ input = {}, context = {} } = {}) => {
    if (isPythonRuntimeEnabled(context.settings || {})) {
      try {
        return await runPythonSearchNode({ input, context });
      } catch (error) {
        handlePythonRuntimeFallback({
          error,
          nodeType: 'search.documents.v1',
          runtimeSettings: context.settings || {},
        });
      }
    }

    return runSearchDocumentsFlow({
      ...(isPlainObject(input) ? input : {}),
      settings: context.settings,
    });
  },
  'output.script.v1': async ({ input = {}, context = {} } = {}) => {
    if (isPythonRuntimeEnabled(context.settings || {})) {
      try {
        return await runPythonScriptNode({ input, context });
      } catch (error) {
        handlePythonRuntimeFallback({
          error,
          nodeType: 'output.script.v1',
          runtimeSettings: context.settings || {},
        });
      }
    }

    return runGenerateScriptFlow(isPlainObject(input) ? input : {}, {
      settings: context.settings,
    });
  },
};

const customNodeHandlerCache = new Map();

const resolveCustomHandlerPath = (modulePath = '') => {
  const normalizedModulePath = normalizeString(modulePath);

  if (!normalizedModulePath) {
    throw new Error('[workflow-node] Custom node handler.modulePath must be a non-empty string');
  }

  const absoluteModulePath = path.resolve(projectRoot, normalizedModulePath);
  const relativeModulePath = path.relative(projectRoot, absoluteModulePath);

  if (
    !relativeModulePath ||
    relativeModulePath.startsWith('..') ||
    path.isAbsolute(relativeModulePath)
  ) {
    throw new Error(
      `[workflow-node] Custom node handler path "${normalizedModulePath}" must stay inside project root`,
    );
  }

  if (!fs.existsSync(absoluteModulePath)) {
    throw new Error(
      `[workflow-node] Custom node handler module not found: ${normalizedModulePath}`,
    );
  }

  return {
    absoluteModulePath,
    relativeModulePath: relativeModulePath.split(path.sep).join('/'),
  };
};

const loadCustomNodeHandler = async ({ modulePath = '', exportName = 'default', nodeType = '' } = {}) => {
  const normalizedExportName = normalizeString(exportName) || 'default';
  const { absoluteModulePath, relativeModulePath } = resolveCustomHandlerPath(modulePath);
  const cacheKey = `${relativeModulePath}#${normalizedExportName}`;

  if (customNodeHandlerCache.has(cacheKey)) {
    return customNodeHandlerCache.get(cacheKey);
  }

  let importedModule = null;

  try {
    importedModule = await import(pathToFileURL(absoluteModulePath).href);
  } catch (error) {
    throw new Error(
      `[workflow-node] Failed to load custom handler ${relativeModulePath}: ${error.message}`,
    );
  }

  let resolvedHandler =
    normalizedExportName === 'default'
      ? importedModule.default
      : importedModule[normalizedExportName];

  if (typeof resolvedHandler !== 'function' && typeof importedModule.default === 'function') {
    resolvedHandler = importedModule.default;
  }

  if (typeof resolvedHandler !== 'function') {
    throw new Error(
      `[workflow-node] Custom handler ${relativeModulePath} export "${normalizedExportName}" is not a function for node type "${nodeType || 'unknown'}"`,
    );
  }

  customNodeHandlerCache.set(cacheKey, resolvedHandler);

  return resolvedHandler;
};

export const listSupportedWorkflowNodeTypes = () => Object.keys(CORE_NODE_HANDLER_REGISTRY);

export const listLoadedCustomWorkflowNodeHandlers = () => [...customNodeHandlerCache.keys()];

export const resolveWorkflowNodeHandler = async (nodeSpec = {}) => {
  const normalizedNodeSpec = isPlainObject(nodeSpec) ? nodeSpec : { type: nodeSpec };
  const nodeType = normalizeString(normalizedNodeSpec.type);
  const coreHandler = CORE_NODE_HANDLER_REGISTRY[nodeType] || null;

  if (typeof coreHandler === 'function') {
    return coreHandler;
  }

  const handlerSpec = isPlainObject(normalizedNodeSpec.handler)
    ? normalizedNodeSpec.handler
    : {};

  if (!normalizeString(handlerSpec.modulePath)) {
    return null;
  }

  return loadCustomNodeHandler({
    modulePath: handlerSpec.modulePath,
    exportName: handlerSpec.exportName,
    nodeType,
  });
};

export const executeWorkflowNode = async ({
  nodeSpec = {},
  inputPayload = {},
  context = {},
} = {}) => {
  const handler = await resolveWorkflowNodeHandler(nodeSpec);

  if (typeof handler !== 'function') {
    throw new Error(`[workflow-node] Unsupported node type: ${nodeSpec.type || 'unknown'}`);
  }

  const nodeInput = {
    ...(isPlainObject(inputPayload) ? inputPayload : {}),
    ...(isPlainObject(nodeSpec.inputOverrides) ? nodeSpec.inputOverrides : {}),
  };
  const startedAt = Date.now();
  const output = await withTimeout(
    handler({
      input: nodeInput,
      context,
      nodeSpec,
    }),
    nodeSpec.timeoutMs,
    `workflow node ${nodeSpec.id || nodeSpec.type || 'unknown'}`,
  );
  const completedAt = Date.now();

  return {
    nodeId: nodeSpec.id || '',
    nodeType: nodeSpec.type || '',
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
    durationMs: Math.max(0, completedAt - startedAt),
    output,
  };
};
