import request from './request';
import { normalizeApiEnvelope, type MaybeWrappedApiEnvelope } from './helpers';

export type AppStatus = 'active' | 'suspended' | 'deleted';

export type ManagedApp = {
  id: string;
  name: string;
  description?: string;
  api_key_prefix?: string;
  apiKeyPrefix?: string;
  api_key?: string;
  apiKey?: string;
  status: AppStatus;
  rate_limit_per_min?: number;
  rateLimitPerMin?: number;
  max_tokens_per_day?: number;
  maxTokensPerDay?: number;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
};

export type AppUsageRecord = {
  id?: number;
  app_id?: string;
  appId?: string;
  date: string;
  api_calls?: number;
  apiCalls?: number;
  tokens_used?: number;
  tokensUsed?: number;
};

export type InternalStats = {
  totalApps: number;
  activeApps: number;
  todayApiCalls: number;
  todayTokensUsed: number;
};

export type CreateAppPayload = {
  name: string;
  description?: string;
  rateLimit?: number;
  maxTokens?: number;
  idempotencyKey?: string;
};

export type UpdateAppPayload = Partial<CreateAppPayload> & {
  status?: Exclude<AppStatus, 'deleted'>;
};

async function unwrapData<TData>(requestPromise: Promise<unknown>, fallbackMessage: string) {
  const rawResponse = await requestPromise;
  const envelope = normalizeApiEnvelope<TData>(
    rawResponse as MaybeWrappedApiEnvelope<TData>,
    fallbackMessage,
  );
  return envelope.data as TData;
}

export async function getApps() {
  return unwrapData<ManagedApp[]>(request.get('/internal/apps'), '应用列表加载成功');
}

export async function createApp(data: CreateAppPayload) {
  return unwrapData<ManagedApp>(request.post('/internal/apps', data), '应用创建成功');
}

export async function updateApp(id: string, data: UpdateAppPayload) {
  return unwrapData<ManagedApp>(request.put(`/internal/apps/${id}`, data), '应用更新成功');
}

export async function deleteApp(id: string) {
  return unwrapData<{ id: string; deleted: boolean }>(
    request.delete(`/internal/apps/${id}`),
    '应用删除成功',
  );
}

export async function getAppUsage(id: string, start: string, end: string) {
  return unwrapData<AppUsageRecord[]>(
    request.get(`/internal/apps/${id}/usage`, {
      params: {
        start,
        end,
      },
    }),
    '应用用量加载成功',
  );
}

export async function getInternalStats() {
  return unwrapData<InternalStats>(request.get('/internal/stats'), '统计数据加载成功');
}
