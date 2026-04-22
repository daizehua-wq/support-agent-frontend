

import { getModulePolicy, isApiModelAllowed } from '../config/policyConfig.js';

export const MODEL_ROUTES = {
  LOCAL_LLM: 'local-llm',
  API_LLM: 'api-llm',
  TEMPLATE_FALLBACK: 'template-fallback',
};

export const shouldUseLocalLLM = ({ useLocalLLM = false }) => {
  return Boolean(useLocalLLM);
};

export const shouldUseApiLLM = ({ useApiLLM = false }) => {
  return Boolean(useApiLLM);
};

const normalizeModels = (modelSettings = {}) => {
  return Array.isArray(modelSettings.models) ? modelSettings.models : [];
};

const getModelById = (models = [], modelId = '') => {
  if (!modelId) {
    return null;
  }

  return models.find((item) => item.id === modelId) || null;
};

const isModelEnabled = (model = null) => {
  return Boolean(model && model.enabled);
};

const getEnabledModelById = (models = [], modelId = '') => {
  if (!modelId) {
    return null;
  }

  const model = getModelById(models, modelId);
  return isModelEnabled(model) ? model : null;
};

const getEnabledFallbackModel = (models = [], model = null) => {
  const fallbackId =
    model?.fallbackSummary?.modelId || model?.fallbackConfig?.fallbackModelId || '';

  return getEnabledModelById(models, fallbackId);
};

const buildResolvedModel = ({
  model = null,
  source = '',
  moduleName = '',
  fallbackFromModelId = '',
  fallbackFromSource = '',
}) => {
  if (!model) {
    return {
      moduleName,
      source,
      isResolved: false,
      resolvedModelId: '',
      resolvedProvider: '',
      resolvedBaseUrl: '',
      resolvedModelName: '',
      hasApiKey: false,
      fallbackFromModelId,
      fallbackFromSource,
    };
  }

  return {
    moduleName,
    source,
    isResolved: true,
    resolvedModelId: model.id || '',
    resolvedProvider: model.modelProvider || '',
    resolvedBaseUrl: model.baseUrl || '',
    resolvedModelName: model.modelName || '',
    hasApiKey: Boolean(model.hasApiKey || model.apiKey),
    fallbackFromModelId,
    fallbackFromSource,
  };
};

const getRouteByResolvedProvider = (resolvedProvider = '') => {
  if (resolvedProvider === 'api') {
    return MODEL_ROUTES.API_LLM;
  }

  if (resolvedProvider === 'local') {
    return MODEL_ROUTES.LOCAL_LLM;
  }

  return MODEL_ROUTES.TEMPLATE_FALLBACK;
};
export const resolveModelRuntimeForModule = ({
  moduleName = '',
  modelSettings = {},
  useLocalLLM = false,
  useApiLLM = false,
}) => {
  const resolvedModel = resolveModelForModule({ moduleName, modelSettings });
  const routeDecision = resolveModelRoute({ moduleName, useLocalLLM, useApiLLM });

  if (!resolvedModel.isResolved) {
    return {
      ...routeDecision,
      resolvedModel,
    };
  }

  return {
    route: getRouteByResolvedProvider(resolvedModel.resolvedProvider),
    reason:
      routeDecision.reason === 'api-model-explicitly-selected' ||
      routeDecision.reason === 'local-model-explicitly-selected'
        ? routeDecision.reason
        : `resolved-from-${resolvedModel.source}`,
    modulePolicy: routeDecision.modulePolicy,
    resolvedModel,
  };
};

export const resolveModelForModule = ({ moduleName = '', modelSettings = {} }) => {
  const models = normalizeModels(modelSettings);
  const moduleBindings = modelSettings.moduleBindings || {};
  const activeModelId = modelSettings.activeModelId || '';

  const boundModelId = moduleBindings[moduleName] || '';
  const rawBoundModel = getModelById(models, boundModelId);
  const boundModel = getEnabledModelById(models, boundModelId);
  if (boundModel) {
    return buildResolvedModel({
      model: boundModel,
      source: 'module-binding',
      moduleName,
    });
  }

  const boundFallbackModel = getEnabledFallbackModel(models, rawBoundModel);
  if (boundFallbackModel) {
    return buildResolvedModel({
      model: boundFallbackModel,
      source: 'fallback',
      moduleName,
      fallbackFromModelId: rawBoundModel?.id || '',
      fallbackFromSource: 'module-binding',
    });
  }

  const rawActiveModel = getModelById(models, activeModelId);
  const activeModel = getEnabledModelById(models, activeModelId);
  if (activeModel) {
    return buildResolvedModel({
      model: activeModel,
      source: 'default-model',
      moduleName,
    });
  }

  const activeFallbackModel = getEnabledFallbackModel(models, rawActiveModel);
  if (activeFallbackModel) {
    return buildResolvedModel({
      model: activeFallbackModel,
      source: 'fallback',
      moduleName,
      fallbackFromModelId: rawActiveModel?.id || '',
      fallbackFromSource: 'default-model',
    });
  }

  const localFallbackModel = models.find(
    (item) => isModelEnabled(item) && item.modelProvider === 'local',
  );
  if (localFallbackModel) {
    return buildResolvedModel({
      model: localFallbackModel,
      source: 'provider-fallback-local',
      moduleName,
    });
  }

  const apiFallbackModel = models.find(
    (item) => isModelEnabled(item) && item.modelProvider === 'api',
  );
  if (apiFallbackModel) {
    return buildResolvedModel({
      model: apiFallbackModel,
      source: 'provider-fallback-api',
      moduleName,
    });
  }

  return buildResolvedModel({
    model: null,
    source: 'no-enabled-model',
    moduleName,
  });
};

export const resolveModelRoute = ({
  moduleName,
  useLocalLLM = false,
  useApiLLM = false,
}) => {
  const modulePolicy = getModulePolicy(moduleName);

  if (!modulePolicy) {
    return {
      route: MODEL_ROUTES.TEMPLATE_FALLBACK,
      reason: 'module-policy-not-found',
      modulePolicy: null,
    };
  }

  if (shouldUseApiLLM({ useApiLLM })) {
    return {
      route: MODEL_ROUTES.API_LLM,
      reason: 'api-model-explicitly-selected',
      modulePolicy,
    };
  }

  if (shouldUseLocalLLM({ useLocalLLM })) {
    return {
      route: MODEL_ROUTES.LOCAL_LLM,
      reason: 'local-model-explicitly-selected',
      modulePolicy,
    };
  }

  if (modulePolicy?.localModelPreferred && !isApiModelAllowed(moduleName)) {
    return {
      route: MODEL_ROUTES.LOCAL_LLM,
      reason: 'local-model-default-by-policy',
      modulePolicy,
    };
  }

  return {
    route: MODEL_ROUTES.TEMPLATE_FALLBACK,
    reason: 'fallback-by-policy',
    modulePolicy,
  };
};
