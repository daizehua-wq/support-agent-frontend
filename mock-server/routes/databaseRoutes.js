import { Router } from 'express';
import { nowLocalIso } from '../utils/localTime.js';
import {
  buildWriteBackPayload,
  sendGovernanceSuccess,
  sendGovernanceFailure,
  sendGovernanceBlocked,
} from '../services/responseService.js';
import {
  getDefaultSettings,
  mergeSettingsPreserveApiKeys,
  readSettings,
  saveSettings,
} from '../services/settingsService.js';
import {
  testDatabaseConnection,
  createPhysicalDatabase,
  deletePhysicalDatabase,
  getSettingsFromDatabase,
  saveSettingsToDatabase,
  buildDatabaseSummary,
  buildDatabaseDetail,
  buildDatabaseReference,
  buildAccountDatabaseBinding,
  buildDatabaseReserved,
  normalizeDatabaseType,
} from '../services/databaseService.js';
import {
  buildExternalDataSourceResponseSummary,
  createExternalDataSource,
  deleteExternalDataSource,
  getExternalDataSourceDetail,
  getExternalDataSourceRuntimeDetail,
  healthCheckExternalDataSource,
  listExternalDataSources,
  updateExternalDataSource,
} from '../services/externalDataSourceService.js';
import {
  runPythonExternalSourceDownload,
  runPythonExternalSourceFetch,
  runPythonExternalSourceQuery,
} from '../services/pythonRuntimeAdapterService.js';
const router = Router();

// =========================
// 数据接口｜DatabaseManager
// 这组接口当前只承接：
// - 数据库列表
// - 数据库详情
// - 数据库轻绑定关系
// - 预留字段位
// 同时向治理态闭环演进：
// - create / update / delete
// - health-check
// - light-bindings-save
// =========================

const DEFAULT_SETTINGS = getDefaultSettings();

const getDatabaseConfigs = (settings = {}) => {
  if (Array.isArray(settings.databases)) {
    return settings.databases;
  }

  if (settings.database && Object.keys(settings.database).length > 0) {
    return [settings.database];
  }

  return [];
};

const buildSettingsStoreConfig = (settings = {}) => ({
  ...DEFAULT_SETTINGS.database,
  ...(settings.database || {}),
});

const sendSuccess = (res, payload) =>
  res.json({
    success: true,
    ...payload,
  });

const sendNotFound = (res, message) =>
  res.status(404).json({
    success: false,
    message,
  });

const buildDatabaseInterfaceContract = (primary = []) => ({
  primary,
  compatibility: [],
  frozenLegacy: [],
  retirementPlanned: [],
});

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const buildDatabaseGovernanceSummary = (databaseConfig = {}, connectionMeta = {}) => {
  const summary = buildDatabaseSummary(databaseConfig, connectionMeta);

  return {
    ...summary,
    version: typeof databaseConfig.version === 'number' ? databaseConfig.version : 1,
    modifiedAt: databaseConfig.modifiedAt || null,
    lightBindingSummary:
      databaseConfig.lightBindingSummary && typeof databaseConfig.lightBindingSummary === 'object'
        ? databaseConfig.lightBindingSummary
        : {},
  };
};

const buildDatabaseGovernanceDetail = (databaseConfig = {}, connectionMeta = {}) => ({
  ...buildDatabaseDetail(databaseConfig, connectionMeta),
  version: typeof databaseConfig.version === 'number' ? databaseConfig.version : 1,
  modifiedAt: databaseConfig.modifiedAt || null,
  lightBindingSummary:
    databaseConfig.lightBindingSummary && typeof databaseConfig.lightBindingSummary === 'object'
      ? databaseConfig.lightBindingSummary
      : {},
});

const getDatabaseGovernanceState = async () => {
  const localSettings = readSettings();
  const settingsStoreConfig = buildSettingsStoreConfig(localSettings);
  let persistedSettings = localSettings;

  try {
    persistedSettings = await getSettingsFromDatabase(DEFAULT_SETTINGS, settingsStoreConfig);
  } catch (error) {
    console.warn(
      '[database-manager] load from database failed, fallback to local settings:',
      error.message,
    );
  }

  const currentSettings = mergeSettingsPreserveApiKeys(persistedSettings, localSettings);
  const databaseConfigs = getDatabaseConfigs(currentSettings);

  return {
    currentSettings,
    databaseConfigs,
    settingsStoreConfig: buildSettingsStoreConfig(currentSettings),
  };
};

const syncActiveDatabaseConfig = (currentSettings = {}, nextDatabaseConfigs = []) => {
  const activeDatabaseConfig = buildSettingsStoreConfig(currentSettings);
  const activeDatabaseId = buildDatabaseReference(activeDatabaseConfig).databaseId;
  const matchedConfig = nextDatabaseConfigs.find(
    (item) => buildDatabaseReference(item).databaseId === activeDatabaseId,
  );

  if (!matchedConfig) {
    return activeDatabaseConfig;
  }

  return {
    ...activeDatabaseConfig,
    ...matchedConfig,
    databaseType:
      matchedConfig.databaseType ||
      matchedConfig.dbType ||
      activeDatabaseConfig.databaseType ||
      activeDatabaseConfig.dbType ||
      'sqlite',
  };
};

const persistDatabaseGovernanceState = async (currentSettings = {}, nextDatabaseConfigs = []) => {
  const nextSettings = {
    ...currentSettings,
    database: syncActiveDatabaseConfig(currentSettings, nextDatabaseConfigs),
    databases: Array.isArray(nextDatabaseConfigs) ? nextDatabaseConfigs : [],
  };
  const settingsStoreConfig = buildSettingsStoreConfig(nextSettings);
  let persistedSettings = nextSettings;

  try {
    const savedSettings = await saveSettingsToDatabase(
      nextSettings,
      DEFAULT_SETTINGS,
      settingsStoreConfig,
    );
    persistedSettings = mergeSettingsPreserveApiKeys(savedSettings, nextSettings);
  } catch (error) {
    console.warn(
      '[database-manager] save to database failed, fallback to local only:',
      error.message,
    );
  }

  saveSettings(persistedSettings);
  return persistedSettings;
};

const findDatabaseById = (databaseConfigs = [], databaseId = '') =>
  databaseConfigs.find((item) => buildDatabaseReference(item).databaseId === databaseId);

const findDatabaseIndexById = (databaseConfigs = [], databaseId = '') =>
  databaseConfigs.findIndex((item) => buildDatabaseReference(item).databaseId === databaseId);

const resolveDeleteMode = (payload = {}) => {
  if (
    payload?.deleteMode === 'drop-remote' ||
    payload?.mode === 'drop-remote' ||
    payload?.dropRemote === true
  ) {
    return 'drop-remote';
  }

  return 'config-only';
};

const resolveCreateMode = (payload = {}) => {
  if (
    payload?.createMode === 'create-remote' ||
    payload?.mode === 'create-remote' ||
    payload?.createRemote === true
  ) {
    return 'create-remote';
  }

  return 'register-only';
};

const mergeSecretField = (currentValue, incomingValue) => {
  if (incomingValue === undefined) {
    return currentValue || '';
  }

  if (typeof incomingValue === 'string' && incomingValue === '') {
    return currentValue || '';
  }

  return incomingValue;
};

const pruneDeletedDatabaseReferences = (databaseConfigs = [], deletedDatabaseId = '') =>
  databaseConfigs
    .filter((item) => buildDatabaseReference(item).databaseId !== deletedDatabaseId)
    .map((item) => {
      const currentBinding =
        item?.lightBindingSummary && typeof item.lightBindingSummary === 'object'
          ? item.lightBindingSummary
          : null;

      if (!currentBinding) {
        return item;
      }

      const nextVisibleDatabases = Array.isArray(currentBinding.visibleDatabases)
        ? currentBinding.visibleDatabases.filter((databaseId) => databaseId !== deletedDatabaseId)
        : currentBinding.visibleDatabases;

      return {
        ...item,
        lightBindingSummary: {
          ...currentBinding,
          defaultAssociatedDatabase:
            currentBinding.defaultAssociatedDatabase === deletedDatabaseId
              ? null
              : currentBinding.defaultAssociatedDatabase,
          visibleDatabases: nextVisibleDatabases,
        },
      };
    });

const validateDatabaseDraft = (draft = {}) => {
  const fieldErrors = [];
  const dbType = normalizeDatabaseType(draft.databaseType || draft.dbType || 'sqlite');

  if (!(draft.databaseName || '').trim()) {
    fieldErrors.push({
      field: 'databaseName',
      message: 'databaseName is required',
    });
  }

  if (dbType !== 'sqlite' && !(draft.host || '').trim()) {
    fieldErrors.push({
      field: 'host',
      message: 'host is required',
    });
  }

  if (dbType !== 'sqlite' && !(String(draft.port || '')).trim()) {
    fieldErrors.push({
      field: 'port',
      message: 'port is required',
    });
  }

  if (!((draft.databaseType || draft.dbType || '').trim())) {
    fieldErrors.push({
      field: 'databaseType',
      message: 'databaseType is required',
    });
  } else if (!['sqlite', 'mysql', 'postgres'].includes(dbType)) {
    fieldErrors.push({
      field: 'databaseType',
      message: 'databaseType must be sqlite, mysql or postgres',
    });
  }

  if (dbType !== 'sqlite' && !(draft.username || '').trim()) {
    fieldErrors.push({
      field: 'username',
      message: 'username is required',
    });
  }

  return fieldErrors;
};

// 数据接口｜数据库列表
router.get('/databases', async (_req, res, next) => {
  try {
    const { databaseConfigs } = await getDatabaseGovernanceState();

    const items = await Promise.all(
      databaseConfigs.map(async (databaseConfig) => {
        const connectionResult = await testDatabaseConnection(databaseConfig);

        return buildDatabaseGovernanceSummary(databaseConfig, {
          connectionStatus: connectionResult.connectionStatus,
          availabilityStatus: connectionResult.availabilityStatus,
          lastCheckedAt: connectionResult.lastCheckedAt,
          healthMessage: connectionResult.healthMessage,
        });
      }),
    );

    return sendSuccess(res, {
      message: '数据库列表获取成功',
      data: items,
      meta: {
        responseContract: buildDatabaseInterfaceContract(['databaseSummaryList']),
      },
    });
  } catch (error) {
    return next(error);
  }
});

// 数据接口｜数据库详情 + 轻绑定 + 预留字段
router.get('/databases/:databaseId', async (req, res, next) => {
  try {
    const { databaseConfigs } = await getDatabaseGovernanceState();
    const { databaseId } = req.params;
    const targetDatabaseConfig = findDatabaseById(databaseConfigs, databaseId);

    if (!targetDatabaseConfig) {
      return sendNotFound(res, 'Database not found');
    }

    const connectionResult = await testDatabaseConnection(targetDatabaseConfig);

    return sendSuccess(res, {
      message: '数据库详情获取成功',
      data: {
        detail: buildDatabaseGovernanceDetail(targetDatabaseConfig, {
          connectionStatus: connectionResult.connectionStatus,
          availabilityStatus: connectionResult.availabilityStatus,
          lastCheckedAt: connectionResult.lastCheckedAt,
          healthMessage: connectionResult.healthMessage,
        }),
        binding: buildAccountDatabaseBinding(targetDatabaseConfig, 'default', databaseConfigs),
        reserved: buildDatabaseReserved(targetDatabaseConfig),
      },
      meta: {
        responseContract: buildDatabaseInterfaceContract([
          'databaseDetail',
          'databaseBinding',
          'databaseReserved',
        ]),
      },
    });
  } catch (error) {
    return next(error);
  }
});

// 数据接口｜帐号轻绑定关系摘要
router.get('/accounts/:accountId/database-binding', async (req, res, next) => {
  try {
    const { databaseConfigs } = await getDatabaseGovernanceState();
    const { accountId } = req.params;
    const targetDatabaseConfig =
      databaseConfigs.find(
        (item) =>
          item?.lightBindingSummary?.defaultAssociatedDatabase === buildDatabaseReference(item).databaseId,
      ) || databaseConfigs[0] || {};

    return sendSuccess(res, {
      message: '数据库轻绑定关系获取成功',
      data: buildAccountDatabaseBinding(
        targetDatabaseConfig,
        accountId || 'default',
        databaseConfigs,
      ),
      meta: {
        responseContract: buildDatabaseInterfaceContract(['databaseBinding']),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/databases/create', async (req, res) => {
  try {
    const payload = req.body || {};
    const databasePayload = payload.database || payload;
    const createMode = resolveCreateMode(databasePayload);
    const { currentSettings, databaseConfigs } = await getDatabaseGovernanceState();
    const now = nowLocalIso();
    const nextDatabaseType = (databasePayload.databaseType || databasePayload.dbType || '').trim();

    const nextDatabaseConfig = {
      ...databasePayload,
      databaseType: nextDatabaseType ? normalizeDatabaseType(nextDatabaseType) : '',
      databaseId:
        (databasePayload.databaseId || '').trim() ||
        (databasePayload.databaseName || '').trim() ||
        `database_${Date.now()}`,
      version: 1,
      modifiedAt: now,
      lightBindingSummary:
        databasePayload.lightBindingSummary && typeof databasePayload.lightBindingSummary === 'object'
          ? databasePayload.lightBindingSummary
          : {},
    };

    const fieldErrors = validateDatabaseDraft(nextDatabaseConfig);

    if (
      databaseConfigs.some(
        (item) => buildDatabaseReference(item).databaseId === nextDatabaseConfig.databaseId,
      )
    ) {
      fieldErrors.push({
        field: 'databaseId',
        message: 'databaseId already exists',
      });
    }

    if (fieldErrors.length > 0) {
      return sendGovernanceFailure(res, {
        status: 400,
        message: 'DatabaseManager 创建校验失败',
        action: 'create',
        targetType: 'database',
        targetId: nextDatabaseConfig.databaseId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'DatabaseManager 创建校验失败',
          fieldErrors,
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    const nextDatabaseConfigs = [...databaseConfigs, nextDatabaseConfig];

    let remoteCreateResult = {
      skipped: true,
      reason: 'register-only',
    };

    if (createMode === 'create-remote') {
      try {
        remoteCreateResult = await createPhysicalDatabase(nextDatabaseConfig);
      } catch (remoteCreateError) {
        return sendGovernanceFailure(res, {
          status: 500,
          message: 'DatabaseManager 创建失败',
          action: 'create',
          targetType: 'database',
          targetId: nextDatabaseConfig.databaseId,
          error: {
            code: 'REMOTE_CREATE_FAILED',
            message: remoteCreateError.message,
          },
          data: {
            createMode,
          },
          writeBack: buildWriteBackPayload({
            writeBackStatus: 'failed',
          }),
        });
      }
    }

    if (remoteCreateResult.blocked) {
      return sendGovernanceBlocked(res, {
        message: 'database creation is blocked',
        action: 'create',
        targetType: 'database',
        targetId: nextDatabaseConfig.databaseId,
        blockers: [
          {
            type: 'protected-system-database',
            id: nextDatabaseConfig.databaseId,
            name: nextDatabaseConfig.databaseName || nextDatabaseConfig.databaseId,
            reason: remoteCreateResult.reason || 'protected-system-database',
          },
        ],
        error: {
          code: 'REMOTE_DATABASE_PROTECTED',
          message: 'database creation is blocked',
        },
        data: {
          createMode,
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'blocked',
        }),
      });
    }

    if (remoteCreateResult.existed) {
      return sendGovernanceFailure(res, {
        status: 409,
        message: 'remote database already exists',
        action: 'create',
        targetType: 'database',
        targetId: nextDatabaseConfig.databaseId,
        error: {
          code: 'REMOTE_DATABASE_ALREADY_EXISTS',
          message: 'remote database already exists',
        },
        data: {
          createMode,
          remoteCreateResult,
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    try {
      await persistDatabaseGovernanceState(currentSettings, nextDatabaseConfigs);
    } catch (persistError) {
      if (createMode === 'create-remote') {
        try {
          await deletePhysicalDatabase(nextDatabaseConfig);
        } catch (_rollbackError) {
          // no-op
        }
      }

      throw persistError;
    }

    return sendGovernanceSuccess(res, {
      message:
        createMode === 'create-remote'
          ? 'DatabaseManager 创建成功'
          : 'DatabaseManager 接入成功',
      action: 'create',
      targetType: 'database',
      targetId: nextDatabaseConfig.databaseId,
      data: {
        detail: buildDatabaseGovernanceDetail(nextDatabaseConfig),
        createMode,
        remoteCreateResult,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        version: 1,
        modifiedAt: now,
        summary: buildDatabaseGovernanceSummary(nextDatabaseConfig),
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'DatabaseManager 创建失败',
      action: 'create',
      targetType: 'database',
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

router.post('/databases/:databaseId/update', async (req, res) => {
  try {
    const { databaseId = '' } = req.params;
    const payload = req.body || {};
    const databasePayload = payload.database || payload;
    const { currentSettings, databaseConfigs } = await getDatabaseGovernanceState();
    const index = findDatabaseIndexById(databaseConfigs, databaseId);

    if (index === -1) {
      return sendGovernanceFailure(res, {
        status: 404,
        message: 'database not found',
        action: 'update',
        targetType: 'database',
        targetId: databaseId,
        error: {
          code: 'NOT_FOUND',
          message: 'database not found',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    const currentDatabaseConfig = databaseConfigs[index];
    const currentVersion =
      typeof currentDatabaseConfig.version === 'number' ? currentDatabaseConfig.version : 1;
    const incomingVersion = Number(databasePayload.version ?? currentVersion);
    const nextDatabaseType = (databasePayload.databaseType || databasePayload.dbType || '').trim();

    if (incomingVersion !== currentVersion) {
      return sendGovernanceFailure(res, {
        status: 409,
        message: 'database version conflict',
        action: 'update',
        targetType: 'database',
        targetId: databaseId,
        error: {
          code: 'VERSION_CONFLICT',
          message: 'database version conflict',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
          version: currentVersion,
          modifiedAt: currentDatabaseConfig.modifiedAt || null,
          summary: buildDatabaseGovernanceSummary(currentDatabaseConfig),
        }),
      });
    }

    const now = nowLocalIso();
    const nextDatabaseConfig = {
      ...currentDatabaseConfig,
      ...databasePayload,
      databaseId,
      databaseType: nextDatabaseType
        ? normalizeDatabaseType(nextDatabaseType)
        : currentDatabaseConfig.databaseType || currentDatabaseConfig.dbType || '',
      password: mergeSecretField(currentDatabaseConfig.password, databasePayload.password),
      adminPassword:
        databasePayload.adminUsername === ''
          ? ''
          : mergeSecretField(currentDatabaseConfig.adminPassword, databasePayload.adminPassword),
      version: currentVersion + 1,
      modifiedAt: now,
      lightBindingSummary:
        databasePayload.lightBindingSummary && typeof databasePayload.lightBindingSummary === 'object'
          ? databasePayload.lightBindingSummary
          : currentDatabaseConfig.lightBindingSummary &&
              typeof currentDatabaseConfig.lightBindingSummary === 'object'
            ? currentDatabaseConfig.lightBindingSummary
            : {},
    };

    const fieldErrors = validateDatabaseDraft(nextDatabaseConfig);

    if (fieldErrors.length > 0) {
      return sendGovernanceFailure(res, {
        status: 400,
        message: 'DatabaseManager 保存校验失败',
        action: 'update',
        targetType: 'database',
        targetId: databaseId,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'DatabaseManager 保存校验失败',
          fieldErrors,
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
          version: currentVersion,
          modifiedAt: currentDatabaseConfig.modifiedAt || null,
          summary: buildDatabaseGovernanceSummary(currentDatabaseConfig),
        }),
      });
    }

    const nextDatabaseConfigs = [...databaseConfigs];
    nextDatabaseConfigs[index] = nextDatabaseConfig;
    await persistDatabaseGovernanceState(currentSettings, nextDatabaseConfigs);

    return sendGovernanceSuccess(res, {
      message: 'DatabaseManager 保存成功',
      action: 'update',
      targetType: 'database',
      targetId: databaseId,
      data: {
        detail: buildDatabaseGovernanceDetail(nextDatabaseConfig),
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        version: nextDatabaseConfig.version,
        modifiedAt: now,
        summary: buildDatabaseGovernanceSummary(nextDatabaseConfig),
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'DatabaseManager 保存失败',
      action: 'update',
      targetType: 'database',
      targetId: req.params?.databaseId || '',
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

router.post('/databases/:databaseId/delete', async (req, res) => {
  try {
    const { databaseId = '' } = req.params;
    const payload = req.body || {};
    const deleteMode = resolveDeleteMode(payload);
    const { currentSettings, databaseConfigs, settingsStoreConfig } =
      await getDatabaseGovernanceState();
    const targetDatabaseConfig = findDatabaseById(databaseConfigs, databaseId);

    if (!targetDatabaseConfig) {
      return sendGovernanceFailure(res, {
        status: 404,
        message: 'database not found',
        action: 'delete',
        targetType: 'database',
        targetId: databaseId,
        error: {
          code: 'NOT_FOUND',
          message: 'database not found',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    const activeDatabaseId = buildDatabaseReference(settingsStoreConfig).databaseId;
    if (activeDatabaseId === databaseId) {
      return sendGovernanceBlocked(res, {
        message: 'active settings database cannot be deleted',
        action: 'delete',
        targetType: 'database',
        targetId: databaseId,
        blockers: [
          {
            type: 'active-settings-store',
            id: databaseId,
            name: targetDatabaseConfig.databaseName || databaseId,
            reason: 'current settings storage still points to this database',
          },
        ],
        error: {
          code: 'ACTIVE_STORE_BLOCKED',
          message: 'active settings database cannot be deleted',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'blocked',
          version:
            typeof targetDatabaseConfig.version === 'number' ? targetDatabaseConfig.version : 1,
          modifiedAt: targetDatabaseConfig.modifiedAt || null,
          summary: buildDatabaseGovernanceSummary(targetDatabaseConfig),
        }),
      });
    }

    const savedLightBindingSummary =
      targetDatabaseConfig.lightBindingSummary &&
      typeof targetDatabaseConfig.lightBindingSummary === 'object'
        ? targetDatabaseConfig.lightBindingSummary
        : {};
    const isDefaultAssociated =
      savedLightBindingSummary.defaultAssociatedDatabase === databaseId;
    const isVisibleAssociated = Array.isArray(savedLightBindingSummary.visibleDatabases)
      ? savedLightBindingSummary.visibleDatabases.includes(databaseId)
      : false;

    if (!payload.force && (isDefaultAssociated || isVisibleAssociated)) {
      return sendGovernanceBlocked(res, {
        message: 'database binding must be removed before delete',
        action: 'delete',
        targetType: 'database',
        targetId: databaseId,
        blockers: [
          {
            type: 'database-binding',
            id: databaseId,
            name: targetDatabaseConfig.databaseName || databaseId,
            reason: 'saved lightBindingSummary still points to this database',
          },
        ],
        error: {
          code: 'DEPENDENCY_BLOCKED',
          message: 'database binding must be removed before delete',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'blocked',
          version:
            typeof targetDatabaseConfig.version === 'number' ? targetDatabaseConfig.version : 1,
          modifiedAt: targetDatabaseConfig.modifiedAt || null,
          summary: buildDatabaseGovernanceSummary(targetDatabaseConfig),
        }),
      });
    }

    const nextDatabaseConfigs = pruneDeletedDatabaseReferences(databaseConfigs, databaseId);

    try {
      await persistDatabaseGovernanceState(currentSettings, nextDatabaseConfigs);
    } catch (persistError) {
      return sendGovernanceFailure(res, {
        status: 500,
        message: 'DatabaseManager 删除失败',
        action: 'delete',
        targetType: 'database',
        targetId: databaseId,
        error: {
          code: 'CONFIG_PERSIST_FAILED',
          message: persistError.message,
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    if (deleteMode !== 'drop-remote') {
      return sendGovernanceSuccess(res, {
        message: 'DatabaseManager 配置移除成功',
        action: 'delete',
        targetType: 'database',
        targetId: databaseId,
        data: {
          deleted: true,
          deleteMode,
          remoteDeleteResult: {
            skipped: true,
            reason: 'config-only',
          },
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'success',
        }),
      });
    }

    let remoteDeleteResult = null;

    try {
      remoteDeleteResult = await deletePhysicalDatabase(targetDatabaseConfig);
    } catch (remoteDeleteError) {
      try {
        await persistDatabaseGovernanceState(currentSettings, databaseConfigs);
      } catch (_rollbackError) {
        // no-op
      }

      return sendGovernanceFailure(res, {
        status: 500,
        message: 'DatabaseManager 删除失败',
        action: 'delete',
        targetType: 'database',
        targetId: databaseId,
        error: {
          code: 'REMOTE_DELETE_FAILED',
          message: remoteDeleteError.message,
        },
        data: {
          deleteMode,
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    if (remoteDeleteResult?.blocked) {
      try {
        await persistDatabaseGovernanceState(currentSettings, databaseConfigs);
      } catch (_rollbackError) {
        // no-op
      }

      return sendGovernanceBlocked(res, {
        message: 'database deletion is blocked',
        action: 'delete',
        targetType: 'database',
        targetId: databaseId,
        blockers: [
          {
            type: 'protected-system-database',
            id: databaseId,
            name: targetDatabaseConfig.databaseName || databaseId,
            reason: remoteDeleteResult.reason || 'protected-system-database',
          },
        ],
        error: {
          code: 'REMOTE_DATABASE_PROTECTED',
          message: 'database deletion is blocked',
        },
        data: {
          deleteMode,
          remoteDeleteResult,
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'blocked',
        }),
      });
    }

    return sendGovernanceSuccess(res, {
      message: 'DatabaseManager 删除成功',
      action: 'delete',
      targetType: 'database',
      targetId: databaseId,
      data: {
        deleted: true,
        deleteMode,
        remoteDeleteResult,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        summary: {
          deleted: true,
          databaseId,
        },
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'DatabaseManager 删除失败',
      action: 'delete',
      targetType: 'database',
      targetId: req.params?.databaseId || '',
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

router.post('/databases/:databaseId/health-check', async (req, res) => {
  try {
    const { databaseId = '' } = req.params;
    const { currentSettings, databaseConfigs } = await getDatabaseGovernanceState();
    const index = findDatabaseIndexById(databaseConfigs, databaseId);

    if (index === -1) {
      return sendGovernanceFailure(res, {
        status: 404,
        message: 'database not found',
        action: 'health-check',
        targetType: 'database',
        targetId: databaseId,
        error: {
          code: 'NOT_FOUND',
          message: 'database not found',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    const targetDatabaseConfig = databaseConfigs[index];
    const result = await testDatabaseConnection(targetDatabaseConfig);
    const now = nowLocalIso();
    const nextDatabaseConfig = {
      ...targetDatabaseConfig,
      lastCheckedAt: result.lastCheckedAt || now,
      healthMessage: result.healthMessage || '',
      modifiedAt: now,
    };

    const nextDatabaseConfigs = [...databaseConfigs];
    nextDatabaseConfigs[index] = nextDatabaseConfig;
    await persistDatabaseGovernanceState(currentSettings, nextDatabaseConfigs);

    return sendGovernanceSuccess(res, {
      message: 'DatabaseManager 健康检查成功',
      action: 'health-check',
      targetType: 'database',
      targetId: databaseId,
      data: {
        result,
        detail: buildDatabaseGovernanceDetail(nextDatabaseConfig, {
          connectionStatus: result.connectionStatus,
          availabilityStatus: result.availabilityStatus,
          lastCheckedAt: result.lastCheckedAt,
          healthMessage: result.healthMessage,
        }),
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        version:
          typeof nextDatabaseConfig.version === 'number' ? nextDatabaseConfig.version : 1,
        modifiedAt: now,
        summary: buildDatabaseGovernanceSummary(nextDatabaseConfig),
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'DatabaseManager 健康检查失败',
      action: 'health-check',
      targetType: 'database',
      targetId: req.params?.databaseId || '',
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

router.post('/accounts/:accountId/database-binding/save', async (req, res) => {
  try {
    const { accountId = 'default' } = req.params;
    const payload = req.body || {};
    const { currentSettings, databaseConfigs } = await getDatabaseGovernanceState();
    const targetDatabaseId =
      payload.databaseId ||
      payload.targetDatabaseId ||
      (databaseConfigs[0] && buildDatabaseReference(databaseConfigs[0]).databaseId);
    const index = findDatabaseIndexById(databaseConfigs, targetDatabaseId || '');

    if (index === -1) {
      return sendGovernanceFailure(res, {
        status: 404,
        message: 'database not found',
        action: 'light-bindings-save',
        targetType: 'database',
        targetId: targetDatabaseId || accountId,
        error: {
          code: 'NOT_FOUND',
          message: 'database not found',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    const currentDatabaseConfig = databaseConfigs[index];
    const now = nowLocalIso();
    const nextBindingSummary =
      payload.lightBindingSummary && typeof payload.lightBindingSummary === 'object'
        ? payload.lightBindingSummary
        : currentDatabaseConfig.lightBindingSummary &&
            typeof currentDatabaseConfig.lightBindingSummary === 'object'
          ? currentDatabaseConfig.lightBindingSummary
          : {};

    const nextDatabaseConfig = {
      ...currentDatabaseConfig,
      lightBindingSummary: nextBindingSummary,
      modifiedAt: now,
    };

    const nextDatabaseConfigs = [...databaseConfigs];
    nextDatabaseConfigs[index] = nextDatabaseConfig;
    await persistDatabaseGovernanceState(currentSettings, nextDatabaseConfigs);

    return sendGovernanceSuccess(res, {
      message: 'DatabaseManager 轻绑定保存成功',
      action: 'light-bindings-save',
      targetType: 'database',
      targetId: buildDatabaseReference(nextDatabaseConfig).databaseId,
      data: {
        binding: buildAccountDatabaseBinding(nextDatabaseConfig, accountId, nextDatabaseConfigs),
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        version:
          typeof nextDatabaseConfig.version === 'number' ? nextDatabaseConfig.version : 1,
        modifiedAt: now,
        summary: buildDatabaseGovernanceSummary(nextDatabaseConfig),
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: 'DatabaseManager 轻绑定保存失败',
      action: 'light-bindings-save',
      targetType: 'database',
      targetId: req.params?.accountId || 'default',
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

router.get('/external-sources', (_req, res) => {
  const items = listExternalDataSources();

  return sendSuccess(res, {
    message: '外部数据源列表获取成功',
    data: {
      items,
      summary: buildExternalDataSourceResponseSummary(),
    },
    meta: {
      responseContract: buildDatabaseInterfaceContract(['externalSourceSummaryList']),
    },
  });
});

router.get('/external-sources/:sourceId', (req, res) => {
  const detail = getExternalDataSourceDetail(req.params?.sourceId || '');

  if (!detail) {
    return sendNotFound(res, 'External data source not found');
  }

  return sendSuccess(res, {
    message: '外部数据源详情获取成功',
    data: {
      detail,
    },
    meta: {
      responseContract: buildDatabaseInterfaceContract(['externalSourceDetail']),
    },
  });
});

router.post('/external-sources/create', (req, res) => {
  try {
    const result = createExternalDataSource(req.body || {});

    if (!result.success) {
      return sendGovernanceFailure(res, {
        status: result.error?.code === 'VALIDATION_ERROR' ? 400 : 500,
        message: '外部数据源创建失败',
        action: 'create',
        targetType: 'external-data-source',
        targetId: req.body?.id || req.body?.name || '',
        error: result.error,
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    return sendGovernanceSuccess(res, {
      message: '外部数据源创建成功',
      action: 'create',
      targetType: 'external-data-source',
      targetId: result.detail?.id || '',
      data: {
        detail: result.detail,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        version: result.detail?.version || 1,
        modifiedAt: result.detail?.lastCheckedAt || null,
        summary: result.detail || {},
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: '外部数据源创建失败',
      action: 'create',
      targetType: 'external-data-source',
      targetId: req.body?.id || req.body?.name || '',
      error: {
        code: error.message.includes('key management requires env')
          ? 'KEY_MANAGEMENT_REQUIRED'
          : 'EXECUTION_ERROR',
        message: error.message,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }
});

router.post('/external-sources/:sourceId/update', (req, res) => {
  const sourceId = req.params?.sourceId || '';
  try {
    const result = updateExternalDataSource(sourceId, req.body || {});

    if (!result.success) {
      return sendGovernanceFailure(res, {
        status:
          result.error?.code === 'NOT_FOUND'
            ? 404
            : result.error?.code === 'VERSION_CONFLICT'
              ? 409
              : result.error?.code === 'VALIDATION_ERROR'
                ? 400
                : 500,
        message: '外部数据源保存失败',
        action: 'update',
        targetType: 'external-data-source',
        targetId: sourceId,
        error: result.error,
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
          version: result.detail?.version || undefined,
          modifiedAt: result.detail?.lastCheckedAt || null,
          summary: result.detail || {},
        }),
      });
    }

    return sendGovernanceSuccess(res, {
      message: '外部数据源保存成功',
      action: 'update',
      targetType: 'external-data-source',
      targetId: sourceId,
      data: {
        detail: result.detail,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'success',
        version: result.detail?.version || 1,
        modifiedAt: result.detail?.lastCheckedAt || null,
        summary: result.detail || {},
      }),
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: '外部数据源保存失败',
      action: 'update',
      targetType: 'external-data-source',
      targetId: sourceId,
      error: {
        code: error.message.includes('key management requires env')
          ? 'KEY_MANAGEMENT_REQUIRED'
          : 'EXECUTION_ERROR',
        message: error.message,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }
});

router.post('/external-sources/:sourceId/delete', (req, res) => {
  const sourceId = req.params?.sourceId || '';
  const result = deleteExternalDataSource(sourceId);

  if (!result.success) {
    return sendGovernanceFailure(res, {
      status: result.error?.code === 'NOT_FOUND' ? 404 : 500,
      message: '外部数据源删除失败',
      action: 'delete',
      targetType: 'external-data-source',
      targetId: sourceId,
      error: result.error,
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }

  return sendGovernanceSuccess(res, {
    message: '外部数据源删除成功',
    action: 'delete',
    targetType: 'external-data-source',
    targetId: sourceId,
    data: {
      deleted: true,
    },
    writeBack: buildWriteBackPayload({
      writeBackStatus: 'success',
      summary: {
        deleted: true,
        sourceId,
      },
    }),
  });
});

router.post('/external-sources/:sourceId/health-check', (req, res) => {
  const sourceId = req.params?.sourceId || '';
  const result = healthCheckExternalDataSource(sourceId);

  if (!result.success) {
    return sendGovernanceFailure(res, {
      status: result.error?.code === 'NOT_FOUND' ? 404 : 500,
      message: '外部数据源检测失败',
      action: 'health-check',
      targetType: 'external-data-source',
      targetId: sourceId,
      error: result.error,
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }

  return sendGovernanceSuccess(res, {
    message: '外部数据源检测成功',
    action: 'health-check',
    targetType: 'external-data-source',
    targetId: sourceId,
    data: {
      detail: result.detail,
    },
    writeBack: buildWriteBackPayload({
      writeBackStatus: 'success',
      version: result.detail?.version || 1,
      modifiedAt: result.detail?.lastCheckedAt || null,
      summary: result.detail || {},
    }),
  });
});

const buildExternalSourceRuntimePayload = (sourceConfig = {}, requestBody = {}, fallbackPath = '') => {
  const payload = isPlainObject(requestBody) ? requestBody : {};
  const blockedFields = ['localEvidence', 'evidenceItems', 'internalData', 'attachments'];

  for (const field of blockedFields) {
    if (payload[field] !== undefined) {
      throw new Error(`field ${field} is not allowed for external source outbound requests`);
    }
  }

  const sessionId =
    (typeof payload.sessionId === 'string' && payload.sessionId.trim()) ||
    `external-source-${Date.now()}`;

  return {
    sessionId,
    source: {
      id: sourceConfig.id,
      name: sourceConfig.name,
      providerName: sourceConfig.providerName,
      sourceType: sourceConfig.sourceType,
      authType: sourceConfig.authType,
      enabled: sourceConfig.enabled !== false,
      baseUrl: sourceConfig.baseUrl,
      apiPath: sourceConfig.apiPath || fallbackPath,
      apiKey: sourceConfig.apiKey || '',
      username: sourceConfig.username || '',
      password: sourceConfig.password || '',
      capabilities: Array.isArray(sourceConfig.capabilities) ? sourceConfig.capabilities : [],
      allowedDomains: Array.isArray(sourceConfig.allowedDomains) ? sourceConfig.allowedDomains : [],
      publicDataOnly: sourceConfig.publicDataOnly !== false,
      localDataOutboundPolicy: sourceConfig.localDataOutboundPolicy || 'blocked',
    },
    query: payload.query,
    page: payload.page,
    pageSize: payload.pageSize,
    path: payload.path,
    apiPath: payload.apiPath,
    resourceUrl: payload.resourceUrl,
    resourcePath: payload.resourcePath,
    fileName: payload.fileName,
    httpMethod: payload.httpMethod,
    timeoutMs: payload.timeoutMs,
    queryParams: payload.queryParams,
    requestBody: payload.requestBody,
    headers: payload.headers,
  };
};

const handleExternalSourceRuntimeAction = async ({
  req,
  res,
  actionName = '',
  runtimeRunner = async () => ({}),
}) => {
  const sourceId = req.params?.sourceId || '';
  try {
    const sourceConfig = getExternalDataSourceRuntimeDetail(sourceId);

    if (!sourceConfig) {
      return sendGovernanceFailure(res, {
        status: 404,
        message: 'external data source not found',
        action: actionName,
        targetType: 'external-data-source',
        targetId: sourceId,
        error: {
          code: 'NOT_FOUND',
          message: 'external data source not found',
        },
        writeBack: buildWriteBackPayload({
          writeBackStatus: 'failed',
        }),
      });
    }

    const { currentSettings } = await getDatabaseGovernanceState();
    const runtimePayload = buildExternalSourceRuntimePayload(
      sourceConfig,
      req.body || {},
      sourceConfig.apiPath || '',
    );
    const result = await runtimeRunner({
      input: runtimePayload,
      context: {
        settings: currentSettings,
        requestPayload: runtimePayload,
      },
    });

    return sendSuccess(res, {
      message: `外部数据源${actionName}成功`,
      data: result,
      meta: {
        responseContract: buildDatabaseInterfaceContract([
          `externalSource.${actionName}`,
        ]),
      },
    });
  } catch (error) {
    return sendGovernanceFailure(res, {
      status: 500,
      message: `外部数据源${actionName}失败`,
      action: actionName,
      targetType: 'external-data-source',
      targetId: sourceId,
      error: {
        code: error.message.includes('key management requires env')
          ? 'KEY_MANAGEMENT_REQUIRED'
          : 'EXECUTION_ERROR',
        message: error.message,
      },
      writeBack: buildWriteBackPayload({
        writeBackStatus: 'failed',
      }),
    });
  }
};

router.post('/external-sources/:sourceId/query', async (req, res) => {
  return handleExternalSourceRuntimeAction({
    req,
    res,
    actionName: 'query',
    runtimeRunner: runPythonExternalSourceQuery,
  });
});

router.post('/external-sources/:sourceId/fetch', async (req, res) => {
  return handleExternalSourceRuntimeAction({
    req,
    res,
    actionName: 'fetch',
    runtimeRunner: runPythonExternalSourceFetch,
  });
});

router.post('/external-sources/:sourceId/download', async (req, res) => {
  return handleExternalSourceRuntimeAction({
    req,
    res,
    actionName: 'download',
    runtimeRunner: runPythonExternalSourceDownload,
  });
});

export default router;
