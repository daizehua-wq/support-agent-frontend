import { Router } from 'express';
import {
  buildWriteBackPayload,
  sendGovernanceBlocked,
  sendGovernanceFailure,
  sendGovernanceSuccess,
  sendSuccess,
} from '../services/responseService.js';
import {
  buildAssistantGovernanceDetail,
  buildPromptGovernanceDetail,
  getCurrentModuleBindingsSummary,
  getCurrentPublishedAssistantSummary,
  getGovernanceDefinitionSummary,
  listAssistantGovernanceItems,
  listPromptGovernanceItems,
  resolveActiveAssistantId,
} from '../services/assistantGovernanceService.js';
import {
  listGovernanceAuditEntries,
  recordGovernanceAuditEntry,
} from '../services/governanceAuditService.js';
import {
  createAssistantProfile,
  createPromptRecord,
  getAssistantById,
  getPromptById,
  getPromptUsageSummary,
  publishAssistantProfile,
  publishPromptRecord,
  removeAssistantProfile,
  removePromptRecord,
  updateAssistantProfile,
  updatePromptRecord,
} from '../services/governanceRegistryService.js';
import { saveSettingsToDatabase } from '../services/databaseService.js';
import {
  getActiveDatabaseConfig,
  getDefaultSettings,
  mergeSettingsPreserveApiKeys,
  readSettings,
  saveSettings,
} from '../services/settingsService.js';
import { syncAssistantGovernanceSettings } from '../services/settingsGovernanceBridgeService.js';
import { recordSettingsMutationVersion } from '../services/settingsGovernanceService.js';

const router = Router();

const GOVERNANCE_MODULES = ['analyze', 'search', 'script'];
const MAX_INDUSTRY_TYPE_LENGTH = 64;

const toNonEmptyString = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '');
const normalizeIndustryType = (value) => {
  const normalizedValue = toNonEmptyString(value).toLowerCase();
  return normalizedValue || 'other';
};

const normalizeStringArray = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => toNonEmptyString(item))
      .filter(Boolean);
  }

  const normalizedValue = toNonEmptyString(value);
  return normalizedValue ? [normalizedValue] : [];
};

const normalizeVariableDefaults = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entryValue]) => [toNonEmptyString(key), toNonEmptyString(entryValue)])
      .filter(([key, entryValue]) => Boolean(key) && Boolean(entryValue)),
  );
};

const normalizeVariableSchema = (value = []) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      return {
        key: toNonEmptyString(item.key),
        label: toNonEmptyString(item.label),
        description: toNonEmptyString(item.description),
        required: item.required === true,
        defaultValue: toNonEmptyString(item.defaultValue),
        example: toNonEmptyString(item.example),
      };
    })
    .filter((item) => item?.key);
};

const parseAssistantPayload = (payload = {}) => ({
  assistantId: toNonEmptyString(payload.assistantId),
  assistantName: toNonEmptyString(payload.assistantName),
  description: toNonEmptyString(payload.description),
  industryType: normalizeIndustryType(payload.industryType),
  templateOrigin: toNonEmptyString(payload.templateOrigin) || 'custom',
  templateCategory: toNonEmptyString(payload.templateCategory) || 'role-template',
  templateRole: toNonEmptyString(payload.templateRole),
  defaultTaskContext:
    toNonEmptyString(payload.defaultTaskContext) || toNonEmptyString(payload.defaultCustomerType),
  defaultSubjectHint:
    toNonEmptyString(payload.defaultSubjectHint) || toNonEmptyString(payload.defaultProductDirection),
  defaultVariables: normalizeVariableDefaults(payload.defaultVariables || {}),
  variableSchema: normalizeVariableSchema(payload.variableSchema || []),
  defaultCustomerType: toNonEmptyString(payload.defaultCustomerType),
  defaultProductDirection: toNonEmptyString(payload.defaultProductDirection),
  enabled: payload.enabled !== false,
  dataScopes: {
    rulesScope: normalizeStringArray(payload.dataScopes?.rulesScope),
    productScope: normalizeStringArray(payload.dataScopes?.productScope),
    docScope: normalizeStringArray(payload.dataScopes?.docScope),
  },
  defaultStrategies: {
    analyzeStrategy: toNonEmptyString(payload.defaultStrategies?.analyzeStrategy),
    searchStrategy: toNonEmptyString(payload.defaultStrategies?.searchStrategy),
    scriptStrategy: toNonEmptyString(payload.defaultStrategies?.scriptStrategy),
  },
  defaultModuleBindings: {
    analyze: toNonEmptyString(payload.defaultModuleBindings?.analyze),
    search: toNonEmptyString(payload.defaultModuleBindings?.search),
    script: toNonEmptyString(payload.defaultModuleBindings?.script),
  },
});

const parsePromptPayload = (payload = {}) => ({
  promptId: toNonEmptyString(payload.promptId),
  name: toNonEmptyString(payload.name),
  module: toNonEmptyString(payload.module).toLowerCase(),
  description: toNonEmptyString(payload.description),
  version: toNonEmptyString(payload.version) || 'v1',
  content: typeof payload.content === 'string' ? payload.content : '',
  industryType: normalizeIndustryType(payload.industryType),
  assistantId: toNonEmptyString(payload.assistantId),
  enabled: payload.enabled !== false,
  tags: normalizeStringArray(payload.tags),
});

const buildGovernanceInterfaceContract = (primary = []) => ({
  primary,
  frozenLegacy: ['assistant-center/detail', 'assistant-center/summary'],
  retirementPlanned: ['assistant-center/detail', 'assistant-center/summary'],
});

const safeRecordGovernanceAuditEntry = (payload = {}) => {
  try {
    return recordGovernanceAuditEntry(payload);
  } catch (error) {
    console.warn('[assistant-center] governance audit record failed:', error.message);
    return null;
  }
};

const getAssistantVersion = (assistant = null) =>
  typeof assistant?.version === 'number' ? assistant.version : 1;

const getPromptRecordVersion = (prompt = null) =>
  typeof prompt?.recordVersion === 'number' ? prompt.recordVersion : 1;

const buildAssistantSummaryForWriteBack = (assistant = null) => ({
  assistantId: assistant?.id || '',
  assistantName: assistant?.assistantName || assistant?.name || '',
  status: assistant?.publishState || 'draft',
  version: getAssistantVersion(assistant),
});

const buildPromptSummaryForWriteBack = (prompt = null) => ({
  promptId: prompt?.id || '',
  name: prompt?.name || '',
  module: prompt?.module || '',
  status: prompt?.publishState || 'draft',
  recordVersion: getPromptRecordVersion(prompt),
});

const validateAssistantPayload = (assistantPayload = {}) => {
  const fieldErrors = [];

  if (!assistantPayload.assistantName) {
    fieldErrors.push({
      field: 'assistantName',
      message: 'assistantName is required',
    });
  }

  if ((assistantPayload.industryType || '').length > MAX_INDUSTRY_TYPE_LENGTH) {
    fieldErrors.push({
      field: 'industryType',
      message: `industryType length must be ${MAX_INDUSTRY_TYPE_LENGTH} or less`,
    });
  }

  GOVERNANCE_MODULES.forEach((moduleName) => {
    const promptId = assistantPayload.defaultModuleBindings?.[moduleName] || '';
    if (!promptId) {
      return;
    }

    const prompt = getPromptById(promptId);
    if (!prompt) {
      fieldErrors.push({
        field: `defaultModuleBindings.${moduleName}`,
        message: `prompt ${promptId} not found`,
      });
      return;
    }

    if (prompt.module !== moduleName) {
      fieldErrors.push({
        field: `defaultModuleBindings.${moduleName}`,
        message: `prompt ${promptId} is not a ${moduleName} prompt`,
      });
    }
  });

  return fieldErrors;
};

const validatePromptPayload = (promptPayload = {}) => {
  const fieldErrors = [];

  if (!promptPayload.name) {
    fieldErrors.push({
      field: 'name',
      message: 'name is required',
    });
  }

  if (!GOVERNANCE_MODULES.includes(promptPayload.module)) {
    fieldErrors.push({
      field: 'module',
      message: 'module must be analyze, search or script',
    });
  }

  if (!promptPayload.version) {
    fieldErrors.push({
      field: 'version',
      message: 'version is required',
    });
  }

  if (!String(promptPayload.content || '').trim()) {
    fieldErrors.push({
      field: 'content',
      message: 'content is required',
    });
  }

  if ((promptPayload.industryType || '').length > MAX_INDUSTRY_TYPE_LENGTH) {
    fieldErrors.push({
      field: 'industryType',
      message: `industryType length must be ${MAX_INDUSTRY_TYPE_LENGTH} or less`,
    });
  }

  return fieldErrors;
};

const requireAssistant = (assistantId = '') => {
  const assistant = getAssistantById(assistantId);
  if (!assistant) {
    return {
      assistant: null,
      failure: {
        status: 404,
        message: 'assistant not found',
        action: 'detail',
        targetType: 'assistant',
        targetId: assistantId,
        error: {
          code: 'NOT_FOUND',
          message: 'assistant not found',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      },
    };
  }

  return { assistant, failure: null };
};

const requirePrompt = (promptId = '') => {
  const prompt = getPromptById(promptId);
  if (!prompt) {
    return {
      prompt: null,
      failure: {
        status: 404,
        message: 'prompt not found',
        action: 'detail',
        targetType: 'prompt',
        targetId: promptId,
        error: {
          code: 'NOT_FOUND',
          message: 'prompt not found',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      },
    };
  }

  return { prompt, failure: null };
};

const activateAssistantInSettings = async (assistant, req = null) => {
  const settings = readSettings();
  const analyzePrompt = assistant?.defaultModuleBindings?.analyze
    ? getPromptById(assistant.defaultModuleBindings.analyze)
    : null;

  const nextSettings = syncAssistantGovernanceSettings({
    ...settings,
    assistant: {
      ...(settings.assistant || {}),
      activeAssistantId: assistant?.id || null,
      assistantVersion: assistant ? String(getAssistantVersion(assistant)) : null,
      activePromptId: analyzePrompt?.id || null,
      promptVersion: analyzePrompt?.version || null,
      executionContext: null,
    },
  });

  let persistedSettings = nextSettings;
  let persistedToDatabase = false;

  try {
    const savedSettings = await saveSettingsToDatabase(
      nextSettings,
      getDefaultSettings(),
      getActiveDatabaseConfig(),
    );
    persistedSettings = syncAssistantGovernanceSettings(
      mergeSettingsPreserveApiKeys(savedSettings, nextSettings),
    );
    persistedToDatabase = true;
  } catch (error) {
    console.warn('[assistant-center] activate save to database failed:', error.message);
  }

  saveSettings(persistedSettings);
  recordSettingsMutationVersion({
    settingsSnapshot: persistedSettings,
    context: {
      tenantId: 'default',
      traceId: req?.traceId || '',
      actor: {
        id: 'assistant-center',
        role: 'platform-owner',
      },
    },
    reason: 'assistant activate',
    metadata: {
      route: 'assistant-center.activate',
      nextActiveAssistantId: assistant?.id || '',
      activeAnalyzePromptId: analyzePrompt?.id || null,
      persistedToDatabase,
    },
  });

  return {
    settings: persistedSettings,
    persistedToDatabase,
  };
};

const sendAssistantMutationSuccess = (res, { message, action, assistant }) =>
  sendGovernanceSuccess(res, {
    message,
    action,
    targetType: 'assistant',
    targetId: assistant?.id || '',
    data: {
      detail: buildAssistantGovernanceDetail(assistant?.id || ''),
    },
    writeBack: buildWriteBackPayload({
      writeBackStatus: 'success',
      version: getAssistantVersion(assistant),
      modifiedAt: assistant?.updatedAt || null,
      summary: buildAssistantSummaryForWriteBack(assistant),
    }),
  });

const sendPromptMutationSuccess = (res, { message, action, prompt }) =>
  sendGovernanceSuccess(res, {
    message,
    action,
    targetType: 'prompt',
    targetId: prompt?.id || '',
    data: {
      detail: buildPromptGovernanceDetail(prompt?.id || ''),
    },
    writeBack: buildWriteBackPayload({
      writeBackStatus: 'success',
      version: getPromptRecordVersion(prompt),
      modifiedAt: prompt?.updatedAt || null,
      summary: buildPromptSummaryForWriteBack(prompt),
    }),
  });

router.get('/assistant-center/assistants', async (_req, res) => {
  const settings = readSettings();

  return sendSuccess(res, {
    message: 'AssistantCenter 列表获取成功',
    data: {
      items: listAssistantGovernanceItems(),
      activeAssistantId: resolveActiveAssistantId(settings),
    },
    meta: {
      responseContract: buildGovernanceInterfaceContract(['assistantList']),
    },
  });
});

router.get('/assistant-center/assistants/:assistantId', async (req, res) => {
  const { assistantId = '' } = req.params;
  const detail = buildAssistantGovernanceDetail(assistantId);

  if (!detail) {
    return sendGovernanceFailure(res, requireAssistant(assistantId).failure);
  }

  return sendSuccess(res, {
    message: 'AssistantCenter 详情获取成功',
    data: {
      detail,
    },
    meta: {
      responseContract: buildGovernanceInterfaceContract(['assistantDetail']),
    },
  });
});

router.get('/assistant-center/assistants/:assistantId/history', async (req, res) => {
  const { assistantId = '' } = req.params;
  const { assistant, failure } = requireAssistant(assistantId);

  if (!assistant) {
    return sendGovernanceFailure(res, {
      ...failure,
      action: 'history',
    });
  }

  return sendSuccess(res, {
    message: 'AssistantCenter 历史记录获取成功',
    data: {
      items: listGovernanceAuditEntries({
        entityType: 'assistant',
        targetId: assistantId,
        limit: Number(req.query?.limit || 20) || 20,
      }),
    },
    meta: {
      responseContract: buildGovernanceInterfaceContract(['assistantHistory']),
    },
  });
});

router.post('/assistant-center/list', async (_req, res) => {
  return sendSuccess(res, {
    message: 'AssistantCenter 列表获取成功',
    data: listAssistantGovernanceItems(),
  });
});

router.post('/assistant-center/detail', async (req, res) => {
  const assistantId =
    toNonEmptyString(req.body?.assistantId) || readSettings().assistant?.activeAssistantId || '';
  const detail = buildAssistantGovernanceDetail(assistantId);

  if (!detail) {
    return sendGovernanceFailure(res, requireAssistant(assistantId).failure);
  }

  return sendGovernanceSuccess(res, {
    message: 'AssistantCenter 治理详情获取成功',
    action: 'detail',
    targetType: 'assistant',
    targetId: assistantId,
    data: {
      detail,
    },
    writeBack: buildWriteBackPayload({
      writeBackStatus: 'success',
      version: getAssistantVersion(getAssistantById(assistantId)),
      modifiedAt: detail.updatedAt || null,
      summary: buildAssistantSummaryForWriteBack(getAssistantById(assistantId)),
    }),
  });
});

router.post('/assistant-center/current-published', async (req, res) => {
  const assistantId = toNonEmptyString(req.body?.assistantId);

  return sendSuccess(res, {
    message: 'AssistantCenter 当前发布版摘要获取成功',
    data: getCurrentPublishedAssistantSummary(assistantId),
    meta: {
      responseContract: buildGovernanceInterfaceContract(['currentPublished', 'publishRecord']),
    },
  });
});

router.post('/assistant-center/module-bindings', async (req, res) => {
  const assistantId = toNonEmptyString(req.body?.assistantId);

  return sendSuccess(res, {
    message: 'AssistantCenter 当前挂载关系摘要获取成功',
    data: getCurrentModuleBindingsSummary(assistantId),
    meta: {
      responseContract: buildGovernanceInterfaceContract(['moduleBindings']),
    },
  });
});

router.post('/assistant-center/governance-definition', async (req, res) => {
  const assistantId = toNonEmptyString(req.body?.assistantId);

  return sendSuccess(res, {
    message: 'AssistantCenter 当前治理定义摘要获取成功',
    data: getGovernanceDefinitionSummary(assistantId),
    meta: {
      responseContract: buildGovernanceInterfaceContract(['governanceDefinition']),
    },
  });
});

const createAssistantHandler = async (req, res) => {
  try {
    const assistantPayload = parseAssistantPayload(req.body?.assistant || req.body || {});
    const fieldErrors = validateAssistantPayload(assistantPayload);

    if (fieldErrors.length > 0) {
      return sendGovernanceFailure(res, {
        status: 400,
        message: 'AssistantCenter 创建校验失败',
        action: 'create',
        targetType: 'assistant',
        targetId: assistantPayload.assistantId || '',
        error: {
          code: 'VALIDATION_ERROR',
          message: 'AssistantCenter 创建校验失败',
          fieldErrors,
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    const assistant = createAssistantProfile(assistantPayload);
    safeRecordGovernanceAuditEntry({
      entityType: 'assistant',
      targetId: assistant.id,
      targetName: assistant.assistantName || assistant.name || assistant.id,
      action: 'create',
      actor: 'assistant-center',
      after: assistant,
      metadata: {
        route: 'assistant-center',
      },
    });
    return sendAssistantMutationSuccess(res, {
      message: 'AssistantCenter 创建成功',
      action: 'create',
      assistant,
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'AssistantCenter 创建失败',
      action: 'create',
      targetType: 'assistant',
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }
};

router.post('/assistant-center/assistants', createAssistantHandler);
router.post('/assistant-center/create', createAssistantHandler);

const updateAssistantHandler = async (req, res) => {
  try {
    const assistantId = toNonEmptyString(req.params.assistantId || req.body?.assistantId);
    const { assistant, failure } = requireAssistant(assistantId);

    if (!assistant) {
      return sendGovernanceFailure(res, {
        ...failure,
        action: 'update',
      });
    }

    const assistantPayload = parseAssistantPayload(req.body?.assistant || req.body || {});
    const incomingVersion = Number(req.body?.version ?? req.body?.assistant?.version ?? assistant.version);

    if (incomingVersion !== getAssistantVersion(assistant)) {
      return sendGovernanceFailure(res, {
        status: 409,
        message: 'assistant version conflict',
        action: 'update',
        targetType: 'assistant',
        targetId: assistantId,
        error: {
          code: 'VERSION_CONFLICT',
          message: 'assistant version conflict',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
          version: getAssistantVersion(assistant),
          modifiedAt: assistant.updatedAt || null,
          summary: buildAssistantSummaryForWriteBack(assistant),
        }),
      });
    }

    const fieldErrors = validateAssistantPayload(assistantPayload);
    if (fieldErrors.length > 0) {
      return sendGovernanceFailure(res, {
        status: 400,
        message: 'AssistantCenter 保存校验失败',
        action: 'update',
        targetType: 'assistant',
        targetId: assistantId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'AssistantCenter 保存校验失败',
          fieldErrors,
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
          version: getAssistantVersion(assistant),
          modifiedAt: assistant.updatedAt || null,
          summary: buildAssistantSummaryForWriteBack(assistant),
        }),
      });
    }

    const nextAssistant = updateAssistantProfile(assistantId, assistantPayload);
    safeRecordGovernanceAuditEntry({
      entityType: 'assistant',
      targetId: assistantId,
      targetName:
        nextAssistant?.assistantName || nextAssistant?.name || assistant.assistantName || assistant.name || assistantId,
      action: 'update',
      actor: 'assistant-center',
      before: assistant,
      after: nextAssistant,
      metadata: {
        route: 'assistant-center',
      },
    });
    return sendAssistantMutationSuccess(res, {
      message: 'AssistantCenter 保存成功',
      action: 'update',
      assistant: nextAssistant,
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'AssistantCenter 保存失败',
      action: 'update',
      targetType: 'assistant',
      targetId: req.params?.assistantId || '',
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }
};

router.post('/assistant-center/assistants/:assistantId/update', updateAssistantHandler);
router.post('/assistant-center/update/:assistantId', updateAssistantHandler);

const publishAssistantHandler = async (req, res) => {
  try {
    const assistantId = toNonEmptyString(req.params.assistantId || req.body?.assistantId);
    const { assistant, failure } = requireAssistant(assistantId);

    if (!assistant) {
      return sendGovernanceFailure(res, {
        ...failure,
        action: 'publish',
      });
    }

    const missingBindings = GOVERNANCE_MODULES.filter(
      (moduleName) => !toNonEmptyString(assistant.defaultModuleBindings?.[moduleName]),
    );

    if (missingBindings.length > 0) {
      return sendGovernanceBlocked(res, {
        message: 'assistant bindings are incomplete',
        action: 'publish',
        targetType: 'assistant',
        targetId: assistantId,
        blockers: missingBindings.map((moduleName) => ({
          type: 'missing-module-binding',
          id: `${assistantId}:${moduleName}`,
          name: moduleName,
          reason: `missing prompt binding for ${moduleName}`,
        })),
        error: {
          code: 'DEPENDENCY_BLOCKED',
          message: 'assistant bindings are incomplete',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'blocked',
          version: getAssistantVersion(assistant),
          modifiedAt: assistant.updatedAt || null,
          summary: buildAssistantSummaryForWriteBack(assistant),
        }),
      });
    }

    const nextAssistant = publishAssistantProfile(assistantId);
    safeRecordGovernanceAuditEntry({
      entityType: 'assistant',
      targetId: assistantId,
      targetName:
        nextAssistant?.assistantName || nextAssistant?.name || assistant.assistantName || assistant.name || assistantId,
      action: 'publish',
      actor: 'assistant-center',
      before: assistant,
      after: nextAssistant,
      metadata: {
        route: 'assistant-center',
      },
    });
    return sendAssistantMutationSuccess(res, {
      message: 'AssistantCenter 发布成功',
      action: 'publish',
      assistant: nextAssistant,
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'AssistantCenter 发布失败',
      action: 'publish',
      targetType: 'assistant',
      targetId: req.params?.assistantId || '',
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }
};

router.post('/assistant-center/assistants/:assistantId/publish', publishAssistantHandler);
router.post('/assistant-center/publish/:assistantId', publishAssistantHandler);

router.post('/assistant-center/assistants/:assistantId/activate', async (req, res) => {
  try {
    const assistantId = toNonEmptyString(req.params.assistantId || req.body?.assistantId);
    const { assistant, failure } = requireAssistant(assistantId);
    const previousActiveAssistantId = resolveActiveAssistantId(readSettings());

    if (!assistant) {
      return sendGovernanceFailure(res, {
        ...failure,
        action: 'activate',
      });
    }

    const activationResult = await activateAssistantInSettings(assistant, req);
    safeRecordGovernanceAuditEntry({
      entityType: 'assistant',
      targetId: assistantId,
      targetName: assistant.assistantName || assistant.name || assistantId,
      action: 'activate',
      actor: 'assistant-center',
      before: getAssistantById(previousActiveAssistantId),
      after: assistant,
      metadata: {
        previousActiveAssistantId,
        nextActiveAssistantId: assistantId,
        activeAnalyzePromptId: assistant.defaultModuleBindings?.analyze || null,
        route: 'assistant-center',
      },
    });

    return sendGovernanceSuccess(res, {
      message: 'AssistantCenter 激活成功',
      action: 'activate',
      targetType: 'assistant',
      targetId: assistantId,
      data: {
        detail: buildAssistantGovernanceDetail(assistantId),
        settingsPersistence: {
          persistedToDatabase: activationResult.persistedToDatabase === true,
        },
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        version: getAssistantVersion(assistant),
        modifiedAt: assistant.updatedAt || null,
        summary: {
          ...buildAssistantSummaryForWriteBack(assistant),
          activeFlag: true,
        },
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'AssistantCenter 激活失败',
      action: 'activate',
      targetType: 'assistant',
      targetId: req.params?.assistantId || '',
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

const deleteAssistantHandler = async (req, res) => {
  try {
    const assistantId = toNonEmptyString(req.params.assistantId || req.body?.assistantId);
    const { assistant, failure } = requireAssistant(assistantId);

    if (!assistant) {
      return sendGovernanceFailure(res, {
        ...failure,
        action: 'delete',
      });
    }

    const settings = readSettings();
    if (toNonEmptyString(settings.assistant?.activeAssistantId) === assistantId) {
      return sendGovernanceBlocked(res, {
        message: 'active assistant cannot be deleted',
        action: 'delete',
        targetType: 'assistant',
        targetId: assistantId,
        blockers: [
          {
            type: 'active-assistant',
            id: assistantId,
            name: assistant.assistantName || assistantId,
            reason: 'assistant is currently active',
          },
        ],
        error: {
          code: 'DEPENDENCY_BLOCKED',
          message: 'active assistant cannot be deleted',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'blocked',
          version: getAssistantVersion(assistant),
          modifiedAt: assistant.updatedAt || null,
          summary: buildAssistantSummaryForWriteBack(assistant),
        }),
      });
    }

    if (assistant.publishState === 'published') {
      return sendGovernanceBlocked(res, {
        message: 'published assistant cannot be deleted directly',
        action: 'delete',
        targetType: 'assistant',
        targetId: assistantId,
        blockers: [
          {
            type: 'published-assistant',
            id: assistantId,
            name: assistant.assistantName || assistantId,
            reason: 'assistant is currently published',
          },
        ],
        error: {
          code: 'DEPENDENCY_BLOCKED',
          message: 'published assistant cannot be deleted directly',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'blocked',
          version: getAssistantVersion(assistant),
          modifiedAt: assistant.updatedAt || null,
          summary: buildAssistantSummaryForWriteBack(assistant),
        }),
      });
    }

    removeAssistantProfile(assistantId);
    safeRecordGovernanceAuditEntry({
      entityType: 'assistant',
      targetId: assistantId,
      targetName: assistant.assistantName || assistant.name || assistantId,
      action: 'delete',
      actor: 'assistant-center',
      before: assistant,
      metadata: {
        route: 'assistant-center',
      },
    });

    return sendGovernanceSuccess(res, {
      message: 'AssistantCenter 删除成功',
      action: 'delete',
      targetType: 'assistant',
      targetId: assistantId,
      data: {
        deleted: true,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        summary: {
          deleted: true,
          assistantId,
        },
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'AssistantCenter 删除失败',
      action: 'delete',
      targetType: 'assistant',
      targetId: req.params?.assistantId || '',
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }
};

router.post('/assistant-center/assistants/:assistantId/delete', deleteAssistantHandler);
router.post('/assistant-center/delete/:assistantId', deleteAssistantHandler);

router.get('/assistant-center/prompts', async (_req, res) => {
  return sendSuccess(res, {
    message: 'Prompt 列表获取成功',
    data: {
      items: listPromptGovernanceItems(),
    },
    meta: {
      responseContract: buildGovernanceInterfaceContract(['promptList']),
    },
  });
});

router.get('/assistant-center/prompts/:promptId', async (req, res) => {
  const { promptId = '' } = req.params;
  const detail = buildPromptGovernanceDetail(promptId);

  if (!detail) {
    return sendGovernanceFailure(res, requirePrompt(promptId).failure);
  }

  return sendSuccess(res, {
    message: 'Prompt 详情获取成功',
    data: {
      detail,
    },
    meta: {
      responseContract: buildGovernanceInterfaceContract(['promptDetail']),
    },
  });
});

router.get('/assistant-center/prompts/:promptId/history', async (req, res) => {
  const { promptId = '' } = req.params;
  const { prompt, failure } = requirePrompt(promptId);

  if (!prompt) {
    return sendGovernanceFailure(res, {
      ...failure,
      action: 'history',
    });
  }

  return sendSuccess(res, {
    message: 'Prompt 历史记录获取成功',
    data: {
      items: listGovernanceAuditEntries({
        entityType: 'prompt',
        targetId: promptId,
        limit: Number(req.query?.limit || 20) || 20,
      }),
    },
    meta: {
      responseContract: buildGovernanceInterfaceContract(['promptHistory']),
    },
  });
});

router.post('/assistant-center/prompts', async (req, res) => {
  try {
    const promptPayload = parsePromptPayload(req.body?.prompt || req.body || {});
    const fieldErrors = validatePromptPayload(promptPayload);

    if (fieldErrors.length > 0) {
      return sendGovernanceFailure(res, {
        status: 400,
        message: 'Prompt 创建校验失败',
        action: 'create',
        targetType: 'prompt',
        targetId: promptPayload.promptId || '',
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Prompt 创建校验失败',
          fieldErrors,
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    const prompt = createPromptRecord(promptPayload);
    safeRecordGovernanceAuditEntry({
      entityType: 'prompt',
      targetId: prompt.id,
      targetName: prompt.name || prompt.id,
      action: 'create',
      actor: 'assistant-center',
      after: prompt,
      metadata: {
        route: 'assistant-center',
      },
    });
    return sendPromptMutationSuccess(res, {
      message: 'Prompt 创建成功',
      action: 'create',
      prompt,
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'Prompt 创建失败',
      action: 'create',
      targetType: 'prompt',
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

router.post('/assistant-center/prompts/:promptId/update', async (req, res) => {
  try {
    const promptId = toNonEmptyString(req.params.promptId || req.body?.promptId);
    const { prompt, failure } = requirePrompt(promptId);

    if (!prompt) {
      return sendGovernanceFailure(res, {
        ...failure,
        action: 'update',
      });
    }

    const promptPayload = parsePromptPayload(req.body?.prompt || req.body || {});
    const incomingVersion = Number(
      req.body?.recordVersion ?? req.body?.prompt?.recordVersion ?? prompt.recordVersion,
    );

    if (incomingVersion !== getPromptRecordVersion(prompt)) {
      return sendGovernanceFailure(res, {
        status: 409,
        message: 'prompt version conflict',
        action: 'update',
        targetType: 'prompt',
        targetId: promptId,
        error: {
          code: 'VERSION_CONFLICT',
          message: 'prompt version conflict',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
          version: getPromptRecordVersion(prompt),
          modifiedAt: prompt.updatedAt || null,
          summary: buildPromptSummaryForWriteBack(prompt),
        }),
      });
    }

    const fieldErrors = validatePromptPayload(promptPayload);
    if (fieldErrors.length > 0) {
      return sendGovernanceFailure(res, {
        status: 400,
        message: 'Prompt 保存校验失败',
        action: 'update',
        targetType: 'prompt',
        targetId: promptId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Prompt 保存校验失败',
          fieldErrors,
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
          version: getPromptRecordVersion(prompt),
          modifiedAt: prompt.updatedAt || null,
          summary: buildPromptSummaryForWriteBack(prompt),
        }),
      });
    }

    const nextPrompt = updatePromptRecord(promptId, promptPayload);
    safeRecordGovernanceAuditEntry({
      entityType: 'prompt',
      targetId: promptId,
      targetName: nextPrompt?.name || prompt.name || promptId,
      action: 'update',
      actor: 'assistant-center',
      before: prompt,
      after: nextPrompt,
      metadata: {
        route: 'assistant-center',
      },
    });
    return sendPromptMutationSuccess(res, {
      message: 'Prompt 保存成功',
      action: 'update',
      prompt: nextPrompt,
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'Prompt 保存失败',
      action: 'update',
      targetType: 'prompt',
      targetId: req.params?.promptId || '',
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

router.post('/assistant-center/prompts/:promptId/publish', async (req, res) => {
  try {
    const promptId = toNonEmptyString(req.params.promptId || req.body?.promptId);
    const { prompt, failure } = requirePrompt(promptId);

    if (!prompt) {
      return sendGovernanceFailure(res, {
        ...failure,
        action: 'publish',
      });
    }

    const nextPrompt = publishPromptRecord(promptId);
    safeRecordGovernanceAuditEntry({
      entityType: 'prompt',
      targetId: promptId,
      targetName: nextPrompt?.name || prompt.name || promptId,
      action: 'publish',
      actor: 'assistant-center',
      before: prompt,
      after: nextPrompt,
      metadata: {
        route: 'assistant-center',
      },
    });
    return sendPromptMutationSuccess(res, {
      message: 'Prompt 发布成功',
      action: 'publish',
      prompt: nextPrompt,
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'Prompt 发布失败',
      action: 'publish',
      targetType: 'prompt',
      targetId: req.params?.promptId || '',
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

router.post('/assistant-center/prompts/:promptId/delete', async (req, res) => {
  try {
    const promptId = toNonEmptyString(req.params.promptId || req.body?.promptId);
    const { prompt, failure } = requirePrompt(promptId);

    if (!prompt) {
      return sendGovernanceFailure(res, {
        ...failure,
        action: 'delete',
      });
    }

    const usageSummary = getPromptUsageSummary(promptId);
    if (usageSummary.assistantCount > 0) {
      return sendGovernanceBlocked(res, {
        message: 'prompt is still mounted by assistants',
        action: 'delete',
        targetType: 'prompt',
        targetId: promptId,
        blockers: usageSummary.usedBy.map((item) => ({
          type: 'assistant-binding',
          id: item.assistantId,
          name: item.assistantName,
          reason: `mounted in ${item.modules.join(', ')}`,
        })),
        error: {
          code: 'DEPENDENCY_BLOCKED',
          message: 'prompt is still mounted by assistants',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'blocked',
          version: getPromptRecordVersion(prompt),
          modifiedAt: prompt.updatedAt || null,
          summary: buildPromptSummaryForWriteBack(prompt),
        }),
      });
    }

    removePromptRecord(promptId);
    safeRecordGovernanceAuditEntry({
      entityType: 'prompt',
      targetId: promptId,
      targetName: prompt.name || promptId,
      action: 'delete',
      actor: 'assistant-center',
      before: prompt,
      metadata: {
        route: 'assistant-center',
      },
    });

    return sendGovernanceSuccess(res, {
      message: 'Prompt 删除成功',
      action: 'delete',
      targetType: 'prompt',
      targetId: promptId,
      data: {
        deleted: true,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        summary: {
          deleted: true,
          promptId,
        },
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'Prompt 删除失败',
      action: 'delete',
      targetType: 'prompt',
      targetId: req.params?.promptId || '',
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
