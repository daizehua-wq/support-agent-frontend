import axios, { AxiosHeaders } from 'axios';

export type Connection = {
  id: string;
  provider: string;
  api_key_ref?: string;
  apiKeyRef?: string;
  has_api_key?: number;
  hasApiKey?: boolean;
  is_active?: number;
  isActive?: boolean;
  health_status?: string;
  healthStatus?: string;
  last_checked_at?: string;
  lastCheckedAt?: string;
  health_message?: string;
  healthMessage?: string;
  created_at?: string;
  createdAt?: string;
};

export type SessionItem = {
  id: string;
  user_id?: string;
  userId?: string;
  app_id?: string;
  appId?: string;
  title?: string;
  status?: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
};

export type MessageItem = {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  createdAt?: string;
};

export type SessionDetail = SessionItem & {
  messages: MessageItem[];
};

export type ManagedApp = {
  id: string;
  name: string;
  description?: string;
  api_key?: string;
  apiKey?: string;
  api_key_prefix?: string;
  apiKeyPrefix?: string;
  status: 'active' | 'suspended' | 'deleted';
  rate_limit_per_min?: number;
  rateLimitPerMin?: number;
  max_tokens_per_day?: number;
  maxTokensPerDay?: number;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
};

export type AppUsage = {
  id?: number;
  app_id?: string;
  appId?: string;
  date: string;
  api_calls?: number;
  apiCalls?: number;
  tokens_used?: number;
  tokensUsed?: number;
};

export type AdminStats = {
  totalConnections: number;
  activeConnections?: number;
  todaySessions: number;
  totalSessions?: number;
  totalMessages: number;
  todayMessages?: number;
  totalApps?: number;
  activeApps: number;
  todayApiCalls: number;
  todayTokensUsed: number;
  modelUsageRank?: ModelUsageRankItem[];
  ruleHitRate?: number;
  knowledgeGapCount?: number;
  todayActiveSessions?: number;
  totalTokensUsedToday?: number;
};

export type ModelUsageRankItem = {
  model: string;
  calls: number;
  successRate: number;
  avgLatencyMs: number;
};

export type ModelPerformance = ModelUsageRankItem & {
  success: number;
  failures: number;
  p95LatencyMs: number;
  totalTokens: number;
};

export type KnowledgeGap = {
  id: number;
  session_id?: string;
  sessionId?: string;
  app_id?: string;
  appId?: string;
  user_query?: string;
  userQuery?: string;
  matched_rule_count?: number;
  matchedRuleCount?: number;
  created_at?: string;
  createdAt?: string;
};

export type RulesPayload = {
  rules: string;
  parsed?: unknown;
  source?: string;
  status?: string;
  updatedAt?: string;
};

export type KnowledgeRule = {
  id: string;
  domain_type?: string;
  domainType?: string;
  topic?: string;
  workflow_stage?: string;
  workflowStage?: string;
  keywords?: string[];
  scenario?: string;
  suggestions?: unknown;
  risk_notes?: unknown;
  riskNotes?: unknown;
  updated_at?: string;
  updatedAt?: string;
};

export type KnowledgeResource = {
  id: string;
  domain_type?: string;
  domainType?: string;
  title: string;
  summary?: string;
  applicable_scenarios?: unknown;
  applicableScenarios?: unknown;
  is_shareable?: number;
  isShareable?: boolean;
  content_type?: string;
  contentType?: string;
  link?: string;
  updated_at?: string;
  updatedAt?: string;
};

export type GenerationTemplate = {
  id: string;
  scene: string;
  output_target?: string;
  outputTarget?: string;
  template_content?: string;
  templateContent?: string;
  variables?: unknown;
  updated_at?: string;
  updatedAt?: string;
};

export type GuidanceNote = {
  id: string;
  scene: string;
  note_type?: string;
  noteType?: string;
  content: string;
  updated_at?: string;
  updatedAt?: string;
};

export type ChannelConfig = {
  id: number;
  app_id?: string;
  appId?: string;
  channel_type?: 'feishu' | 'dingtalk' | 'wecom' | string;
  channelType?: 'feishu' | 'dingtalk' | 'wecom' | string;
  channel_name?: string;
  channelName?: string;
  config?: Record<string, unknown>;
  configSummary?: Record<string, unknown>;
  status?: 'active' | 'disabled';
  created_by?: 'human' | 'p5';
  createdBy?: 'human' | 'p5';
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
};

export type ChannelConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChannelConversationResult = {
  reply: string;
  needsConfirmation?: boolean;
  session_id?: string;
  channel_id?: number;
  channelId?: number;
  config_summary?: Record<string, unknown>;
  configSummary?: Record<string, unknown>;
  reload?: unknown;
};

export type EvolutionAction = {
  id: string;
  type: string;
  title?: string;
  reason?: string;
  source?: string;
  status?: 'pending' | 'applied' | 'failed' | 'rejected' | string;
  targetId?: string;
  payload?: Record<string, unknown>;
  evidence?: unknown;
  createdAt?: string;
  appliedAt?: string;
  rejectedAt?: string;
  result?: unknown;
};

export type EvolutionRun = {
  id: string;
  startedAt?: string;
  completedAt?: string;
  mode?: string;
  actor?: string;
  decisionSource?: string;
  autoConfirm?: boolean;
  signals?: Record<string, unknown>;
  summary?: Record<string, number>;
  actions?: EvolutionAction[];
};

export type EvolutionStatus = {
  enabled: boolean;
  autoConfirm: boolean;
  nextRunPolicy?: string;
  lastRun?: EvolutionRun | null;
  pendingActions: EvolutionAction[];
  rejectedActions?: EvolutionAction[];
  summary?: Record<string, number>;
};

const request = axios.create({
  baseURL: '',
  timeout: 180000,
});

request.interceptors.request.use((config) => {
  const headers = AxiosHeaders.from(config.headers);
  headers.set('X-Internal-Call', 'true');
  config.headers = headers;
  return config;
});

const unwrap = <TData>(payload: unknown): TData => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const record = payload as { data?: unknown; success?: boolean };

    if (
      record.data &&
      typeof record.data === 'object' &&
      'success' in record.data &&
      'data' in record.data
    ) {
      return (record.data as { data: TData }).data;
    }

    return record.data as TData;
  }

  return payload as TData;
};

export const fetchConnections = async () =>
  unwrap<Connection[]>((await request.get('/internal/data/external-connections')).data);

export const createConnection = async (payload: { provider: string; apiKey: string }) =>
  unwrap<Connection>((await request.post('/internal/data/external-connections', payload)).data);

export const updateConnection = async (id: string, payload: { isActive: boolean }) =>
  unwrap<Connection>((await request.put(`/internal/data/external-connections/${id}`, payload)).data);

export const checkConnectionHealth = async (id: string) =>
  unwrap<Connection>((await request.post(`/internal/data/external-connections/${id}/health`)).data);

export const deleteConnection = async (id: string) =>
  unwrap<{ id: string; deleted: boolean }>(
    (await request.delete(`/internal/data/external-connections/${id}`)).data,
  );

export const fetchSessions = async (params?: { userId?: string }) =>
  unwrap<SessionItem[]>((await request.get('/internal/data/sessions', { params })).data);

export const fetchSessionDetail = async (id: string) =>
  unwrap<SessionDetail>((await request.get(`/internal/data/sessions/${id}`)).data);

export const deleteSession = async (id: string) =>
  unwrap<{ id: string; deleted: boolean }>(
    (await request.delete(`/internal/data/sessions/${id}`)).data,
  );

export const fetchRules = async () =>
  unwrap<RulesPayload>((await request.get('/internal/rules')).data);

export const updateRules = async (rules: string) =>
  unwrap<RulesPayload>((await request.put('/internal/rules', { rules })).data);

export const fetchApps = async () =>
  unwrap<ManagedApp[]>((await request.get('/internal/apps')).data);

export const createApp = async (payload: {
  name: string;
  description?: string;
  rateLimit?: number;
  maxTokens?: number;
  idempotencyKey?: string;
}) => unwrap<ManagedApp>((await request.post('/internal/apps', payload)).data);

export const updateApp = async (
  id: string,
  payload: Partial<{
    name: string;
    description: string;
    status: 'active' | 'suspended';
    rateLimit: number;
    maxTokens: number;
  }>,
) => unwrap<ManagedApp>((await request.put(`/internal/apps/${id}`, payload)).data);

export const deleteApp = async (id: string) =>
  unwrap<{ id: string; deleted: boolean }>((await request.delete(`/internal/apps/${id}`)).data);

export const fetchAppUsage = async (id: string, start?: string, end?: string) =>
  unwrap<AppUsage[]>(
    (
      await request.get(`/internal/apps/${id}/usage`, {
        params: {
          start,
          end,
        },
      })
    ).data,
  );

export const fetchStats = async () =>
  unwrap<AdminStats>((await request.get('/internal/stats')).data);

export const fetchModelPerformance = async (params?: { start?: string; end?: string }) =>
  unwrap<ModelPerformance[]>(
    (await request.get('/internal/stats/model-performance', { params })).data,
  );

export const fetchKnowledgeGaps = async (params?: {
  start?: string;
  end?: string;
  limit?: number;
}) =>
  unwrap<KnowledgeGap[]>(
    (await request.get('/internal/stats/knowledge-gaps', { params })).data,
  );

export const fetchKnowledgeRules = async (params?: {
  domainType?: string;
  topic?: string;
  workflowStage?: string;
}) => unwrap<KnowledgeRule[]>((await request.get('/internal/knowledge/rules', { params })).data);

export const createKnowledgeRule = async (payload: Partial<KnowledgeRule>) =>
  unwrap<KnowledgeRule>((await request.post('/internal/knowledge/rules', payload)).data);

export const updateKnowledgeRule = async (id: string, payload: Partial<KnowledgeRule>) =>
  unwrap<KnowledgeRule>((await request.put(`/internal/knowledge/rules/${id}`, payload)).data);

export const deleteKnowledgeRule = async (id: string) =>
  unwrap<{ id: string; deleted: boolean }>(
    (await request.delete(`/internal/knowledge/rules/${id}`)).data,
  );

export const fetchKnowledgeResources = async (params?: {
  domainType?: string;
  keyword?: string;
  contentType?: string;
}) => unwrap<KnowledgeResource[]>(
  (await request.get('/internal/knowledge/resources', { params })).data,
);

export const createKnowledgeResource = async (payload: Partial<KnowledgeResource>) =>
  unwrap<KnowledgeResource>((await request.post('/internal/knowledge/resources', payload)).data);

export const updateKnowledgeResource = async (id: string, payload: Partial<KnowledgeResource>) =>
  unwrap<KnowledgeResource>(
    (await request.put(`/internal/knowledge/resources/${id}`, payload)).data,
  );

export const deleteKnowledgeResource = async (id: string) =>
  unwrap<{ id: string; deleted: boolean }>(
    (await request.delete(`/internal/knowledge/resources/${id}`)).data,
  );

export const fetchGenerationTemplates = async (params?: { scene?: string }) =>
  unwrap<GenerationTemplate[]>(
    (await request.get('/internal/knowledge/templates', { params })).data,
  );

export const createGenerationTemplate = async (payload: Partial<GenerationTemplate>) =>
  unwrap<GenerationTemplate>((await request.post('/internal/knowledge/templates', payload)).data);

export const updateGenerationTemplate = async (id: string, payload: Partial<GenerationTemplate>) =>
  unwrap<GenerationTemplate>(
    (await request.put(`/internal/knowledge/templates/${id}`, payload)).data,
  );

export const deleteGenerationTemplate = async (id: string) =>
  unwrap<{ id: string; deleted: boolean }>(
    (await request.delete(`/internal/knowledge/templates/${id}`)).data,
  );

export const fetchGuidanceNotes = async (params?: { scene?: string }) =>
  unwrap<GuidanceNote[]>((await request.get('/internal/knowledge/notes', { params })).data);

export const createGuidanceNote = async (payload: Partial<GuidanceNote>) =>
  unwrap<GuidanceNote>((await request.post('/internal/knowledge/notes', payload)).data);

export const updateGuidanceNote = async (id: string, payload: Partial<GuidanceNote>) =>
  unwrap<GuidanceNote>((await request.put(`/internal/knowledge/notes/${id}`, payload)).data);

export const fetchChannels = async () =>
  unwrap<ChannelConfig[]>(
    (await request.get('/internal/channels', { params: { includeDisabled: true } })).data,
  );

export const createChannel = async (payload: Partial<ChannelConfig>) =>
  unwrap<ChannelConfig>((await request.post('/internal/channels', payload)).data);

export const updateChannel = async (id: number | string, payload: Partial<ChannelConfig>) =>
  unwrap<ChannelConfig>((await request.put(`/internal/channels/${id}`, payload)).data);

export const deleteChannel = async (id: number | string) =>
  unwrap<{ id: number; disabled: boolean }>((await request.delete(`/internal/channels/${id}`)).data);

export const reloadChannels = async () =>
  unwrap<{ success: boolean; channels_loaded?: number; channelsLoaded?: number }>(
    (await request.post('/internal/channels/reload')).data,
  );

export const configureChannelByChat = async (
  sessionId: string,
  message: string,
  history: ChannelConversationMessage[] = [],
) =>
  unwrap<ChannelConversationResult>(
    (
      await request.post('/internal/management/channel/configure', {
        session_id: sessionId,
        message,
        history,
      })
    ).data,
  );

export const fetchEvolutionStatus = async () =>
  unwrap<EvolutionStatus>((await request.get('/internal/management/optimization/evolution')).data);

export const runEvolutionNow = async (autoConfirm = false) =>
  unwrap<EvolutionRun>(
    (
      await request.post('/internal/management/optimization/evolution/run', {
        autoConfirm,
        actor: 'admin-ui',
      })
    ).data,
  );

export const approveEvolutionAction = async (id: string) =>
  unwrap<EvolutionAction>(
    (
      await request.post(`/internal/management/optimization/evolution/actions/${id}/approve`, {
        actor: 'admin-ui',
      })
    ).data,
  );

export const rejectEvolutionAction = async (id: string) =>
  unwrap<EvolutionAction>(
    (
      await request.post(`/internal/management/optimization/evolution/actions/${id}/reject`, {
        actor: 'admin-ui',
      })
    ).data,
  );

export const deleteGuidanceNote = async (id: string) =>
  unwrap<{ id: string; deleted: boolean }>(
    (await request.delete(`/internal/knowledge/notes/${id}`)).data,
  );
