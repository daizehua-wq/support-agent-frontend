import { useEffect, useMemo, useState } from 'react';
import { Alert, Col, Form, Row, Spin, message } from 'antd';

import {
  createDatabase,
  createExternalDataSource,
  deleteDatabase,
  deleteExternalDataSource,
  downloadExternalDataSource,
  fetchExternalDataSource,
  getExternalDataSourceList,
  getDatabaseManagerDetail,
  getDatabaseManagerList,
  healthCheckDatabase,
  healthCheckExternalDataSource,
  queryExternalDataSource,
  saveLightBindings,
  updateExternalDataSource,
  updateDatabase,
  type ExternalDataSourceItem,
} from '../../api/databaseManager';
import DatabaseManagerDetailPanel from './components/DatabaseManagerDetailPanel';
import DatabaseManagerListPanel from './components/DatabaseManagerListPanel';
import DatabaseManagerModals from './components/DatabaseManagerModals';
import ExternalSourceManagerModal from './components/ExternalSourceManagerModal';
import ExternalSourceManagerPanel from './components/ExternalSourceManagerPanel';
import {
  buildExternalProviderTemplateFormValues,
  inferExternalProviderTemplateId,
  inferExternalSourceCategory,
  normalizeDatabaseTypeValue,
  usesNetworkConnectionFields,
  type DatabaseItem,
} from './helpers';
import { getApiErrorCode, getApiErrorMessage } from '../../utils/apiError';
import { formatDateTimeToLocalTime } from '../../utils/dateTime';

function hasApiErrorFields(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const directErrorFields = (error as { errorFields?: unknown }).errorFields;
  if (directErrorFields !== undefined) {
    return true;
  }

  const responseData = (
    error as {
      response?: {
        data?: {
          errorFields?: unknown;
        };
      };
    }
  ).response?.data;

  return responseData?.errorFields !== undefined;
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  const result = value.filter((item): item is string => typeof item === 'string');
  return result.length ? result : undefined;
}

function readRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readDatabaseId(value: unknown) {
  const record = readRecord(value);

  if (record) {
    return (
      readString(record.databaseId) ||
      readString(record.id) ||
      readString(record.databaseName) ||
      readString(record.name)
    );
  }

  return readString(value);
}

function readDatabaseIdArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  const result = value
    .map((item) => readDatabaseId(item))
    .filter((item): item is string => Boolean(item));

  return result.length ? result : undefined;
}

function normalizeDatabaseItem(value: unknown): DatabaseItem {
  const record = readRecord(value) || {};

  const healthStatus = readString(record.healthStatus);
  const availabilityStatus = readString(record.availabilityStatus);
  const connectionStatus = readString(record.connectionStatus);
  const explicitAvailable = readBoolean(record.available);
  const environment =
    readString(record.environment) ||
    readString(record.env) ||
    readString(record.stage) ||
    '默认环境';

  const host =
    readString(record.host) ||
    readString(record.hostname) ||
    readString(record.connectionHost) ||
    undefined;

  const port =
    typeof record.port === 'number' || typeof record.port === 'string'
      ? record.port
      : typeof record.connectionPort === 'number' || typeof record.connectionPort === 'string'
        ? record.connectionPort
        : undefined;
  const username =
    readString(record.username) ||
    readString(record.user) ||
    readString(record.databaseUser) ||
    undefined;
  const adminUsername =
    readString(record.adminUsername) || readString(record.adminUser) || undefined;
  const databaseFile =
    readString(record.databaseFile) || readString(record.path) || readString(record.filename);

  return {
    id:
      readString(record.id) ||
      readString(record.databaseId) ||
      readString(record.name) ||
      `db-${Date.now()}`,
    name:
      readString(record.name) ||
      readString(record.databaseName) ||
      readString(record.id) ||
      '未命名数据库',
    type:
      normalizeDatabaseTypeValue(
        readString(record.type) ||
          readString(record.databaseType) ||
          readString(record.dbType) ||
          readString(record.engine) ||
          '未返回',
      ) || '未返回',
    environment,
    host,
    port,
    username,
    adminUsername,
    hasPassword: readBoolean(record.hasPassword),
    hasAdminPassword: readBoolean(record.hasAdminPassword),
    databaseFile,
    version:
      typeof record.version === 'number'
        ? record.version
        : typeof record.databaseVersion === 'number'
          ? record.databaseVersion
          : undefined,
    available:
      explicitAvailable !== undefined
        ? explicitAvailable
        : availabilityStatus === 'available' ||
          availabilityStatus === 'healthy' ||
          connectionStatus === 'connected',
    healthStatus:
      healthStatus === 'healthy' || healthStatus === 'warning' || healthStatus === 'offline'
        ? healthStatus
        : availabilityStatus === 'available' || availabilityStatus === 'healthy'
          ? 'healthy'
          : connectionStatus === 'connected'
            ? 'warning'
            : 'offline',
    lastCheckedAt:
      readString(record.lastCheckedAt) ||
      readString(record.lastCheckTime) ||
      readString(record.updatedAt) ||
      '未返回',
    healthMessage:
      readString(record.healthMessage) ||
      readString(record.message) ||
      readString(record.lastHealthMessage),
    defaultAssociatedDatabase:
      readString(record.defaultAssociatedDatabase) ||
      readDatabaseId(record.defaultDatabase) ||
      readDatabaseId(record.defaultBindingDatabase),
    visibleDatabases:
      readStringArray(record.visibleDatabases) ||
      readDatabaseIdArray(record.visibleDatabases) ||
      readStringArray(record.visibleDatabaseIds) ||
      readDatabaseIdArray(record.visibleDatabaseIds),
    relationSource:
      readString(record.relationSource) ||
      readString(record.databaseRelationSource) ||
      readString(record.source),
    description:
      readString(record.description) ||
      readString(record.descriptionShort) ||
      readString(record.note) ||
      readString(record.summary),
  };
}

async function loadDatabaseListData() {
  const response = await getDatabaseManagerList();
  const responseData = readRecord(response.data as unknown) || {};
  const items =
    (Array.isArray(responseData.items) && responseData.items) ||
    (Array.isArray(responseData.list) && responseData.list) ||
    (Array.isArray(responseData.databases) && responseData.databases) ||
    (Array.isArray(response.data as unknown) ? (response.data as unknown[]) : []) ||
    [];

  return items.map(normalizeDatabaseItem);
}

async function loadDatabaseDetailData(databaseId: string) {
  const response = await getDatabaseManagerDetail(databaseId);
  const responseData = readRecord(response.data as unknown) || {};
  const detail = readRecord(responseData.detail) || {};
  const binding = readRecord(responseData.binding) || {};
  if (!detail || Object.keys(detail).length === 0) return undefined;

  return normalizeDatabaseItem({
    ...detail,
    defaultAssociatedDatabase:
      readString(binding.defaultAssociatedDatabase) ||
      readDatabaseId(binding.defaultDatabase) ||
      readDatabaseId(binding.defaultBindingDatabase) ||
      readString(detail.defaultAssociatedDatabase),
    visibleDatabases:
      readDatabaseIdArray(binding.visibleDatabases) ||
      readStringArray(binding.visibleDatabaseIds) ||
      readDatabaseIdArray(detail.visibleDatabases) ||
      readStringArray(detail.visibleDatabases),
    relationSource:
      readString(binding.relationSource) ||
      readString(binding.databaseRelationSource) ||
      readString(binding.bindingSource) ||
      readString(detail.relationSource),
  });
}

async function loadExternalSourceListData() {
  const response = await getExternalDataSourceList();
  const responseData = readRecord(response.data as unknown) || {};
  const items =
    (Array.isArray(responseData.items) && responseData.items) ||
    (Array.isArray(response.data as unknown) ? (response.data as unknown[]) : []) ||
    [];

  return (items as ExternalDataSourceItem[]).map((item) => ({
    ...item,
    lastCheckedAt: formatDateTimeToLocalTime(item.lastCheckedAt) || item.lastCheckedAt,
  }));
}

const mockDatabases: DatabaseItem[] = [
  {
    id: 'db_semicon_prod',
    name: '半导体生产数据库',
    type: 'mysql',
    environment: '生产',
    host: '127.0.0.1',
    port: 3306,
    username: 'root',
    hasPassword: true,
    version: 0,
    available: true,
    healthStatus: 'healthy',
    lastCheckedAt: '2026-04-12 10:30',
    healthMessage: '连接正常',
    defaultAssociatedDatabase: 'db_semicon_prod',
    visibleDatabases: ['db_semicon_prod', 'db_sales_support'],
    relationSource: '帐号默认关联',
    description: '承接半导体客户资料与业务数据查询。',
  },
  {
    id: 'db_sales_support',
    name: '销售支持数据库',
    type: 'postgres',
    environment: '测试',
    host: '127.0.0.1',
    port: 5432,
    username: 'postgres',
    hasPassword: true,
    version: 0,
    available: true,
    healthStatus: 'warning',
    lastCheckedAt: '2026-04-12 09:45',
    healthMessage: '连接可用，但存在轻微告警',
    defaultAssociatedDatabase: 'db_sales_support',
    visibleDatabases: ['db_sales_support'],
    relationSource: '系统默认可见',
    description: '承接销售支持场景测试数据。',
  },
  {
    id: 'db_archive_01',
    name: '历史归档数据库',
    type: 'mongodb',
    environment: '归档',
    host: '127.0.0.1',
    port: 27017,
    username: 'archive_reader',
    version: 0,
    available: false,
    healthStatus: 'offline',
    lastCheckedAt: '2026-04-11 21:00',
    healthMessage: '当前未连接',
    defaultAssociatedDatabase: '',
    visibleDatabases: ['db_archive_01'],
    relationSource: '人工指定可见',
    description: '仅供历史归档查询，不建议作为默认关联库。',
  },
];

const emptyDatabase: DatabaseItem = {
  id: '未返回',
  name: '未返回',
  type: '未返回',
  environment: '未返回',
  host: '未返回',
  port: '未返回',
  username: '未返回',
  adminUsername: '未返回',
  hasPassword: false,
  hasAdminPassword: false,
  databaseFile: '未返回',
  version: 0,
  available: false,
  healthStatus: 'offline',
  lastCheckedAt: '未返回',
  healthMessage: '未返回',
  defaultAssociatedDatabase: '未返回',
  visibleDatabases: [],
  relationSource: '未返回',
  description: '当前未返回数据库详情。',
};

function getDeleteFailureMessage(error: unknown, deleteMode: 'config-only' | 'drop-remote') {
  const code = getApiErrorCode(error);

  if (code === 'ACTIVE_STORE_BLOCKED') {
    return '当前数据库仍是平台配置存储库，暂不可删除';
  }

  if (code === 'DEPENDENCY_BLOCKED') {
    return '当前数据库仍被轻绑定引用，需先解除绑定后再删除';
  }

  if (code === 'REMOTE_DATABASE_PROTECTED') {
    return '该数据库属于受保护的系统库，平台已阻止远端删除';
  }

  if (code === 'REMOTE_DELETE_FAILED') {
    return deleteMode === 'drop-remote'
      ? `远端删库失败：${getApiErrorMessage(error, '请检查管理员连接信息')}`
      : '配置移除失败';
  }

  if (code === 'CONFIG_PERSIST_FAILED') {
    return '平台配置写回失败，请稍后重试';
  }

  return getApiErrorMessage(
    error,
    deleteMode === 'drop-remote' ? '远端删库失败' : '配置移除失败',
  );
}

function getCreateFailureMessage(error: unknown, createMode: 'register-only' | 'create-remote') {
  const code = getApiErrorCode(error);

  if (code === 'REMOTE_DATABASE_ALREADY_EXISTS') {
    return '远端数据库已存在。若只是接入已有数据库，请改用“仅登记配置”。';
  }

  if (code === 'REMOTE_DATABASE_PROTECTED') {
    return '该数据库属于受保护的系统库，平台已阻止创建。';
  }

  if (code === 'REMOTE_CREATE_FAILED') {
    return `远端建库失败：${getApiErrorMessage(error, '请检查管理员连接信息')}`;
  }

  if (code === 'VALIDATION_ERROR') {
    return getApiErrorMessage(error, 'DatabaseManager 创建校验失败');
  }

  return getApiErrorMessage(
    error,
    createMode === 'create-remote' ? '远端建库失败' : '数据库配置接入失败',
  );
}

function getExternalSourceRuntimeErrorMessage(error: unknown, actionLabel: string) {
  const code = getApiErrorCode(error);
  if (code === 'KEY_MANAGEMENT_REQUIRED') {
    return '未配置 SETTINGS_SECRET_MASTER_KEY，当前外部数据源凭据无法解密';
  }

  const rawMessage = getApiErrorMessage(error, '');
  if (
    rawMessage.includes('health-gate-blocked') ||
    rawMessage.includes('python-runtime') ||
    rawMessage.includes('fetch failed')
  ) {
    return `外部联调通道暂不可用，${actionLabel}未执行；Search 正式资料治理链路不受影响。`;
  }

  return rawMessage || getApiErrorMessage(error, `外部数据源${actionLabel}失败`);
}

function getExternalSourceRuntimeDegradedMessage(
  payload: Record<string, unknown> | undefined,
  actionLabel: string,
) {
  if (!payload || readBoolean(payload.degraded) !== true) {
    return '';
  }

  const degradation = readRecord(payload.degradation);
  return (
    readString(degradation?.message) ||
    `外部数据源${actionLabel}已降级返回，请检查运行结果中的原因说明`
  );
}

type ExternalSourceRuntimeResult = {
  action: 'query' | 'fetch' | 'download';
  executedAt: string;
  payload: Record<string, unknown>;
};

export default function DatabaseManagerPage() {
  const [searchText, setSearchText] = useState('');
  const [environmentFilter, setEnvironmentFilter] = useState('all');
  const [databases, setDatabases] = useState<DatabaseItem[]>(mockDatabases);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [bindingModalOpen, setBindingModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deletingMode, setDeletingMode] = useState<'' | 'config-only' | 'drop-remote'>('');
  const [savingBindings, setSavingBindings] = useState(false);
  const [externalSources, setExternalSources] = useState<ExternalDataSourceItem[]>([]);
  const [selectedExternalSourceId, setSelectedExternalSourceId] = useState('');
  const [externalLoading, setExternalLoading] = useState(true);
  const [externalLoadError, setExternalLoadError] = useState('');
  const [externalSourceModalOpen, setExternalSourceModalOpen] = useState(false);
  const [externalSourceModalMode, setExternalSourceModalMode] = useState<'create' | 'edit'>(
    'create',
  );
  const [savingExternalSource, setSavingExternalSource] = useState(false);
  const [checkingExternalSourceId, setCheckingExternalSourceId] = useState('');
  const [deletingExternalSourceId, setDeletingExternalSourceId] = useState('');
  const [externalRuntimeAction, setExternalRuntimeAction] = useState<
    '' | 'query' | 'fetch' | 'download'
  >('');
  const [externalRuntimeError, setExternalRuntimeError] = useState('');
  const [externalRuntimeResult, setExternalRuntimeResult] =
    useState<ExternalSourceRuntimeResult | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [bindingForm] = Form.useForm();
  const [externalSourceForm] = Form.useForm();
  const createMode = (Form.useWatch('createMode', createForm) || 'register-only') as
    | 'register-only'
    | 'create-remote';
  const createDatabaseType = normalizeDatabaseTypeValue(
    Form.useWatch('databaseType', createForm) || 'mysql',
  );
  const editDatabaseType = normalizeDatabaseTypeValue(
    Form.useWatch('databaseType', editForm) || 'mysql',
  );

  async function reloadList(preferredId?: string) {
    try {
      const list = await loadDatabaseListData();

      if (!list.length) {
        setDatabases([]);
        setSelectedId('');
        return;
      }

      setDatabases(list);
      setSelectedId((current) => {
        if (preferredId && list.some((item) => item.id === preferredId)) return preferredId;
        if (list.some((item) => item.id === current)) return current;
        return list[0].id;
      });
      setLoadError('');
    } catch (error) {
      console.error('database-manager list load failed:', error);
      setLoadError('真实数据库列表加载失败，当前回退到 mock 数据。');
      setDatabases(mockDatabases);
      setSelectedId(mockDatabases[0].id);
    }
  }

  async function reloadExternalSources(preferredId?: string) {
    try {
      const items = await loadExternalSourceListData();

      setExternalSources(items);
      setSelectedExternalSourceId((current) => {
        if (preferredId && items.some((item) => item.id === preferredId)) return preferredId;
        if (items.some((item) => item.id === current)) return current;
        return items[0]?.id || '';
      });
      setExternalLoadError('');
    } catch (error) {
      console.error('external-source list load failed:', error);
      setExternalLoadError('外部数据源接入位加载失败，当前未返回真实配置。');
      setExternalSources([]);
      setSelectedExternalSourceId('');
    }
  }

  async function reloadDetail(databaseId: string) {
    const detail = await loadDatabaseDetailData(databaseId);
    if (!detail) return;

    setDatabases((previous) =>
      previous.map((item) => (item.id === databaseId ? { ...item, ...detail } : item)),
    );
  }

  useEffect(() => {
    let mounted = true;

    async function init() {
      setLoading(true);
      setExternalLoading(true);
      try {
        await Promise.all([reloadList(), reloadExternalSources()]);
      } finally {
        if (mounted) {
          setLoading(false);
          setExternalLoading(false);
        }
      }
    }

    void init();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedId || loading) return;

    let mounted = true;

    async function loadDetail() {
      setDetailLoading(true);

      try {
        const detail = await loadDatabaseDetailData(selectedId);
        if (!mounted || !detail) return;

        setDatabases((previous) =>
          previous.map((item) => (item.id === selectedId ? { ...item, ...detail } : item)),
        );
      } catch (error) {
        console.error('database-manager detail load failed:', error);
      } finally {
        if (mounted) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      mounted = false;
    };
  }, [selectedId, loading]);

  const selectedExternalSource =
    externalSources.find((item) => item.id === selectedExternalSourceId) || externalSources[0] || null;

  useEffect(() => {
    setExternalRuntimeAction('');
    setExternalRuntimeError('');
    setExternalRuntimeResult(null);
  }, [selectedExternalSourceId]);

  const filteredDatabases = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return databases.filter((item) => {
      const matchKeyword =
        !keyword ||
        item.name.toLowerCase().includes(keyword) ||
        item.id.toLowerCase().includes(keyword);

      const matchEnvironment = environmentFilter === 'all' || item.environment === environmentFilter;

      return matchKeyword && matchEnvironment;
    });
  }, [databases, searchText, environmentFilter]);

  const selectedDatabase =
    filteredDatabases.find((item) => item.id === selectedId) ||
    databases.find((item) => item.id === selectedId) ||
    databases[0] ||
    emptyDatabase;

  function buildExternalSourceFormValues(source?: ExternalDataSourceItem | null) {
    if (!source) {
      return {
        ...buildExternalProviderTemplateFormValues('qichacha'),
        apiKey: '',
        secretKey: '',
        username: '',
        password: '',
        headersConfig: '',
        fieldMappings: '',
        notes: undefined,
      };
    }

    const sourceCategory = inferExternalSourceCategory(source);
    const providerTemplate = inferExternalProviderTemplateId(source);
    return {
      sourceCategory,
      providerTemplate,
      name: source.name,
      provider: source.provider,
      providerName: source.providerName,
      sourceType: source.sourceType,
      authType: source.authType,
      enabled: source.enabled,
      baseUrl: source.baseUrl,
      apiPath: source.apiPath,
      method: source.method || 'GET',
      queryParam: source.queryParam || 'q',
      limitParam: source.limitParam || 'limit',
      callQuota: source.callQuota || 0,
      cacheTtlHours: source.cacheTtlHours || 24,
      defaultLimit: source.defaultLimit || 5,
      freshness: source.freshness || 'month',
      externalAvailable: source.externalAvailable !== false,
      allowExternalOutput: source.allowExternalOutput === true,
      priority: source.priority || 'P3',
      retainRaw: source.retainRaw === true,
      apiKey: '',
      secretKey: '',
      username: '',
      password: '',
      capabilities: source.capabilities || [],
      allowedDomains: source.allowedDomains || [],
      blockedDomains: source.blockedDomains || [],
      publicDataOnly: source.publicDataOnly !== false,
      localDataOutboundPolicy: source.localDataOutboundPolicy || 'blocked',
      headersConfig: source.headersConfig || '',
      fieldMappings: source.fieldMappings || '',
      notes: source.notes,
    };
  }

  function buildEditFormValues(database: DatabaseItem) {
    return {
      databaseName: database.name,
      host: database.host === '未返回' ? undefined : database.host,
      port: typeof database.port === 'string' ? Number(database.port) || undefined : database.port,
      databaseType: normalizeDatabaseTypeValue(database.type) || 'mysql',
      username: database.username === '未返回' ? undefined : database.username,
      password: '',
      adminUsername: database.adminUsername === '未返回' ? undefined : database.adminUsername,
      adminPassword: '',
      databaseFile: database.databaseFile === '未返回' ? undefined : database.databaseFile,
      environment: database.environment === '未返回' ? undefined : database.environment,
      description: database.description,
    };
  }

  useEffect(() => {
    if (!selectedDatabase || selectedDatabase.id === emptyDatabase.id) {
      editForm.resetFields();
      return;
    }

    editForm.setFieldsValue(buildEditFormValues(selectedDatabase));
  }, [selectedDatabase, editForm]);

  useEffect(() => {
    if (!selectedDatabase || selectedDatabase.id === emptyDatabase.id) {
      bindingForm.resetFields();
      return;
    }

    bindingForm.setFieldsValue({
      defaultAssociatedDatabase: selectedDatabase.defaultAssociatedDatabase || undefined,
      visibleDatabases: selectedDatabase.visibleDatabases || [],
      relationSource: selectedDatabase.relationSource || undefined,
    });
  }, [selectedDatabase, bindingForm]);

  async function handleCreateSubmit() {
    try {
      const values = await createForm.validateFields();
      setCreating(true);

      const response = await createDatabase({
        createMode: values.createMode,
        databaseName: values.databaseName,
        databaseType: values.databaseType,
        ...(usesNetworkConnectionFields(values.databaseType)
          ? {
              host: values.host,
              port: values.port,
              username: values.username,
              password: values.password,
              adminUsername: values.adminUsername,
              adminPassword: values.adminPassword,
            }
          : {
              databaseFile: values.databaseFile,
            }),
        environment: values.environment,
        description: values.description,
      });

      const responseRecord = readRecord(response as unknown) || {};
      const responseData = readRecord(response.data as unknown) || {};
      const detailRecord = readRecord(responseData.detail) || {};
      const targetId =
        readString(responseRecord.targetId) ||
        readString(responseData.targetId) ||
        readString(detailRecord.id) ||
        readString(detailRecord.databaseId) ||
        '';

      message.success(
        values.createMode === 'create-remote' ? '数据库创建成功' : '数据库配置接入成功',
      );
      setCreateModalOpen(false);
      createForm.resetFields();
      await reloadList(targetId);
    } catch (error: unknown) {
      if (hasApiErrorFields(error)) return;
      message.error(getCreateFailureMessage(error, createMode));
    } finally {
      setCreating(false);
    }
  }

  async function handleEditSubmit() {
    if (!selectedDatabase || selectedDatabase.id === emptyDatabase.id) return;

    try {
      const values = await editForm.validateFields();
      setSaving(true);

      await updateDatabase(selectedDatabase.id, {
        databaseName: values.databaseName,
        databaseType: values.databaseType,
        ...(usesNetworkConnectionFields(values.databaseType)
          ? {
              host: values.host,
              port: values.port,
              username: values.username,
              ...(values.password ? { password: values.password } : {}),
              adminUsername: values.adminUsername,
              ...(values.adminPassword ? { adminPassword: values.adminPassword } : {}),
            }
          : {
              host: '',
              port: '',
              username: '',
              databaseFile: values.databaseFile,
            }),
        environment: values.environment,
        description: values.description,
        version: Number(selectedDatabase.version || 0),
      });

      message.success('数据库保存成功');
      setEditModalOpen(false);
      await reloadList(selectedDatabase.id);
      await reloadDetail(selectedDatabase.id);
    } catch (error: unknown) {
      const code = getApiErrorCode(error);
      if (code === 'VERSION_CONFLICT') {
        message.error('版本冲突，请刷新后重试');
      } else if (!hasApiErrorFields(error)) {
        message.error(getApiErrorMessage(error, '数据库保存失败'));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(deleteMode: 'config-only' | 'drop-remote') {
    if (!selectedDatabase || selectedDatabase.id === emptyDatabase.id) return;

    const confirmed = window.confirm(
      deleteMode === 'drop-remote'
        ? '确认删除当前数据库吗？这会先移除平台里的数据库配置，再尝试删除远端数据库本体；如管理员连接不可用、仍被轻绑定引用或该库仍是当前配置存储库，则会失败并回滚。'
        : '确认从平台中移除当前数据库配置吗？这不会删除远端数据库本体，但如仍被轻绑定引用或该库仍是当前配置存储库，则会失败。',
    );
    if (!confirmed) return;

    try {
      setDeletingMode(deleteMode);
      await deleteDatabase(selectedDatabase.id, { deleteMode });
      message.success(
        deleteMode === 'drop-remote' ? '数据库及远端库删除成功' : '数据库配置移除成功',
      );
      await reloadList();
    } catch (error: unknown) {
      message.error(getDeleteFailureMessage(error, deleteMode));
    } finally {
      setDeletingMode('');
    }
  }

  async function handleHealthCheck() {
    if (!selectedDatabase || selectedDatabase.id === emptyDatabase.id) return;

    try {
      setChecking(true);
      await healthCheckDatabase(selectedDatabase.id);
      message.success('健康检查成功');
      await reloadDetail(selectedDatabase.id);
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '健康检查失败'));
    } finally {
      setChecking(false);
    }
  }

  async function handleSaveBindings() {
    if (!selectedDatabase || selectedDatabase.id === emptyDatabase.id) return;

    try {
      const values = await bindingForm.validateFields();
      setSavingBindings(true);

      await saveLightBindings(selectedDatabase.id, {
        lightBindingSummary: {
          defaultAssociatedDatabase: values.defaultAssociatedDatabase || null,
          visibleDatabases: values.visibleDatabases || [],
          relationSource: values.relationSource,
        },
      });

      message.success('轻绑定关系保存成功');
      setBindingModalOpen(false);
      await reloadDetail(selectedDatabase.id);
    } catch (error: unknown) {
      if (!hasApiErrorFields(error)) {
        message.error(getApiErrorMessage(error, '轻绑定关系保存失败'));
      }
    } finally {
      setSavingBindings(false);
    }
  }

  async function handleSaveExternalSource() {
    try {
      const values = await externalSourceForm.validateFields();
      const payload = {
        name: values.name,
        sourceCategory: values.sourceCategory,
        providerTemplate: values.providerTemplate,
        provider: values.provider,
        providerName: values.providerName,
        sourceType: values.sourceType,
        authType: values.authType,
        enabled: values.enabled !== false,
        baseUrl: values.baseUrl,
        apiPath: values.apiPath,
        method: values.method || 'GET',
        queryParam: values.queryParam || 'q',
        limitParam: values.limitParam || 'limit',
        callQuota: values.callQuota || 0,
        cacheTtlHours: values.cacheTtlHours || 24,
        defaultLimit: values.defaultLimit || 5,
        freshness: values.freshness || 'month',
        externalAvailable: values.externalAvailable !== false,
        allowExternalOutput: values.allowExternalOutput === true,
        priority: values.priority || 'P3',
        retainRaw: values.retainRaw === true,
        ...(values.apiKey ? { apiKey: values.apiKey } : {}),
        ...(values.secretKey ? { secretKey: values.secretKey } : {}),
        ...(values.username ? { username: values.username } : {}),
        ...(values.password ? { password: values.password } : {}),
        capabilities: values.capabilities || [],
        allowedDomains: values.allowedDomains || [],
        blockedDomains: values.blockedDomains || [],
        publicDataOnly: values.publicDataOnly !== false,
        localDataOutboundPolicy: values.localDataOutboundPolicy || 'blocked',
        headersConfig: values.headersConfig,
        fieldMappings: values.fieldMappings,
        notes: values.notes,
      };

      setSavingExternalSource(true);

      if (externalSourceModalMode === 'create') {
        const response = await createExternalDataSource(payload);
        const responseData = readRecord(response.data as unknown) || {};
        const detail = readRecord(responseData.detail) || {};
        const targetId = readString(detail.id) || '';
        message.success('外部数据源接入位创建成功');
        setExternalSourceModalOpen(false);
        externalSourceForm.resetFields();
        await reloadExternalSources(targetId);
        return;
      }

      if (!selectedExternalSource) {
        return;
      }

      await updateExternalDataSource(selectedExternalSource.id, {
        ...payload,
        version: Number(selectedExternalSource.version || 1),
      });
      message.success('外部数据源接入位保存成功');
      setExternalSourceModalOpen(false);
      await reloadExternalSources(selectedExternalSource.id);
    } catch (error: unknown) {
      const code = getApiErrorCode(error);
      if (code === 'VERSION_CONFLICT') {
        message.error('外部数据源版本冲突，请刷新后重试');
      } else if (code === 'KEY_MANAGEMENT_REQUIRED') {
        message.error('未配置 SETTINGS_SECRET_MASTER_KEY，外部数据源密钥暂无法进入专用托管');
      } else if (!hasApiErrorFields(error)) {
        message.error(getApiErrorMessage(error, '外部数据源保存失败'));
      }
    } finally {
      setSavingExternalSource(false);
    }
  }

  async function handleDeleteExternalSource() {
    if (!selectedExternalSource) {
      return;
    }

    const confirmed = window.confirm(
      '确认删除当前外部数据源接入位吗？这只会移除平台配置，不会触发任何真实供应商调用。',
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingExternalSourceId(selectedExternalSource.id);
      await deleteExternalDataSource(selectedExternalSource.id);
      message.success('外部数据源接入位删除成功');
      await reloadExternalSources();
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '外部数据源删除失败'));
    } finally {
      setDeletingExternalSourceId('');
    }
  }

  async function handleHealthCheckExternalSource() {
    if (!selectedExternalSource) {
      return;
    }

    try {
      setCheckingExternalSourceId(selectedExternalSource.id);
      const response = await healthCheckExternalDataSource(selectedExternalSource.id);
      const responseData = readRecord(response.data as unknown) || {};
      const detail = readRecord(responseData.detail) || {};
      const healthStatus = readString(detail.healthStatus) || '';
      const healthMessage = readString(detail.healthMessage) || '外部数据源检测完成';
      if (healthStatus === 'healthy') {
        message.success(healthMessage);
      } else {
        message.warning(healthMessage);
      }
      await reloadExternalSources(selectedExternalSource.id);
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '外部数据源检测失败'));
    } finally {
      setCheckingExternalSourceId('');
    }
  }

  async function handleRunExternalSourceQuery(payload: {
    query?: string;
    page?: number;
    pageSize?: number;
    path?: string;
  }) {
    if (!selectedExternalSource) {
      return;
    }

    try {
      setExternalRuntimeAction('query');
      setExternalRuntimeError('');
      setExternalRuntimeResult(null);
      const response = await queryExternalDataSource(selectedExternalSource.id, payload);
      const responsePayload = readRecord(response.data as unknown) || {};
      setExternalRuntimeResult({
        action: 'query',
        executedAt: formatDateTimeToLocalTime(new Date()),
        payload: responsePayload,
      });
      const degradedMessage = getExternalSourceRuntimeDegradedMessage(responsePayload, '试查询');
      if (degradedMessage) {
        message.warning(degradedMessage);
      } else {
        message.success('外部数据源试查询完成');
      }
    } catch (error: unknown) {
      const nextMessage = getExternalSourceRuntimeErrorMessage(error, '试查询');
      setExternalRuntimeError(nextMessage);
      message.error(nextMessage);
    } finally {
      setExternalRuntimeAction('');
    }
  }

  async function handleRunExternalSourceFetch(payload: {
    resourceUrl?: string;
    resourcePath?: string;
    path?: string;
  }) {
    if (!selectedExternalSource) {
      return;
    }

    try {
      setExternalRuntimeAction('fetch');
      setExternalRuntimeError('');
      setExternalRuntimeResult(null);
      const response = await fetchExternalDataSource(selectedExternalSource.id, payload);
      const responsePayload = readRecord(response.data as unknown) || {};
      setExternalRuntimeResult({
        action: 'fetch',
        executedAt: formatDateTimeToLocalTime(new Date()),
        payload: responsePayload,
      });
      const degradedMessage = getExternalSourceRuntimeDegradedMessage(responsePayload, '试抓取');
      if (degradedMessage) {
        message.warning(degradedMessage);
      } else {
        message.success('外部数据源试抓取完成');
      }
    } catch (error: unknown) {
      const nextMessage = getExternalSourceRuntimeErrorMessage(error, '试抓取');
      setExternalRuntimeError(nextMessage);
      message.error(nextMessage);
    } finally {
      setExternalRuntimeAction('');
    }
  }

  async function handleRunExternalSourceDownload(payload: {
    resourceUrl?: string;
    resourcePath?: string;
    path?: string;
    fileName?: string;
  }) {
    if (!selectedExternalSource) {
      return;
    }

    try {
      setExternalRuntimeAction('download');
      setExternalRuntimeError('');
      setExternalRuntimeResult(null);
      const response = await downloadExternalDataSource(selectedExternalSource.id, payload);
      const responsePayload = readRecord(response.data as unknown) || {};
      setExternalRuntimeResult({
        action: 'download',
        executedAt: formatDateTimeToLocalTime(new Date()),
        payload: responsePayload,
      });
      const degradedMessage = getExternalSourceRuntimeDegradedMessage(responsePayload, '试下载');
      if (degradedMessage) {
        message.warning(degradedMessage);
      } else {
        message.success('外部数据源试下载完成');
      }
    } catch (error: unknown) {
      const nextMessage = getExternalSourceRuntimeErrorMessage(error, '试下载');
      setExternalRuntimeError(nextMessage);
      message.error(nextMessage);
    } finally {
      setExternalRuntimeAction('');
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F7F8FA', padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
          DatabaseManager
        </div>
        <div style={{ color: '#6B7280', fontSize: 14 }}>
          管数据库资源、健康状态与轻绑定摘要；当前版本已进入可新增、可保存、可删除、可回写阶段。
        </div>
      </div>

      {loadError ? (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={loadError} />
      ) : null}

      {externalLoadError ? (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={externalLoadError} />
      ) : null}

      <Spin spinning={loading || detailLoading || externalLoading}>
        <Row gutter={[16, 16]} align="top">
          <Col xs={24} lg={8}>
            <DatabaseManagerListPanel
              searchText={searchText}
              environmentFilter={environmentFilter}
              filteredDatabases={filteredDatabases}
              selectedId={selectedId}
              onSearchTextChange={setSearchText}
              onEnvironmentFilterChange={setEnvironmentFilter}
              onSelectDatabase={setSelectedId}
              onOpenCreate={() => {
                createForm.resetFields();
                createForm.setFieldsValue({
                  createMode: 'register-only',
                  databaseType: 'mysql',
                });
                setCreateModalOpen(true);
              }}
            />
          </Col>

          <Col xs={24} lg={16}>
            <DatabaseManagerDetailPanel
              selectedDatabase={selectedDatabase}
              emptyDatabaseId={emptyDatabase.id}
              checking={checking}
              deletingMode={deletingMode}
              onOpenEdit={() => {
                if (selectedDatabase && selectedDatabase.id !== emptyDatabase.id) {
                  editForm.setFieldsValue(buildEditFormValues(selectedDatabase));
                }
                setEditModalOpen(true);
              }}
              onDelete={handleDelete}
              onHealthCheck={handleHealthCheck}
              onOpenBindings={() => setBindingModalOpen(true)}
            />
          </Col>
        </Row>

        <div style={{ marginTop: 16 }}>
          <ExternalSourceManagerPanel
            sources={externalSources}
            selectedId={selectedExternalSource?.id || ''}
            onSelect={setSelectedExternalSourceId}
            onOpenCreate={() => {
              setExternalSourceModalMode('create');
              externalSourceForm.resetFields();
              externalSourceForm.setFieldsValue(buildExternalSourceFormValues(null));
              setExternalSourceModalOpen(true);
            }}
            onOpenEdit={() => {
              if (!selectedExternalSource) return;
              setExternalSourceModalMode('edit');
              externalSourceForm.setFieldsValue(buildExternalSourceFormValues(selectedExternalSource));
              setExternalSourceModalOpen(true);
            }}
            onDelete={handleDeleteExternalSource}
            onHealthCheck={handleHealthCheckExternalSource}
            onRunQuery={handleRunExternalSourceQuery}
            onRunFetch={handleRunExternalSourceFetch}
            onRunDownload={handleRunExternalSourceDownload}
            checking={checkingExternalSourceId === selectedExternalSource?.id}
            deleting={deletingExternalSourceId === selectedExternalSource?.id}
            runtimeAction={externalRuntimeAction}
            runtimeError={externalRuntimeError}
            runtimeResult={externalRuntimeResult}
          />
        </div>
      </Spin>

      <DatabaseManagerModals
        createModalOpen={createModalOpen}
        editModalOpen={editModalOpen}
        bindingModalOpen={bindingModalOpen}
        creating={creating}
        saving={saving}
        savingBindings={savingBindings}
        createForm={createForm}
        editForm={editForm}
        bindingForm={bindingForm}
        databases={databases}
        createMode={createMode}
        createDatabaseType={createDatabaseType}
        editDatabaseType={editDatabaseType}
        onCreateSubmit={handleCreateSubmit}
        onEditSubmit={handleEditSubmit}
        onSaveBindings={handleSaveBindings}
        onCloseCreate={() => {
          setCreateModalOpen(false);
          createForm.resetFields();
        }}
        onCloseEdit={() => {
          setEditModalOpen(false);
          editForm.setFieldsValue(buildEditFormValues(selectedDatabase));
        }}
        onCloseBindings={() => setBindingModalOpen(false)}
      />
      <ExternalSourceManagerModal
        open={externalSourceModalOpen}
        loading={savingExternalSource}
        form={externalSourceForm}
        mode={externalSourceModalMode}
        onSubmit={handleSaveExternalSource}
        onCancel={() => {
          setExternalSourceModalOpen(false);
          externalSourceForm.resetFields();
        }}
      />
    </div>
  );
}
