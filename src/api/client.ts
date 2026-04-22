import type { AxiosRequestConfig } from 'axios';
import { normalizeApiEnvelope, type ApiEnvelope, type MaybeWrappedApiEnvelope } from './helpers';
import request from './request';

type ApiRequestConfig = AxiosRequestConfig;

export async function apiGetEnvelope<TData, TMeta = undefined>(
  path: string,
  fallbackMessage: string,
  config?: ApiRequestConfig,
): Promise<ApiEnvelope<TData, TMeta>> {
  const rawResponse = (await request.get(path, config)) as MaybeWrappedApiEnvelope<TData, TMeta>;
  return normalizeApiEnvelope<TData, TMeta>(rawResponse, fallbackMessage);
}

export async function apiPostEnvelope<TData, TMeta = undefined>(
  path: string,
  payload: unknown,
  fallbackMessage: string,
  config?: ApiRequestConfig,
): Promise<ApiEnvelope<TData, TMeta>> {
  const rawResponse = (await request.post(
    path,
    payload,
    config,
  )) as MaybeWrappedApiEnvelope<TData, TMeta>;
  return normalizeApiEnvelope<TData, TMeta>(rawResponse, fallbackMessage);
}

export async function apiGetData<TData>(
  path: string,
  fallbackMessage: string,
  config?: ApiRequestConfig,
): Promise<TData> {
  const envelope = await apiGetEnvelope<TData>(path, fallbackMessage, config);
  return envelope.data as TData;
}

export async function apiPostData<TData>(
  path: string,
  payload: unknown,
  fallbackMessage: string,
  config?: ApiRequestConfig,
): Promise<TData> {
  const envelope = await apiPostEnvelope<TData>(path, payload, fallbackMessage, config);
  return envelope.data as TData;
}
