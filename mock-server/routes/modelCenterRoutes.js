import express from 'express';
import { nowLocalIso } from '../utils/localTime.js';
import {
  buildWriteBackPayload,
  sendGovernanceSuccess,
  sendGovernanceFailure,
  sendGovernanceBlocked,
} from '../services/responseService.js';
import {
  DEFAULT_SETTINGS,
  readSettings,
  saveSettings,
} from '../services/settingsService.js';

const router = express.Router();
const MODEL_MODULE_KEYS = ['analyze', 'search', 'script'];

const buildModelConfigForGovernance = (settings = {}) => {
  const mergedModelConfig = {
    ...(DEFAULT_SETTINGS.model || {}),
    ...((settings && settings.model) || {}),
  };

  const models = Array.isArray(mergedModelConfig.models)
    ? mergedModelConfig.models.map((item) => ({ ...item }))
    : [];
  const moduleBindings = {
    ...((DEFAULT_SETTINGS.model && DEFAULT_SETTINGS.model.moduleBindings) || {}),
    ...(mergedModelConfig.moduleBindings || {}),
  };

  return {
    ...mergedModelConfig,
    models,
    moduleBindings,
  };
};

const getModelById = (models = [], modelId = '') => {
  if (!modelId) {
    return null;
  }

  return models.find((item) => item.id === modelId) || null;
};

const maskApiKey = (apiKey = '') => {
  const normalizedKey = String(apiKey || '').trim();

  if (!normalizedKey) {
    return '';
  }

  if (normalizedKey.length <= 8) {
    return `${normalizedKey.slice(0, 2)}****`;
  }

  return `${normalizedKey.slice(0, 4)}****${normalizedKey.slice(-4)}`;
};

const normalizeModelProvider = (model = {}, modelConfig = {}) =>
  String(model.modelProvider || model.provider || modelConfig.modelProvider || '').trim();

const normalizeModelName = (model = {}) => String(model.modelName || '').trim();

const normalizeDisplayName = (model = {}) => {
  const candidate = String(model.name || model.label || model.modelName || model.id || '').trim();
  return candidate || '未命名模型';
};

const buildFallbackSummary = (model = {}) => {
  const fallbackSummary =
    model.fallbackSummary && typeof model.fallbackSummary === 'object'
      ? model.fallbackSummary
      : null;

  if (!fallbackSummary) {
    return null;
  }

  return {
    modelId: fallbackSummary.modelId || null,
    modelName: fallbackSummary.modelName || null,
    reason: fallbackSummary.reason || null,
  };
};

const buildFallbackConfig = (model = {}) => {
  const fallbackSummary = buildFallbackSummary(model);
  return {
    enabled: Boolean(fallbackSummary && fallbackSummary.modelId),
    fallbackModelId: fallbackSummary?.modelId || null,
    fallbackModelName: fallbackSummary?.modelName || null,
  };
};

const buildModuleBindingsSummary = (modelConfig = {}, models = []) => {
  const moduleBindings = {
    ...((DEFAULT_SETTINGS.model && DEFAULT_SETTINGS.model.moduleBindings) || {}),
    ...(modelConfig.moduleBindings || {}),
  };

  return MODEL_MODULE_KEYS.map((moduleName) => {
    const modelId = String(moduleBindings[moduleName] || '').trim();
    const boundModel = getModelById(models, modelId);

    return {
      module: moduleName,
      modelId,
      modelName: boundModel ? normalizeDisplayName(boundModel) : modelId || '',
      bindingType: modelId,
      enabled: boundModel ? boundModel.enabled !== false : false,
    };
  });
};

const buildModelStatus = (model = {}, modelConfig = {}) => {
  if (model.enabled === false) {
    return 'offline';
  }

  const provider = normalizeModelProvider(model, modelConfig);
  const baseUrl = String(model.baseUrl || modelConfig.baseUrl || modelConfig.apiBaseUrl || '').trim();
  const modelName = normalizeModelName(model);
  const tested = model.testFeedbackSummary;

  if (tested && typeof tested === 'object' && tested.passFlag === false) {
    return 'warning';
  }

  if (!provider || !baseUrl || !modelName) {
    return 'warning';
  }

  return 'available';
};

const buildLegacyActiveModelSnapshot = (modelConfig = {}) => {
  const models = Array.isArray(modelConfig.models) ? modelConfig.models : [];
  const activeModel =
    getModelById(models, modelConfig.activeModelId || '') ||
    models[0] ||
    (DEFAULT_SETTINGS.model.models && DEFAULT_SETTINGS.model.models[0]) ||
    {};

  return {
    activeModelId:
      activeModel.id || modelConfig.activeModelId || DEFAULT_SETTINGS.model.activeModelId,
    modelProvider:
      activeModel.modelProvider || modelConfig.modelProvider || DEFAULT_SETTINGS.model.modelProvider,
    baseUrl: activeModel.baseUrl || modelConfig.baseUrl || DEFAULT_SETTINGS.model.baseUrl,
    apiKey: activeModel.apiKey || modelConfig.apiKey || '',
    modelName: activeModel.modelName || modelConfig.modelName || DEFAULT_SETTINGS.model.modelName,
    timeout: activeModel.timeout || modelConfig.timeout || DEFAULT_SETTINGS.model.timeout,
  };
};

const normalizeModelDraft = (draft = {}, fallback = {}) => {
  const displayName =
    String(
      draft.name ||
        draft.label ||
        fallback.name ||
        fallback.label ||
        draft.modelName ||
        fallback.modelName ||
        '',
    ).trim() || '未命名模型';
  const modelProvider = normalizeModelProvider(draft, fallback);

  return {
    ...fallback,
    ...draft,
    name: displayName,
    label: displayName,
    modelProvider,
    provider: modelProvider,
  };
};

const buildModelCenterSummary = (model = {}, modelConfig = {}, models = []) => {
  const fallbackSummary = buildFallbackSummary(model);
  const moduleBindingsSummary = buildModuleBindingsSummary(modelConfig, models);
  const displayName = normalizeDisplayName(model);
  const provider = normalizeModelProvider(model, modelConfig);
  const timeout = model.timeout || modelConfig.timeout || DEFAULT_SETTINGS.model.timeout;

  return {
    id: model.id || '',
    modelId: model.id || '',
    name: displayName,
    label: model.label || displayName,
    modelName: normalizeModelName(model),
    provider,
    modelProvider: provider,
    timeout,
    enabled: model.enabled !== false,
    status: buildModelStatus(model, modelConfig),
    defaultFlag: (model.id || '') === (modelConfig.activeModelId || ''),
    moduleBindings: {
      ...((DEFAULT_SETTINGS.model && DEFAULT_SETTINGS.model.moduleBindings) || {}),
      ...(modelConfig.moduleBindings || {}),
    },
    moduleBindingsSummary,
    fallbackConfig: buildFallbackConfig(model),
    fallbackSummary,
    testFeedbackSummary:
      model.testFeedbackSummary && typeof model.testFeedbackSummary === 'object'
        ? model.testFeedbackSummary
        : null,
    updatedAt: model.modifiedAt || null,
    modifiedAt: model.modifiedAt || null,
    version: typeof model.version === 'number' ? model.version : 1,
  };
};

const buildModelCenterDetail = (model = {}, modelConfig = {}, models = []) => {
  const summary = buildModelCenterSummary(model, modelConfig, models);
  const baseUrl = model.baseUrl || modelConfig.baseUrl || modelConfig.apiBaseUrl || '';

  return {
    ...summary,
    description: model.description || '',
    baseUrl,
    apiKeyMasked: maskApiKey(model.apiKey || ''),
    authMode: model.apiKey ? 'configured' : 'missing',
    rawModel: {
      id: model.id || '',
      name: normalizeDisplayName(model),
      modelName: normalizeModelName(model),
      modelProvider: normalizeModelProvider(model, modelConfig),
      baseUrl,
      enabled: model.enabled !== false,
    },
  };
};

const getModelCenterState = () => {
  const localSettings = readSettings();
  const modelConfig = buildModelConfigForGovernance(localSettings);
  const models = Array.isArray(modelConfig.models) ? modelConfig.models : [];

  return {
    localSettings,
    modelConfig,
    models,
  };
};

const persistModelCenterState = (localSettings = {}, nextModelConfig = {}) => {
  const moduleBindings = {
    ...((DEFAULT_SETTINGS.model && DEFAULT_SETTINGS.model.moduleBindings) || {}),
    ...(nextModelConfig.moduleBindings || {}),
  };
  const nextModels = Array.isArray(nextModelConfig.models) ? nextModelConfig.models : [];
  const activeSnapshot = buildLegacyActiveModelSnapshot({
    ...nextModelConfig,
    models: nextModels,
    moduleBindings,
  });
  const nextSettings = {
    ...localSettings,
    model: {
      ...(localSettings.model || {}),
      ...nextModelConfig,
      ...activeSnapshot,
      moduleBindings,
      models: nextModels,
    },
  };

  saveSettings(nextSettings);
  return nextSettings;
};

const validateModelDraft = (draft = {}) => {
  const fieldErrors = [];

  if (!(draft.modelName || '').trim()) {
    fieldErrors.push({
      field: 'modelName',
      message: 'modelName is required',
    });
  }

  if (!(draft.modelProvider || '').trim()) {
    fieldErrors.push({
      field: 'modelProvider',
      message: 'modelProvider is required',
    });
  }

  if (!(draft.baseUrl || draft.apiBaseUrl || '').trim()) {
    fieldErrors.push({
      field: 'baseUrl',
      message: 'baseUrl is required',
    });
  }

  return fieldErrors;
};

const buildTestEndpointCandidates = (baseUrl = '') => {
  const normalizedBaseUrl = String(baseUrl || '').replace(/\/$/, '');

  return [
    `${normalizedBaseUrl}/api/chat`,
    `${normalizedBaseUrl}/v1/chat/completions`,
    `${normalizedBaseUrl}/chat/completions`,
  ];
};

const testModelConnection = async (config = {}) => {
  const provider = config.modelProvider || '';
  const baseUrl = config.baseUrl || config.apiBaseUrl || '';
  const modelName = config.modelName || '';
  const apiKey = config.apiKey || '';

  if (!baseUrl) {
    throw new Error('baseUrl is required');
  }

  if (!modelName) {
    throw new Error('modelName is required');
  }

  const endpointCandidates = buildTestEndpointCandidates(baseUrl);
  let lastErrorMessage = 'model test failed';

  for (const endpoint of endpointCandidates) {
    try {
      const headers = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: 'user',
              content: 'ping',
            },
          ],
          stream: false,
        }),
      });

      if (!response.ok) {
        lastErrorMessage = `endpoint ${endpoint} responded with status ${response.status}`;
        continue;
      }

      return {
        provider,
        baseUrl,
        modelName,
        endpoint,
        status: response.status,
      };
    } catch (error) {
      lastErrorMessage = error.message;
    }
  }

  throw new Error(lastErrorMessage);
};

router.get('/list', async (req, res) => {
  try {
    const { modelConfig, models } = getModelCenterState();
    const items = models.map((item) => buildModelCenterSummary(item, modelConfig, models));

    return sendGovernanceSuccess(res, {
      message: 'model center list loaded',
      action: 'list',
      targetType: 'model',
      data: {
        items,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        summary: {
          total: items.length,
          activeModelId: modelConfig.activeModelId || '',
        },
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'model center list load failed',
      action: 'list',
      targetType: 'model',
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }
});

router.get('/detail/:modelId', async (req, res) => {
  try {
    const { modelId = '' } = req.params;
    const { modelConfig, models } = getModelCenterState();
    const targetModel = models.find((item) => item.id === modelId);

    if (!targetModel) {
      return sendGovernanceFailure(res, {
        status: 404,
        message: 'model not found',
        action: 'detail',
        targetType: 'model',
        targetId: modelId,
        error: {
          code: 'NOT_FOUND',
          message: 'model not found',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    const detail = buildModelCenterDetail(targetModel, modelConfig, models);

    return sendGovernanceSuccess(res, {
      message: 'model center detail loaded',
      action: 'detail',
      targetType: 'model',
      targetId: modelId,
      data: {
        detail,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        version: detail.version,
        modifiedAt: detail.modifiedAt,
        summary: buildModelCenterSummary(targetModel, modelConfig, models),
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'model center detail load failed',
      action: 'detail',
      targetType: 'model',
      targetId: req.params?.modelId || '',
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }
});

router.post('/create', async (req, res) => {
  try {
    const payload = req.body || {};
    const modelPayload = payload.model || payload;
    const { localSettings, modelConfig, models } = getModelCenterState();
    const now = nowLocalIso();
    const modelId = (modelPayload.id || '').trim() || `model_${Date.now()}`;
    const draft = normalizeModelDraft({
      ...modelPayload,
      id: modelId,
      enabled: modelPayload.enabled !== false,
      version: 1,
      modifiedAt: now,
    });

    const fieldErrors = validateModelDraft(draft);

    if (models.some((item) => item.id === modelId)) {
      fieldErrors.push({
        field: 'id',
        message: 'model id already exists',
      });
    }

    if (fieldErrors.length > 0) {
      return sendGovernanceFailure(res, {
        status: 400,
        message: 'model create validation failed',
        action: 'create',
        targetType: 'model',
        targetId: modelId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'model create validation failed',
          fieldErrors,
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    const nextModelConfig = {
      ...modelConfig,
      activeModelId: modelConfig.activeModelId || modelId,
      models: [...models, draft],
    };

    persistModelCenterState(localSettings, nextModelConfig);

    return sendGovernanceSuccess(res, {
      message: 'model created',
      action: 'create',
      targetType: 'model',
      targetId: modelId,
      data: {
        detail: buildModelCenterDetail(draft, nextModelConfig, nextModelConfig.models),
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        version: 1,
        modifiedAt: now,
        summary: buildModelCenterSummary(draft, nextModelConfig, nextModelConfig.models),
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'model create failed',
      action: 'create',
      targetType: 'model',
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }
});

router.post('/update/:modelId', async (req, res) => {
  try {
    const { modelId = '' } = req.params;
    const payload = req.body || {};
    const modelPayload = payload.model || payload;
    const { localSettings, modelConfig, models } = getModelCenterState();
    const targetIndex = models.findIndex((item) => item.id === modelId);

    if (targetIndex < 0) {
      return sendGovernanceFailure(res, {
        status: 404,
        message: 'model not found',
        action: 'update',
        targetType: 'model',
        targetId: modelId,
        error: {
          code: 'NOT_FOUND',
          message: 'model not found',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    const currentModel = models[targetIndex];
    const currentVersion = typeof currentModel.version === 'number' ? currentModel.version : 1;
    const incomingVersion = Number(modelPayload.version ?? currentVersion);

    if (incomingVersion !== currentVersion) {
      return sendGovernanceFailure(res, {
        status: 409,
        message: 'model version conflict',
        action: 'update',
        targetType: 'model',
        targetId: modelId,
        error: {
          code: 'VERSION_CONFLICT',
          message: 'model version conflict',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
          version: currentVersion,
          modifiedAt: currentModel.modifiedAt || null,
          summary: buildModelCenterSummary(currentModel, modelConfig, models),
        }),
      });
    }

    const now = nowLocalIso();
    const nextModel = normalizeModelDraft(
      {
        ...currentModel,
        ...modelPayload,
        id: modelId,
        version: currentVersion + 1,
        modifiedAt: now,
      },
      currentModel,
    );

    const fieldErrors = validateModelDraft(nextModel);

    if (fieldErrors.length > 0) {
      return sendGovernanceFailure(res, {
        status: 400,
        message: 'model update validation failed',
        action: 'update',
        targetType: 'model',
        targetId: modelId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'model update validation failed',
          fieldErrors,
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
          version: currentVersion,
          modifiedAt: currentModel.modifiedAt || null,
          summary: buildModelCenterSummary(currentModel, modelConfig, models),
        }),
      });
    }

    const nextModels = [...models];
    nextModels[targetIndex] = nextModel;

    const nextModelConfig = {
      ...modelConfig,
      models: nextModels,
    };

    persistModelCenterState(localSettings, nextModelConfig);

    return sendGovernanceSuccess(res, {
      message: 'model updated',
      action: 'update',
      targetType: 'model',
      targetId: modelId,
      data: {
        detail: buildModelCenterDetail(nextModel, nextModelConfig, nextModels),
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        version: nextModel.version,
        modifiedAt: now,
        summary: buildModelCenterSummary(nextModel, nextModelConfig, nextModels),
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'model update failed',
      action: 'update',
      targetType: 'model',
      targetId: req.params?.modelId || '',
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }
});

const buildModuleBindingsFromPayload = (payload = {}, modelConfig = {}) => {
  const nextBindings = {
    ...((DEFAULT_SETTINGS.model && DEFAULT_SETTINGS.model.moduleBindings) || {}),
    ...(modelConfig.moduleBindings || {}),
  };

  if (
    payload.moduleBindings &&
    typeof payload.moduleBindings === 'object' &&
    !Array.isArray(payload.moduleBindings)
  ) {
    MODEL_MODULE_KEYS.forEach((moduleName) => {
      const nextValue = payload.moduleBindings[moduleName];

      if (typeof nextValue === 'string' && nextValue.trim()) {
        nextBindings[moduleName] = nextValue.trim();
      }
    });
  }

  if (Array.isArray(payload.moduleBindingsSummary)) {
    payload.moduleBindingsSummary.forEach((item) => {
      const moduleName = String(item?.module || '').trim().toLowerCase();
      const modelId = String(item?.modelId || item?.bindingType || '').trim();

      if (MODEL_MODULE_KEYS.includes(moduleName) && modelId) {
        nextBindings[moduleName] = modelId;
      }
    });
  }

  return nextBindings;
};

router.post('/module-bindings/save/:modelId', async (req, res) => {
  try {
    const { modelId = '' } = req.params;
    const payload = req.body || {};
    const { localSettings, modelConfig, models } = getModelCenterState();
    const targetIndex = models.findIndex((item) => item.id === modelId);

    if (targetIndex < 0) {
      return sendGovernanceFailure(res, {
        status: 404,
        message: 'model not found',
        action: 'module-bindings-save',
        targetType: 'model',
        targetId: modelId,
        error: {
          code: 'NOT_FOUND',
          message: 'model not found',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    const currentModel = models[targetIndex];
    const currentVersion = typeof currentModel.version === 'number' ? currentModel.version : 1;
    const incomingVersion = Number(payload.version ?? currentVersion);

    if (incomingVersion !== currentVersion) {
      return sendGovernanceFailure(res, {
        status: 409,
        message: 'module bindings version conflict',
        action: 'module-bindings-save',
        targetType: 'model',
        targetId: modelId,
        error: {
          code: 'VERSION_CONFLICT',
          message: 'module bindings version conflict',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
          version: currentVersion,
          modifiedAt: currentModel.modifiedAt || null,
          summary: buildModelCenterSummary(currentModel, modelConfig, models),
        }),
      });
    }

    const nextBindings = buildModuleBindingsFromPayload(payload, modelConfig);
    const fieldErrors = Object.entries(nextBindings)
      .filter(([, targetModelId]) => targetModelId && !getModelById(models, targetModelId))
      .map(([moduleName, targetModelId]) => ({
        field: `moduleBindings.${moduleName}`,
        message: `bound model "${targetModelId}" does not exist`,
      }));

    if (fieldErrors.length > 0) {
      return sendGovernanceFailure(res, {
        status: 400,
        message: 'module bindings validation failed',
        action: 'module-bindings-save',
        targetType: 'model',
        targetId: modelId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'module bindings validation failed',
          fieldErrors,
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
          version: currentVersion,
          modifiedAt: currentModel.modifiedAt || null,
          summary: buildModelCenterSummary(currentModel, modelConfig, models),
        }),
      });
    }

    const now = nowLocalIso();
    const nextModelConfig = {
      ...modelConfig,
      moduleBindings: nextBindings,
      models: [...models],
    };
    const nextModel = {
      ...currentModel,
      moduleBindingsSummary: buildModuleBindingsSummary(nextModelConfig, nextModelConfig.models),
      version: currentVersion + 1,
      modifiedAt: now,
    };
    const nextModels = [...nextModelConfig.models];
    nextModels[targetIndex] = nextModel;

    nextModelConfig.models = nextModels;

    persistModelCenterState(localSettings, nextModelConfig);

    return sendGovernanceSuccess(res, {
      message: 'model module bindings saved',
      action: 'module-bindings-save',
      targetType: 'model',
      targetId: modelId,
      data: {
        detail: buildModelCenterDetail(nextModel, nextModelConfig, nextModels),
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        version: nextModel.version,
        modifiedAt: now,
        summary: buildModelCenterSummary(nextModel, nextModelConfig, nextModels),
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'model module bindings save failed',
      action: 'module-bindings-save',
      targetType: 'model',
      targetId: req.params?.modelId || '',
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }
});

router.post('/fallback/save/:modelId', async (req, res) => {
  try {
    const { modelId = '' } = req.params;
    const payload = req.body || {};
    const { localSettings, modelConfig, models } = getModelCenterState();
    const targetIndex = models.findIndex((item) => item.id === modelId);

    if (targetIndex < 0) {
      return sendGovernanceFailure(res, {
        status: 404,
        message: 'model not found',
        action: 'fallback-save',
        targetType: 'model',
        targetId: modelId,
        error: {
          code: 'NOT_FOUND',
          message: 'model not found',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    const currentModel = models[targetIndex];
    const currentVersion = typeof currentModel.version === 'number' ? currentModel.version : 1;
    const incomingVersion = Number(payload.version ?? currentVersion);

    if (incomingVersion !== currentVersion) {
      return sendGovernanceFailure(res, {
        status: 409,
        message: 'fallback version conflict',
        action: 'fallback-save',
        targetType: 'model',
        targetId: modelId,
        error: {
          code: 'VERSION_CONFLICT',
          message: 'fallback version conflict',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
          version: currentVersion,
          modifiedAt: currentModel.modifiedAt || null,
          summary: buildModelCenterSummary(currentModel, modelConfig, models),
        }),
      });
    }

    const nextFallbackSummary =
      payload.fallbackSummary && typeof payload.fallbackSummary === 'object'
        ? payload.fallbackSummary
        : null;

    if (
      nextFallbackSummary &&
      !nextFallbackSummary.modelId
    ) {
      return sendGovernanceFailure(res, {
        status: 400,
        message: 'fallback target model is required',
        action: 'fallback-save',
        targetType: 'model',
        targetId: modelId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'fallback target model is required',
          fieldErrors: [
            {
              field: 'fallbackSummary.modelId',
              message: 'fallback target model is required',
            },
          ],
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
          version: currentVersion,
          modifiedAt: currentModel.modifiedAt || null,
          summary: buildModelCenterSummary(currentModel, modelConfig, models),
        }),
      });
    }

    if (
      nextFallbackSummary &&
      nextFallbackSummary.modelId &&
      nextFallbackSummary.modelId === modelId
    ) {
      return sendGovernanceFailure(res, {
        status: 400,
        message: 'fallback cannot reference itself',
        action: 'fallback-save',
        targetType: 'model',
        targetId: modelId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'fallback cannot reference itself',
          fieldErrors: [
            {
              field: 'fallbackSummary.modelId',
              message: 'fallback cannot reference itself',
            },
          ],
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
          version: currentVersion,
          modifiedAt: currentModel.modifiedAt || null,
          summary: buildModelCenterSummary(currentModel, modelConfig, models),
        }),
      });
    }

    if (
      nextFallbackSummary &&
      nextFallbackSummary.modelId &&
      !getModelById(models, nextFallbackSummary.modelId)
    ) {
      return sendGovernanceFailure(res, {
        status: 400,
        message: 'fallback target model not found',
        action: 'fallback-save',
        targetType: 'model',
        targetId: modelId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'fallback target model not found',
          fieldErrors: [
            {
              field: 'fallbackSummary.modelId',
              message: 'fallback target model not found',
            },
          ],
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
          version: currentVersion,
          modifiedAt: currentModel.modifiedAt || null,
          summary: buildModelCenterSummary(currentModel, modelConfig, models),
        }),
      });
    }

    const now = nowLocalIso();
    const nextModel = {
      ...currentModel,
      fallbackSummary: nextFallbackSummary,
      version: currentVersion + 1,
      modifiedAt: now,
    };

    const nextModels = [...models];
    nextModels[targetIndex] = nextModel;

    const nextModelConfig = {
      ...modelConfig,
      models: nextModels,
    };

    persistModelCenterState(localSettings, nextModelConfig);

    return sendGovernanceSuccess(res, {
      message: 'model fallback saved',
      action: 'fallback-save',
      targetType: 'model',
      targetId: modelId,
      data: {
        detail: buildModelCenterDetail(nextModel, nextModelConfig, nextModels),
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        version: nextModel.version,
        modifiedAt: now,
        summary: buildModelCenterSummary(nextModel, nextModelConfig, nextModels),
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'model fallback save failed',
      action: 'fallback-save',
      targetType: 'model',
      targetId: req.params?.modelId || '',
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }
});

router.post('/test/:modelId', async (req, res) => {
  try {
    const { modelId = '' } = req.params;
    const { localSettings, modelConfig, models } = getModelCenterState();
    const targetIndex = models.findIndex((item) => item.id === modelId);

    if (targetIndex < 0) {
      return sendGovernanceFailure(res, {
        status: 404,
        message: 'model not found',
        action: 'test',
        targetType: 'model',
        targetId: modelId,
        error: {
          code: 'NOT_FOUND',
          message: 'model not found',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    const currentModel = models[targetIndex];
    const now = nowLocalIso();
    const testTargetConfig = {
      ...modelConfig,
      ...currentModel,
      modelProvider: currentModel.modelProvider || modelConfig.modelProvider || '',
      baseUrl: currentModel.baseUrl || modelConfig.baseUrl || modelConfig.apiBaseUrl || '',
      modelName: currentModel.modelName || modelConfig.modelName || '',
      apiKey: currentModel.apiKey || modelConfig.apiKey || '',
    };

    const result = await testModelConnection(testTargetConfig);
    const nextModel = {
      ...currentModel,
      testFeedbackSummary: {
        passFlag: true,
        provider: result.provider || testTargetConfig.modelProvider || '',
        baseUrl: result.baseUrl || testTargetConfig.baseUrl || '',
        modelName: result.modelName || testTargetConfig.modelName || '',
        endpoint: result.endpoint || '',
        testedAt: now,
      },
      modifiedAt: now,
    };

    const nextModels = [...models];
    nextModels[targetIndex] = nextModel;

    const nextModelConfig = {
      ...modelConfig,
      models: nextModels,
    };

    persistModelCenterState(localSettings, nextModelConfig);

    return sendGovernanceSuccess(res, {
      message: 'model test passed',
      action: 'test',
      targetType: 'model',
      targetId: modelId,
      data: {
        result,
        detail: buildModelCenterDetail(nextModel, nextModelConfig, nextModels),
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        version: typeof nextModel.version === 'number' ? nextModel.version : 1,
        modifiedAt: now,
        summary: buildModelCenterSummary(nextModel, nextModelConfig, nextModels),
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'model test failed',
      action: 'test',
      targetType: 'model',
      targetId: req.params?.modelId || '',
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }
});

router.post('/set-default/:modelId', async (req, res) => {
  try {
    const { modelId = '' } = req.params;
    const { localSettings, modelConfig, models } = getModelCenterState();
    const targetModel = models.find((item) => item.id === modelId);

    if (!targetModel) {
      return sendGovernanceFailure(res, {
        status: 404,
        message: 'model not found',
        action: 'set-default',
        targetType: 'model',
        targetId: modelId,
        error: {
          code: 'NOT_FOUND',
          message: 'model not found',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    const now = nowLocalIso();
    const nextModels = models.map((item) =>
      item.id === modelId
        ? {
            ...item,
            modifiedAt: now,
          }
        : item,
    );

    const nextModelConfig = {
      ...modelConfig,
      activeModelId: modelId,
      models: nextModels,
    };

    persistModelCenterState(localSettings, nextModelConfig);

    const nextTargetModel = nextModels.find((item) => item.id === modelId) || targetModel;

    return sendGovernanceSuccess(res, {
      message: 'default model updated',
      action: 'set-default',
      targetType: 'model',
      targetId: modelId,
      data: {
        detail: buildModelCenterDetail(nextTargetModel, nextModelConfig, nextModels),
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        version: typeof nextTargetModel.version === 'number' ? nextTargetModel.version : 1,
        modifiedAt: now,
        summary: buildModelCenterSummary(nextTargetModel, nextModelConfig, nextModels),
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'set default model failed',
      action: 'set-default',
      targetType: 'model',
      targetId: req.params?.modelId || '',
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }
});

router.post('/delete/:modelId', async (req, res) => {
  try {
    const { modelId = '' } = req.params;
    const { localSettings, modelConfig, models } = getModelCenterState();
    const targetModel = models.find((item) => item.id === modelId);

    if (!targetModel) {
      return sendGovernanceFailure(res, {
        status: 404,
        message: 'model not found',
        action: 'delete',
        targetType: 'model',
        targetId: modelId,
        error: {
          code: 'NOT_FOUND',
          message: 'model not found',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    if ((modelConfig.activeModelId || '') === modelId) {
      return sendGovernanceBlocked(res, {
        message: 'active default model cannot be deleted',
        action: 'delete',
        targetType: 'model',
        targetId: modelId,
        blockers: [
          {
            type: 'default-model',
            id: modelId,
            name: targetModel.modelName || modelId,
            reason: 'current activeModelId still points to this model',
          },
        ],
        error: {
          code: 'DEPENDENCY_BLOCKED',
          message: 'active default model cannot be deleted',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'blocked',
          version: typeof targetModel.version === 'number' ? targetModel.version : 1,
          modifiedAt: targetModel.modifiedAt || null,
          summary: buildModelCenterSummary(targetModel, modelConfig, models),
        }),
      });
    }

    const moduleBindingReferences = Object.entries(modelConfig.moduleBindings || {})
      .filter(([, targetId]) => targetId === modelId)
      .map(([moduleName]) => moduleName);
    const fallbackReferences = models.filter(
      (item) => item.id !== modelId && item?.fallbackSummary?.modelId === modelId,
    );

    if (moduleBindingReferences.length > 0) {
      return sendGovernanceBlocked(res, {
        message: 'model dependencies must be removed before delete',
        action: 'delete',
        targetType: 'model',
        targetId: modelId,
        blockers: [
          ...moduleBindingReferences.map((moduleName) => ({
            type: 'module-binding',
            id: `${moduleName}:${modelId}`,
            name: targetModel.modelName || modelId,
            reason: `${moduleName} module binding still points to this model`,
          })),
        ],
        error: {
          code: 'DEPENDENCY_BLOCKED',
          message: 'model dependencies must be removed before delete',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'blocked',
          version: typeof targetModel.version === 'number' ? targetModel.version : 1,
          modifiedAt: targetModel.modifiedAt || null,
          summary: buildModelCenterSummary(targetModel, modelConfig, models),
        }),
      });
    }

    const now = nowLocalIso();
    const fallbackCleanupWarnings = fallbackReferences.map((item) => ({
      type: 'fallback-reference-cleaned',
      targetId: item.id || '',
      targetName: normalizeDisplayName(item),
      message: `auto-cleared fallback reference from ${normalizeDisplayName(item)}`,
    }));
    const nextModels = models
      .filter((item) => item.id !== modelId)
      .map((item) => {
        if (item?.fallbackSummary?.modelId !== modelId) {
          return item;
        }

        return {
          ...item,
          fallbackSummary: null,
          version: typeof item.version === 'number' ? item.version + 1 : 2,
          modifiedAt: now,
        };
      });
    const nextModelConfig = {
      ...modelConfig,
      models: nextModels,
    };

    persistModelCenterState(localSettings, nextModelConfig);

    return sendGovernanceSuccess(res, {
      message: 'model deleted',
      action: 'delete',
      targetType: 'model',
      targetId: modelId,
      data: {
        deleted: true,
      },
      warnings: fallbackCleanupWarnings.length > 0 ? fallbackCleanupWarnings : undefined,
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        summary: {
          deleted: true,
          modelId,
          clearedFallbackReferences: fallbackCleanupWarnings.map((item) => ({
            modelId: item.targetId,
            modelName: item.targetName,
          })),
        },
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'model delete failed',
      action: 'delete',
      targetType: 'model',
      targetId: req.params?.modelId || '',
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }
});

export default router;
