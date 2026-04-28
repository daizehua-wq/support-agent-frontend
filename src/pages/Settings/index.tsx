import { useCallback, useEffect, useState } from 'react';
import { Form, message } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  getSettings,
  getSettingsGovernanceHistory,
  getSettingsGovernanceOverview,
  getSettingsSecurityPosture,
  getOpsDashboard,
  getPythonRuntimeHealth,
  getWorkflowReleaseOptions,
  publishSettingsGovernanceVersion,
  rollbackSettingsGovernanceVersion,
  saveSettings,
  testDatabaseConnection,
  testModelConnection,
  acknowledgeOpsAlert,
  type OpsDashboardData,
  type GovernanceAuditEntry,
  type ModelItem as SettingsModelItem,
  type PythonRuntimeHealthData,
  type PythonRuntimeSettings,
  type SettingsSecurityPostureData,
  type SettingsGovernanceHistoryData,
  type SettingsGovernanceOverviewData,
  type SettingsGovernanceRequestContext,
  type SettingsGovernanceSummary,
  type WorkflowReleaseRouteOption,
  type WorkflowReleaseSettings,
  type SystemSettings,
  type SettingsResponseData,
  type EmbeddedModelSettings,
} from '../../api/settings';
import { getApiErrorMessage } from '../../utils/apiError';
import SettingsAssistantSection from './components/SettingsAssistantSection';
import SettingsGovernanceSection from './components/SettingsGovernanceSection';
import SettingsSummarySection from './components/SettingsSummarySection';
import SettingsTransitionSection from './components/SettingsTransitionSection';
import SettingsWorkflowReleaseSection from './components/SettingsWorkflowReleaseSection';
import SettingsPythonRuntimeSection from './components/SettingsPythonRuntimeSection';
import SettingsOpsSection from './components/SettingsOpsSection';
import SettingsRulesOverviewSection from './components/SettingsRulesOverviewSection';

const databaseTypeOptions = [
  { label: 'SQLite', value: 'sqlite' },
  { label: 'PostgreSQL', value: 'postgres' },
];

const defaultDatabaseValues = {
  databaseType: 'sqlite',
  host: '127.0.0.1',
  port: '5432',
  databaseName: 'sales_support_agent',
  username: 'postgres',
  password: '',
};

const defaultModelList = [
  {
    id: 'default-local',
    label: '默认本地模型',
    enabled: true,
    modelProvider: 'local',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: '',
    modelName: 'deepseek-r1:14b',
    timeout: '180000',
  },
];

const defaultModelValues = {
  activeModelId: 'default-local',
  models: defaultModelList,
  moduleBindings: {
    analyze: 'default-local',
    script: 'default-local',
    search: 'default-local',
  },
  modelProvider: 'local',
  baseUrl: 'http://localhost:11434/v1',
  apiKey: '',
  modelName: 'deepseek-r1:14b',
  timeout: '180000',
};

const defaultStrategyValues = {
  analyzeStrategy: 'rules-only',
  searchStrategy: 'local-only',
  scriptStrategy: 'local-model',
};

const defaultAssistantValues = {
  activeAssistantId: '',
};

const defaultPythonRuntimeValues: PythonRuntimeSettings = {
  contractVersion: 'python-runtime-settings/v1',
  enabled: false,
  strictMode: false,
  baseUrl: 'http://127.0.0.1:8008',
  healthGate: {
    enabled: true,
    strictGate: false,
    checkPath: '/health',
    timeoutMs: 1500,
    cacheTtlMs: 5000,
    maxConsecutiveFailures: 2,
    cooldownMs: 15000,
  },
  modelRouting: {
    enabled: true,
    fallbackEnabled: true,
    moduleRoutes: {
      analyze: 'local',
      search: 'local',
      script: 'cloud',
    },
  },
  channels: {
    local: {
      model: 'ollama/deepseek-r1:14b',
      apiBase: 'http://127.0.0.1:11434',
      apiKey: '',
      hasApiKey: false,
    },
    cloud: {
      model: 'gpt-4o-mini',
      apiBase: '',
      apiKey: '',
      hasApiKey: false,
    },
  },
};

const workflowReleaseRouteKey = (kind = '', route = '') => `${kind}:${route}`;

const defaultWorkflowReleaseValues: WorkflowReleaseSettings = {
  contractVersion: 'workflow-release-settings/v1',
  routes: {
    [workflowReleaseRouteKey('analyze', 'analyze-customer')]: {
      kind: 'analyze',
      route: 'analyze-customer',
      displayName: 'Analyze / analyze-customer',
      stablePluginId: 'builtin.analyze.default',
      canaryPluginId: '',
      trafficPercent: 0,
      rollbackOnError: false,
      bucketBy: 'sessionId',
      enabled: true,
      guardEnabled: false,
      minSampleSize: 20,
      maxErrorRatePercent: 20,
      maxP95LatencyMs: 25000,
    },
    [workflowReleaseRouteKey('search', 'search-documents')]: {
      kind: 'search',
      route: 'search-documents',
      displayName: 'Search / search-documents',
      stablePluginId: 'builtin.search.default',
      canaryPluginId: '',
      trafficPercent: 0,
      rollbackOnError: false,
      bucketBy: 'sessionId',
      enabled: true,
      guardEnabled: false,
      minSampleSize: 20,
      maxErrorRatePercent: 20,
      maxP95LatencyMs: 25000,
    },
    [workflowReleaseRouteKey('output', 'generate-script')]: {
      kind: 'output',
      route: 'generate-script',
      displayName: 'Output / generate-script',
      stablePluginId: 'builtin.output.default',
      canaryPluginId: 'custom.output.canary-annotator',
      trafficPercent: 20,
      rollbackOnError: true,
      bucketBy: 'sessionId',
      enabled: true,
      guardEnabled: false,
      minSampleSize: 20,
      maxErrorRatePercent: 20,
      maxP95LatencyMs: 25000,
    },
  },
};

type ModelItem = Partial<SettingsModelItem>;

type SettingsStatusSummary = {
  assistantActivationSummary?: {
    activeAssistantId?: string;
    activePromptId?: string;
    promptVersion?: string | null;
    assistantVersion?: string | null;
  };
  executionContextSummary?: {
    promptId?: string;
    promptVersion?: string | null;
    strategyId?: string;
  };
};

type SettingsConfigSnapshot = Partial<SystemSettings>;

type SettingsGovernanceFormValues = {
  tenantId: string;
  role: string;
  actorId: string;
  changeTicket?: string;
  releaseVersionId?: string;
  rollbackTargetVersionId?: string;
};

const buildWorkflowReleaseFormValues = (
  workflowReleaseInput: WorkflowReleaseSettings = defaultWorkflowReleaseValues,
  routeOptions: WorkflowReleaseRouteOption[] = [],
): WorkflowReleaseSettings => {
  const inputRoutes = workflowReleaseInput?.routes || {};
  const defaultRoutes = defaultWorkflowReleaseValues.routes || {};
  const mergedRoutes: NonNullable<WorkflowReleaseSettings['routes']> = {};

  Object.entries(defaultRoutes).forEach(([routeKey, routeConfig]) => {
    mergedRoutes[routeKey] = {
      ...routeConfig,
      ...(inputRoutes[routeKey] || {}),
      kind: routeConfig.kind,
      route: routeConfig.route,
      displayName: inputRoutes[routeKey]?.displayName || routeConfig.displayName,
    };
  });

  routeOptions.forEach((routeOption) => {
    const routeKey = routeOption.routeKey || workflowReleaseRouteKey(routeOption.kind, routeOption.route);
    const defaultStablePluginId =
      routeOption.stablePluginId ||
      routeOption.candidates.find((item) => item.releaseStage !== 'canary' && item.defaultPlugin)?.pluginId ||
      routeOption.candidates.find((item) => item.releaseStage !== 'canary')?.pluginId ||
      routeOption.candidates[0]?.pluginId ||
      '';
    const defaultCanaryPluginId =
      routeOption.canaryPluginId ||
      routeOption.candidates.find((item) => item.releaseStage === 'canary')?.pluginId ||
      '';
    const fallbackRouteConfig = mergedRoutes[routeKey] || {
      kind: routeOption.kind,
      route: routeOption.route,
      displayName: routeOption.displayName || `${routeOption.kind} / ${routeOption.route}`,
      stablePluginId: defaultStablePluginId,
      canaryPluginId: defaultCanaryPluginId,
      trafficPercent: Number(routeOption.trafficPercent || 0),
      rollbackOnError: routeOption.rollbackOnError === true,
      bucketBy: routeOption.bucketBy || 'sessionId',
      enabled: routeOption.enabled !== false,
      guardEnabled: routeOption.guardEnabled === true,
      minSampleSize: Number(routeOption.minSampleSize || 20),
      maxErrorRatePercent: Number(routeOption.maxErrorRatePercent || 20),
      maxP95LatencyMs: Number(routeOption.maxP95LatencyMs || 25000),
    };

    mergedRoutes[routeKey] = {
      ...fallbackRouteConfig,
      ...(inputRoutes[routeKey] || {}),
      kind: routeOption.kind,
      route: routeOption.route,
      displayName:
        inputRoutes[routeKey]?.displayName ||
        routeOption.displayName ||
        fallbackRouteConfig.displayName,
      stablePluginId:
        inputRoutes[routeKey]?.stablePluginId ||
        fallbackRouteConfig.stablePluginId ||
        defaultStablePluginId,
      canaryPluginId:
        inputRoutes[routeKey]?.canaryPluginId ||
        fallbackRouteConfig.canaryPluginId ||
        defaultCanaryPluginId,
      trafficPercent: Number(
        inputRoutes[routeKey]?.trafficPercent ?? fallbackRouteConfig.trafficPercent ?? 0,
      ),
      rollbackOnError:
        inputRoutes[routeKey]?.rollbackOnError ??
        fallbackRouteConfig.rollbackOnError ??
        false,
      bucketBy:
        inputRoutes[routeKey]?.bucketBy ||
        fallbackRouteConfig.bucketBy ||
        'sessionId',
      enabled:
        inputRoutes[routeKey]?.enabled ??
        fallbackRouteConfig.enabled ??
        true,
      guardEnabled:
        inputRoutes[routeKey]?.guardEnabled ??
        fallbackRouteConfig.guardEnabled ??
        false,
      minSampleSize: Number(
        inputRoutes[routeKey]?.minSampleSize ?? fallbackRouteConfig.minSampleSize ?? 20,
      ),
      maxErrorRatePercent: Number(
        inputRoutes[routeKey]?.maxErrorRatePercent ??
          fallbackRouteConfig.maxErrorRatePercent ??
          20,
      ),
      maxP95LatencyMs: Number(
        inputRoutes[routeKey]?.maxP95LatencyMs ??
          fallbackRouteConfig.maxP95LatencyMs ??
          25000,
      ),
    };
  });

  Object.entries(inputRoutes).forEach(([routeKey, routeConfig]) => {
    if (mergedRoutes[routeKey]) {
      return;
    }

    mergedRoutes[routeKey] = {
      ...routeConfig,
      displayName:
        routeConfig.displayName ||
        `${routeConfig.kind || 'workflow'} / ${routeConfig.route || routeKey}`,
      bucketBy: routeConfig.bucketBy || 'sessionId',
      enabled: routeConfig.enabled !== false,
      rollbackOnError: routeConfig.rollbackOnError === true,
      trafficPercent: Number(routeConfig.trafficPercent || 0),
      guardEnabled: routeConfig.guardEnabled === true,
      minSampleSize: Number(routeConfig.minSampleSize || 20),
      maxErrorRatePercent: Number(routeConfig.maxErrorRatePercent || 20),
      maxP95LatencyMs: Number(routeConfig.maxP95LatencyMs || 25000),
    };
  });

  return {
    contractVersion:
      workflowReleaseInput?.contractVersion || defaultWorkflowReleaseValues.contractVersion,
    routes: mergedRoutes,
  };
};

const buildSettingsSaveRequest = (
  settingsPatch: SettingsConfigSnapshot,
  sessionId: string,
) => ({
  sessionId,
  primaryContract: {
    contractVersion: 'settings-primary/v1',
    settings: settingsPatch,
  },
});

const getPrimarySettingsSnapshot = (settings: SettingsResponseData): SettingsConfigSnapshot => {
  const primarySettings = settings.primaryContract?.settings;

  if (primarySettings && typeof primarySettings === 'object' && !Array.isArray(primarySettings)) {
    return primarySettings as SettingsConfigSnapshot;
  }

  if (settings.configSummary && typeof settings.configSummary === 'object') {
    return settings.configSummary as SettingsConfigSnapshot;
  }

  return {};
};

const normalizeModelForForm = (item: ModelItem = {}): ModelItem => ({
  id: item.id || '',
  label: item.label || '',
  enabled: item.enabled !== false,
  modelProvider: item.modelProvider || 'local',
  baseUrl: item.baseUrl || '',
  apiKey: item.apiKey || '',
  hasApiKey: item.hasApiKey === true,
  modelName: item.modelName || '',
  timeout: item.timeout || '180000',
});

const normalizeModelForSave = (item: ModelItem = {}): ModelItem => {
  const normalizedItem = normalizeModelForForm(item);
  const nextItem: ModelItem = {
    id: normalizedItem.id,
    label: normalizedItem.label,
    enabled: normalizedItem.enabled,
    modelProvider: normalizedItem.modelProvider,
    baseUrl: normalizedItem.baseUrl,
    apiKey: normalizedItem.apiKey,
    modelName: normalizedItem.modelName,
    timeout: normalizedItem.timeout,
  };

  delete nextItem.hasApiKey;
  return nextItem;
};

function SettingsPage() {
  const [databaseForm] = Form.useForm();
  const [modelForm] = Form.useForm();
  const [strategyForm] = Form.useForm();
  const [assistantForm] = Form.useForm();
  const [pythonRuntimeForm] = Form.useForm();
  const [workflowReleaseForm] = Form.useForm();
  const [governanceForm] = Form.useForm<SettingsGovernanceFormValues>();
  const [settingsStatusSummary, setSettingsStatusSummary] = useState<SettingsStatusSummary | null>(null);
  const [settingsGovernanceSummary, setSettingsGovernanceSummary] = useState<SettingsGovernanceSummary | null>(null);
  const [settingsConfigSnapshot, setSettingsConfigSnapshot] = useState<SettingsConfigSnapshot>({});
  const [workflowReleaseOptions, setWorkflowReleaseOptions] = useState<WorkflowReleaseRouteOption[]>([]);
  const [settingsGovernanceOverview, setSettingsGovernanceOverview] = useState<SettingsGovernanceOverviewData | null>(null);
  const [settingsGovernanceHistory, setSettingsGovernanceHistory] = useState<SettingsGovernanceHistoryData | null>(null);
  const [opsDashboard, setOpsDashboard] = useState<OpsDashboardData | null>(null);
  const [pythonRuntimeHealth, setPythonRuntimeHealth] = useState<PythonRuntimeHealthData | null>(null);
  const [securityPosture, setSecurityPosture] = useState<SettingsSecurityPostureData | null>(null);
  const [isOpsRefreshing, setIsOpsRefreshing] = useState(false);
  const [isSecurityRefreshing, setIsSecurityRefreshing] = useState(false);
  const [acknowledgingAlertId, setAcknowledgingAlertId] = useState('');
  const [isGovernanceRefreshing, setIsGovernanceRefreshing] = useState(false);
  const [isGovernancePublishing, setIsGovernancePublishing] = useState(false);
  const [isGovernanceRollingBack, setIsGovernanceRollingBack] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const currentSessionId =
    ((location.state as { sessionId?: string } | null)?.sessionId || '').trim();
  const currentAssistantId =
    Form.useWatch('activeAssistantId', assistantForm) || defaultAssistantValues.activeAssistantId;
  const watchedAnalyzeStrategy =
    Form.useWatch('analyzeStrategy', strategyForm) || defaultStrategyValues.analyzeStrategy;
  const watchedSearchStrategy =
    Form.useWatch('searchStrategy', strategyForm) || defaultStrategyValues.searchStrategy;
  const watchedScriptStrategy =
    Form.useWatch('scriptStrategy', strategyForm) || defaultStrategyValues.scriptStrategy;
  const watchedModels: ModelItem[] = Form.useWatch('models', modelForm) || [];
  const watchedActiveModelId =
    Form.useWatch('activeModelId', modelForm) || defaultModelValues.activeModelId;
  const watchedDatabaseType =
    Form.useWatch('databaseType', databaseForm) || defaultDatabaseValues.databaseType;
  const watchedDatabaseName =
    Form.useWatch('databaseName', databaseForm) || defaultDatabaseValues.databaseName;
  const watchedLocalApiKeyConfigured =
    Form.useWatch(['channels', 'local', 'hasApiKey'], pythonRuntimeForm) || false;
  const watchedCloudApiKeyConfigured =
    Form.useWatch(['channels', 'cloud', 'hasApiKey'], pythonRuntimeForm) || false;

  const currentDefaultModel =
    watchedModels.find((item: ModelItem) => item?.id === watchedActiveModelId) ||
    watchedModels[0] ||
    null;
  const localRuntimeModelOptions = Array.from(
    new Map(
      watchedModels
        .filter((item: ModelItem) => {
          const provider = String(item?.modelProvider || '').toLowerCase();
          return item?.enabled !== false && ['local', 'ollama'].includes(provider);
        })
        .map((item: ModelItem) => {
          const modelName = String(item.modelName || '').replace(/^ollama\//i, '').trim();
          const value = modelName ? `ollama/${modelName}` : '';
          return [
            value,
            {
              label: `${item.label || item.id || '本地模型'} / ${modelName || '未返回模型名'}`,
              value,
            },
          ] as const;
        })
        .filter(([value]) => Boolean(value)),
    ).values(),
  );

  const getModelDisplayLabel = (model?: {
    id?: string;
    label?: string;
    modelProvider?: string;
    modelName?: string;
  }) => {
    if (!model) return '未返回';
    return `${model.label || model.id || '未命名模型'} / ${model.modelProvider || 'unknown'} / ${
      model.modelName || '未返回模型名'
    }`;
  };

  const currentAssistantSourceSummary = settingsGovernanceSummary
    ? 'primaryContract.settings + governanceSummary（主口径）'
    : settingsStatusSummary
      ? 'primaryContract.settings + statusSummary（主口径）'
      : '主口径未返回';
  const assistantSelectOptions =
    settingsGovernanceSummary?.assistantOptions?.map((item) => ({
      label: `${item.assistantName} (${item.currentVersion})`,
      value: item.assistantId,
    })) || [];
  const activeAssistantSummary = settingsGovernanceSummary?.activeAssistantSummary || null;
  const activeAnalyzePromptSummary = settingsGovernanceSummary?.activeAnalyzePromptSummary || null;
  const databaseBindingSummary = settingsGovernanceSummary?.databaseBindingSummary || null;
  const assistantHistory = (settingsGovernanceSummary?.recentHistory?.assistant || []) as GovernanceAuditEntry[];
  const promptHistory = (settingsGovernanceSummary?.recentHistory?.analyzePrompt || []) as GovernanceAuditEntry[];
  const resolvedAssistantIdForSummary =
    settingsGovernanceSummary?.activeAssistantId ||
    settingsStatusSummary?.assistantActivationSummary?.activeAssistantId ||
    currentAssistantId;
  const resolvedPromptIdForSummary =
    settingsStatusSummary?.executionContextSummary?.promptId ||
    activeAnalyzePromptSummary?.promptId ||
    activeAssistantSummary?.defaultModuleBindings?.analyze ||
    '未返回';
  const resolvedPromptVersionForSummary =
    settingsStatusSummary?.executionContextSummary?.promptVersion ||
    activeAnalyzePromptSummary?.version ||
    '未返回';
  const resolvedStrategyIdForSummary =
    settingsStatusSummary?.executionContextSummary?.strategyId ||
    activeAssistantSummary?.currentPublishedStrategy ||
    `${watchedAnalyzeStrategy} / ${watchedSearchStrategy} / ${watchedScriptStrategy}`;
  const databaseRelationSourceForSummary =
    databaseBindingSummary?.relationSource || 'settings.database.active-config';
  const resolvedAssistantNameForSummary =
    activeAssistantSummary?.assistantName ||
    settingsGovernanceSummary?.assistantOptions?.find(
      (item) => item.assistantId === resolvedAssistantIdForSummary,
    )?.assistantName ||
    '';
  const embeddedModelConfig =
    (settingsConfigSnapshot.embeddedModel || null) as EmbeddedModelSettings | null;
  const workflowRouteCount = Object.keys(
    ((settingsConfigSnapshot.workflowRelease || defaultWorkflowReleaseValues) as WorkflowReleaseSettings)
      .routes || {},
  ).length;

  const buildGovernanceRequestContext = (
    values: Partial<SettingsGovernanceFormValues> = {},
  ): SettingsGovernanceRequestContext => {
    return {
      tenantId: (values.tenantId || 'default').trim(),
      role: (values.role || 'platform-owner').trim(),
      actorId: (values.actorId || 'settings-page-operator').trim(),
      changeTicket: (values.changeTicket || '').trim(),
    };
  };

  const ensureGovernanceFormValues = async () => {
    const values = (await governanceForm.validateFields([
      'tenantId',
      'role',
      'actorId',
      'changeTicket',
      'releaseVersionId',
      'rollbackTargetVersionId',
    ])) as SettingsGovernanceFormValues;

    return {
      tenantId: values.tenantId || 'default',
      role: values.role || 'platform-owner',
      actorId: values.actorId || 'settings-page-operator',
      changeTicket: values.changeTicket || '',
      releaseVersionId: values.releaseVersionId || '',
      rollbackTargetVersionId: values.rollbackTargetVersionId || '',
    };
  };

  const loadGovernanceChain = useCallback(async (
    valuesSeed?: Partial<SettingsGovernanceFormValues>,
  ) => {
    const currentValues = {
      tenantId: valuesSeed?.tenantId || governanceForm.getFieldValue('tenantId') || 'default',
      role: valuesSeed?.role || governanceForm.getFieldValue('role') || 'platform-owner',
      actorId: valuesSeed?.actorId || governanceForm.getFieldValue('actorId') || 'settings-page-operator',
      changeTicket: valuesSeed?.changeTicket || governanceForm.getFieldValue('changeTicket') || '',
      releaseVersionId:
        valuesSeed?.releaseVersionId || governanceForm.getFieldValue('releaseVersionId') || '',
      rollbackTargetVersionId:
        valuesSeed?.rollbackTargetVersionId || governanceForm.getFieldValue('rollbackTargetVersionId') || '',
    };
    const context = buildGovernanceRequestContext(currentValues);

    setIsGovernanceRefreshing(true);
    try {
      const [overview, history] = await Promise.all([
        getSettingsGovernanceOverview(context),
        getSettingsGovernanceHistory(context, { limit: 30 }),
      ]);

      setSettingsGovernanceOverview(overview);
      setSettingsGovernanceHistory(history);

      const currentReleaseVersionId = currentValues.releaseVersionId || '';
      const currentRollbackVersionId = currentValues.rollbackTargetVersionId || '';
      const defaultReleaseVersionId =
        overview.tenant?.pointers?.activeVersionId ||
        overview.tenant?.pointers?.publishedVersionId ||
        '';

      governanceForm.setFieldsValue({
        ...currentValues,
        releaseVersionId: currentReleaseVersionId || defaultReleaseVersionId,
        rollbackTargetVersionId: currentRollbackVersionId,
      });
    } finally {
      setIsGovernanceRefreshing(false);
    }
  }, [governanceForm]);

  const loadOpsAndSecurity = useCallback(async (
    options: {
      withLoading?: boolean;
      forceRuntimeProbe?: boolean;
    } = {},
  ) => {
    const withLoading = options.withLoading === true;
    if (withLoading) {
      setIsOpsRefreshing(true);
      setIsSecurityRefreshing(true);
    }

    try {
      const [nextOpsDashboard, nextPythonRuntimeHealth, nextSecurityPosture] = await Promise.all([
        getOpsDashboard(),
        getPythonRuntimeHealth(options.forceRuntimeProbe === true),
        getSettingsSecurityPosture(),
      ]);

      setOpsDashboard(nextOpsDashboard);
      setPythonRuntimeHealth(nextPythonRuntimeHealth);
      setSecurityPosture(nextSecurityPosture);
    } finally {
      if (withLoading) {
        setIsOpsRefreshing(false);
        setIsSecurityRefreshing(false);
      }
    }
  }, []);

  const applySettingsSnapshot = useCallback((
    settings: SettingsResponseData,
    releaseOptions: WorkflowReleaseRouteOption[] = [],
  ) => {
    const primarySettings = getPrimarySettingsSnapshot(settings);
    const configSummary = (settings.configSummary || primarySettings) as SettingsConfigSnapshot;
    const statusSummary = (settings.statusSummary || {}) as SettingsStatusSummary;
    const configModel = (configSummary.model || {}) as Partial<SystemSettings['model']>;
    const configModels = Array.isArray(configModel.models)
      ? configModel.models.map((item) => normalizeModelForForm(item))
      : [];

    setSettingsStatusSummary(statusSummary);
    setSettingsGovernanceSummary(settings.governanceSummary || null);
    setSettingsConfigSnapshot(configSummary);

    const configPythonRuntime = (configSummary.pythonRuntime || {}) as Partial<PythonRuntimeSettings>;
    const normalizedPythonRuntime: PythonRuntimeSettings = {
      ...defaultPythonRuntimeValues,
      ...configPythonRuntime,
      healthGate: {
        ...defaultPythonRuntimeValues.healthGate,
        ...(configPythonRuntime.healthGate || {}),
      },
      modelRouting: {
        ...defaultPythonRuntimeValues.modelRouting,
        ...(configPythonRuntime.modelRouting || {}),
        moduleRoutes: {
          ...defaultPythonRuntimeValues.modelRouting.moduleRoutes,
          ...(configPythonRuntime.modelRouting?.moduleRoutes || {}),
        },
      },
      channels: {
        local: {
          ...defaultPythonRuntimeValues.channels.local,
          ...(configPythonRuntime.channels?.local || {}),
        },
        cloud: {
          ...defaultPythonRuntimeValues.channels.cloud,
          ...(configPythonRuntime.channels?.cloud || {}),
        },
      },
    };

    databaseForm.setFieldsValue(configSummary.database || defaultDatabaseValues);
    modelForm.setFieldsValue({
      ...defaultModelValues,
      ...(configSummary.model || {}),
      models: configModels.length > 0 ? configModels : defaultModelList,
      moduleBindings: {
        ...defaultModelValues.moduleBindings,
        ...(configSummary.model?.moduleBindings || {}),
      },
    });
    strategyForm.setFieldsValue(configSummary.strategy || defaultStrategyValues);
    assistantForm.setFieldsValue(configSummary.assistant || defaultAssistantValues);
    pythonRuntimeForm.setFieldsValue(normalizedPythonRuntime);
    workflowReleaseForm.setFieldsValue(
      buildWorkflowReleaseFormValues(
        (configSummary.workflowRelease || defaultWorkflowReleaseValues) as WorkflowReleaseSettings,
        releaseOptions,
      ),
    );
  }, [
    assistantForm,
    databaseForm,
    modelForm,
    pythonRuntimeForm,
    strategyForm,
    workflowReleaseForm,
  ]);

  const loadSettings = useCallback(async () => {
    try {
      const [settings, workflowReleaseOptionsData] = await Promise.all([
        getSettings(),
        getWorkflowReleaseOptions(),
      ]);
      const nextWorkflowReleaseOptions = Array.isArray(workflowReleaseOptionsData.routes)
        ? workflowReleaseOptionsData.routes
        : [];

      setWorkflowReleaseOptions(nextWorkflowReleaseOptions);
      applySettingsSnapshot(settings, nextWorkflowReleaseOptions);
      await loadGovernanceChain();
      try {
        await loadOpsAndSecurity();
      } catch {
        message.warning('运维/安全看板加载失败，可稍后手动刷新');
      }
    } catch {
      message.error('设置加载失败');
    }
  }, [applySettingsSnapshot, loadGovernanceChain, loadOpsAndSecurity]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadSettings();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadSettings]);

  const handleSaveAssistantSettings = async () => {
    const values = await assistantForm.validateFields();
    await saveSettings(buildSettingsSaveRequest({ assistant: values }, currentSessionId));
    await loadSettings();
    message.success('助手设置已保存');
  };

  const handleSaveDatabaseSettings = async () => {
    const values = await databaseForm.validateFields();
    const assistantValues = await assistantForm.validateFields();
    await saveSettings(
      buildSettingsSaveRequest(
        {
          database: values,
          assistant: assistantValues,
        },
        currentSessionId,
      ),
    );
    await loadSettings();
    message.success('数据库设置已保存');
  };

  const handleTestDatabaseConnection = async () => {
    const values = await databaseForm.validateFields();
    const assistantValues = await assistantForm.validateFields();
    await testDatabaseConnection({
      database: values,
      assistant: assistantValues,
      sessionId: currentSessionId,
    });
    message.success('数据库测试连接成功');
  };

  const getNormalizedModelSettings = async () => {
    const values = await modelForm.validateFields();
    const models: ModelItem[] = Array.isArray(values.models)
      ? values.models.map((item: ModelItem) => normalizeModelForSave(item))
      : [];
    const activeModelId = values.activeModelId || models[0]?.id || 'default-local';
    const activeModel =
      models.find((item: ModelItem) => item.id === activeModelId) || models[0] || defaultModelList[0];

    return {
      ...values,
      activeModelId,
      models,
      moduleBindings: {
        ...defaultModelValues.moduleBindings,
        ...(values.moduleBindings || {}),
      },
      modelProvider: activeModel?.modelProvider || 'local',
      baseUrl: activeModel?.baseUrl || '',
      apiKey: activeModel?.apiKey || '',
      modelName: activeModel?.modelName || '',
      timeout: activeModel?.timeout || '180000',
    };
  };

  const handleTestModelConnection = async () => {
    const normalizedValues = await getNormalizedModelSettings();
    const assistantValues = await assistantForm.validateFields();
    const response = await testModelConnection({
      model: normalizedValues,
      assistant: assistantValues,
      sessionId: currentSessionId,
    });
    const responseData = response.data as Record<string, unknown>;
    const nestedData = responseData.data;
    const result =
      nestedData && typeof nestedData === 'object'
        ? (nestedData as typeof response.data)
        : response.data;

    if (result?.success) {
      message.success('模型测试连接成功');
      return;
    }

    message.warning(result?.failureType ? `模型测试失败：${result.failureType}` : '模型测试失败');
  };

  const getNormalizedPythonRuntimeSettings = async (): Promise<PythonRuntimeSettings> => {
    const values = (await pythonRuntimeForm.validateFields()) as PythonRuntimeSettings;
    const normalized: PythonRuntimeSettings = {
      ...defaultPythonRuntimeValues,
      ...values,
      healthGate: {
        ...defaultPythonRuntimeValues.healthGate,
        ...(values.healthGate || {}),
      },
      modelRouting: {
        ...defaultPythonRuntimeValues.modelRouting,
        ...(values.modelRouting || {}),
        moduleRoutes: {
          ...defaultPythonRuntimeValues.modelRouting.moduleRoutes,
          ...(values.modelRouting?.moduleRoutes || {}),
        },
      },
      channels: {
        local: {
          ...defaultPythonRuntimeValues.channels.local,
          ...(values.channels?.local || {}),
          apiKey: values.channels?.local?.apiKey || '',
          hasApiKey: undefined,
        },
        cloud: {
          ...defaultPythonRuntimeValues.channels.cloud,
          ...(values.channels?.cloud || {}),
          apiKey: values.channels?.cloud?.apiKey || '',
          hasApiKey: undefined,
        },
      },
    };

    return {
      ...normalized,
      channels: {
        local: {
          ...normalized.channels.local,
          hasApiKey: undefined,
        },
        cloud: {
          ...normalized.channels.cloud,
          hasApiKey: undefined,
        },
      },
    };
  };

  const handleSavePythonRuntimeSettings = async () => {
    const values = await getNormalizedPythonRuntimeSettings();
    await saveSettings(
      buildSettingsSaveRequest(
        {
          pythonRuntime: values,
        },
        currentSessionId,
      ),
    );
    await loadSettings();
    message.success('Python Runtime 配置已保存');
  };

  const handleResetPythonRuntimeSettings = async () => {
    pythonRuntimeForm.setFieldsValue(defaultPythonRuntimeValues);
    await saveSettings(
      buildSettingsSaveRequest(
        {
          pythonRuntime: defaultPythonRuntimeValues,
        },
        currentSessionId,
      ),
    );
    await loadSettings();
    message.success('Python Runtime 配置已恢复默认');
  };

  const handleSaveStrategySettings = async () => {
    const values = await strategyForm.validateFields();
    const assistantValues = await assistantForm.validateFields();
    await saveSettings(
      buildSettingsSaveRequest(
        {
          strategy: values,
          assistant: assistantValues,
        },
        currentSessionId,
      ),
    );
    await loadSettings();
    message.success('模块策略已保存');
  };

  const handleResetStrategySettings = async () => {
    const assistantValues = await assistantForm.validateFields();
    strategyForm.setFieldsValue(defaultStrategyValues);
    await saveSettings(
      buildSettingsSaveRequest(
        {
          strategy: defaultStrategyValues,
          assistant: assistantValues,
        },
        currentSessionId,
      ),
    );
    await loadSettings();
    message.success('模块策略已恢复默认');
  };

  const handleSaveWorkflowReleaseSettings = async () => {
    const values = (await workflowReleaseForm.validateFields()) as WorkflowReleaseSettings;
    await saveSettings(
      buildSettingsSaveRequest(
        {
          workflowRelease: buildWorkflowReleaseFormValues(values, workflowReleaseOptions),
        },
        currentSessionId,
      ),
    );
    await loadSettings();
    message.success('工作流发布控制已保存');
  };

  const handleResetWorkflowReleaseSettings = async () => {
    const resetValues = buildWorkflowReleaseFormValues(
      defaultWorkflowReleaseValues,
      workflowReleaseOptions,
    );

    workflowReleaseForm.setFieldsValue(resetValues);
    await saveSettings(
      buildSettingsSaveRequest(
        {
          workflowRelease: resetValues,
        },
        currentSessionId,
      ),
    );
    await loadSettings();
    message.success('工作流发布策略已恢复默认');
  };

  const handleRefreshWorkflowReleaseOptions = async () => {
    try {
      const settings = await getSettings();
      const workflowReleaseOptionsData = await getWorkflowReleaseOptions();
      const nextWorkflowReleaseOptions = Array.isArray(workflowReleaseOptionsData.routes)
        ? workflowReleaseOptionsData.routes
        : [];

      setWorkflowReleaseOptions(nextWorkflowReleaseOptions);
      applySettingsSnapshot(settings, nextWorkflowReleaseOptions);
      message.success('发布候选插件已刷新');
    } catch {
      message.error('刷新发布候选插件失败');
    }
  };

  const handleRefreshGovernanceChain = async () => {
    try {
      const values = await ensureGovernanceFormValues();
      await loadGovernanceChain(values);
      message.success('治理链路已刷新');
    } catch (error) {
      message.error(getApiErrorMessage(error, '治理链路刷新失败'));
    }
  };

  const handleRefreshOpsDashboard = async () => {
    setIsOpsRefreshing(true);
    try {
      const [nextOpsDashboard, nextPythonRuntimeHealth] = await Promise.all([
        getOpsDashboard(),
        getPythonRuntimeHealth(true),
      ]);

      setOpsDashboard(nextOpsDashboard);
      setPythonRuntimeHealth(nextPythonRuntimeHealth);
      message.success('运维看板已刷新');
    } catch (error) {
      message.error(getApiErrorMessage(error, '运维看板刷新失败'));
    } finally {
      setIsOpsRefreshing(false);
    }
  };

  const handleRefreshSecurityPosture = async () => {
    setIsSecurityRefreshing(true);
    try {
      const nextSecurityPosture = await getSettingsSecurityPosture();
      setSecurityPosture(nextSecurityPosture);
      message.success('安全态势已刷新');
    } catch (error) {
      message.error(getApiErrorMessage(error, '安全态势刷新失败'));
    } finally {
      setIsSecurityRefreshing(false);
    }
  };

  const handleAcknowledgeOpsAlert = async (alertId: string) => {
    if (!alertId) {
      return;
    }

    setAcknowledgingAlertId(alertId);
    try {
      await acknowledgeOpsAlert(alertId, 'settings-page-operator');
      const nextOpsDashboard = await getOpsDashboard();
      setOpsDashboard(nextOpsDashboard);
      message.success(`告警已确认：${alertId}`);
    } catch (error) {
      message.error(getApiErrorMessage(error, '告警确认失败'));
    } finally {
      setAcknowledgingAlertId('');
    }
  };

  const handlePublishGovernanceVersion = async () => {
    let values: SettingsGovernanceFormValues;

    try {
      values = await ensureGovernanceFormValues();
    } catch (error) {
      message.error(getApiErrorMessage(error, '请先完善治理发布参数'));
      return;
    }

    const releaseVersionId =
      values.releaseVersionId ||
      settingsGovernanceOverview?.tenant?.pointers?.activeVersionId ||
      '';

    if (!releaseVersionId) {
      message.warning('当前没有可发布版本，请先保存配置形成版本');
      return;
    }

    setIsGovernancePublishing(true);
    try {
      await publishSettingsGovernanceVersion({
        ...buildGovernanceRequestContext(values),
        versionId: releaseVersionId,
        reason: `settings-page manual release ${releaseVersionId}`,
      });
      await loadSettings();
      await loadGovernanceChain({
        ...values,
        releaseVersionId,
      });
      message.success(`发布成功：${releaseVersionId}`);
    } catch (error) {
      message.error(getApiErrorMessage(error, '版本发布失败'));
    } finally {
      setIsGovernancePublishing(false);
    }
  };

  const handleRollbackGovernanceVersion = async () => {
    let values: SettingsGovernanceFormValues;

    try {
      values = await ensureGovernanceFormValues();
    } catch (error) {
      message.error(getApiErrorMessage(error, '请先完善治理回滚参数'));
      return;
    }

    setIsGovernanceRollingBack(true);
    try {
      const rollbackResult = await rollbackSettingsGovernanceVersion({
        ...buildGovernanceRequestContext(values),
        targetVersionId: values.rollbackTargetVersionId || undefined,
        reason: values.rollbackTargetVersionId
          ? `settings-page rollback to ${values.rollbackTargetVersionId}`
          : 'settings-page rollback to previous release',
      });
      await loadSettings();
      await loadGovernanceChain(values);

      const rollbackDuration = Number(rollbackResult.rollbackDurationMs || 0);
      const rollbackSla = Number(rollbackResult.rollbackSlaMs || 0);
      message.success(
        `回滚成功（耗时 ${rollbackDuration}ms / SLA ${rollbackSla}ms）`,
      );
    } catch (error) {
      message.error(getApiErrorMessage(error, '版本回滚失败'));
    } finally {
      setIsGovernanceRollingBack(false);
    }
  };

  return (
    <div className="ap-settings-page">
      <SettingsRulesOverviewSection
        activeAssistantName={resolvedAssistantNameForSummary}
        activeAssistantId={resolvedAssistantIdForSummary}
        promptVersion={resolvedPromptVersionForSummary}
        strategySummary={resolvedStrategyIdForSummary}
        modelLabel={getModelDisplayLabel(currentDefaultModel)}
        databaseName={watchedDatabaseName}
        databaseType={watchedDatabaseType}
        workflowRouteCount={workflowRouteCount}
        embeddedModel={embeddedModelConfig}
        opsDashboard={opsDashboard}
        securityPosture={securityPosture}
        governanceOverview={settingsGovernanceOverview}
        onTestModelConnection={handleTestModelConnection}
        onTestDatabaseConnection={handleTestDatabaseConnection}
      />

      <section id="settings-summary" className="ap-settings-detail-section">
        <SettingsSummarySection
          assistantId={resolvedAssistantIdForSummary}
          promptId={resolvedPromptIdForSummary}
          promptVersion={resolvedPromptVersionForSummary}
          strategyId={resolvedStrategyIdForSummary}
          sourceSummary={currentAssistantSourceSummary}
          versionLabel={currentDefaultModel?.id || '未返回'}
          databaseRelationSource={databaseRelationSourceForSummary}
          currentDefaultModelLabel={getModelDisplayLabel(currentDefaultModel)}
          currentDatabaseName={watchedDatabaseName}
          currentDatabaseType={watchedDatabaseType}
          databaseBindingSummary={databaseBindingSummary}
          onViewModelCenter={() => navigate('/model-center')}
          onTestModelConnection={handleTestModelConnection}
          onViewDatabaseManager={() => navigate('/database-manager')}
          onTestDatabaseConnection={handleTestDatabaseConnection}
        />
      </section>

      <section id="settings-ops" className="ap-settings-detail-section">
        <SettingsOpsSection
          opsDashboard={opsDashboard}
          pythonRuntimeHealth={pythonRuntimeHealth}
          securityPosture={securityPosture}
          refreshingOps={isOpsRefreshing}
          refreshingSecurity={isSecurityRefreshing}
          acknowledgingAlertId={acknowledgingAlertId}
          onRefreshOps={handleRefreshOpsDashboard}
          onRefreshSecurity={handleRefreshSecurityPosture}
          onAcknowledgeAlert={handleAcknowledgeOpsAlert}
        />
      </section>

      <section id="settings-runtime" className="ap-settings-detail-section">
        <SettingsPythonRuntimeSection
          pythonRuntimeForm={pythonRuntimeForm}
          defaultPythonRuntimeValues={defaultPythonRuntimeValues}
          localModelOptions={localRuntimeModelOptions}
          localApiKeyConfigured={Boolean(watchedLocalApiKeyConfigured)}
          cloudApiKeyConfigured={Boolean(watchedCloudApiKeyConfigured)}
          onSavePythonRuntimeSettings={handleSavePythonRuntimeSettings}
          onResetPythonRuntimeSettings={handleResetPythonRuntimeSettings}
        />
      </section>

      <section id="settings-release" className="ap-settings-detail-section">
        <SettingsWorkflowReleaseSection
          workflowReleaseForm={workflowReleaseForm}
          routeOptions={workflowReleaseOptions}
          onSaveWorkflowReleaseSettings={handleSaveWorkflowReleaseSettings}
          onResetWorkflowReleaseSettings={handleResetWorkflowReleaseSettings}
          onRefreshWorkflowReleaseOptions={handleRefreshWorkflowReleaseOptions}
        />
      </section>

      <section id="settings-governance" className="ap-settings-detail-section">
        <SettingsGovernanceSection
          governanceForm={governanceForm}
          overview={settingsGovernanceOverview}
          history={settingsGovernanceHistory}
          refreshing={isGovernanceRefreshing}
          publishing={isGovernancePublishing}
          rollingBack={isGovernanceRollingBack}
          onRefresh={handleRefreshGovernanceChain}
          onPublish={handlePublishGovernanceVersion}
          onRollback={handleRollbackGovernanceVersion}
        />
      </section>

      <section id="settings-agent" className="ap-settings-detail-section">
        <SettingsAssistantSection
          assistantForm={assistantForm}
          defaultAssistantValues={defaultAssistantValues}
          assistantSelectOptions={assistantSelectOptions}
          currentSessionId={currentSessionId}
          resolvedAssistantId={resolvedAssistantIdForSummary}
          analyzePromptId={activeAssistantSummary?.defaultModuleBindings?.analyze || '未返回'}
          searchPromptId={activeAssistantSummary?.defaultModuleBindings?.search || '未返回'}
          scriptPromptId={activeAssistantSummary?.defaultModuleBindings?.script || '未返回'}
          publishedPromptId={activeAssistantSummary?.currentPublishedPrompt || '未返回'}
          publishedPromptVersion={activeAssistantSummary?.currentPublishedPromptVersion || '未返回'}
          analyzeStrategy={activeAssistantSummary?.defaultStrategies?.analyzeStrategy || '未返回'}
          searchStrategy={activeAssistantSummary?.defaultStrategies?.searchStrategy || '未返回'}
          scriptStrategy={activeAssistantSummary?.defaultStrategies?.scriptStrategy || '未返回'}
          activeAnalyzePromptName={activeAnalyzePromptSummary?.name || '未返回'}
          activeAnalyzePromptVersion={activeAnalyzePromptSummary?.version || '未返回'}
          assistantHistory={assistantHistory}
          promptHistory={promptHistory}
          onSaveAssistantSettings={handleSaveAssistantSettings}
        />
      </section>

      <section id="settings-transition" className="ap-settings-detail-section">
        <SettingsTransitionSection
          modelForm={modelForm}
          strategyForm={strategyForm}
          databaseForm={databaseForm}
          defaultModelValues={defaultModelValues}
          defaultStrategyValues={defaultStrategyValues}
          defaultDatabaseValues={defaultDatabaseValues}
          currentDefaultModelLabel={getModelDisplayLabel(currentDefaultModel)}
          watchedAnalyzeStrategy={watchedAnalyzeStrategy}
          watchedSearchStrategy={watchedSearchStrategy}
          watchedScriptStrategy={watchedScriptStrategy}
          watchedDatabaseName={watchedDatabaseName}
          watchedDatabaseType={watchedDatabaseType}
          databaseTypeOptions={databaseTypeOptions}
          onViewModelCenter={() => navigate('/model-center')}
          onTestModelConnection={handleTestModelConnection}
          onSaveStrategySettings={handleSaveStrategySettings}
          onResetStrategySettings={handleResetStrategySettings}
          onSaveDatabaseSettings={handleSaveDatabaseSettings}
          onTestDatabaseConnection={handleTestDatabaseConnection}
        />
      </section>
    </div>
  );
}

export default SettingsPage;
