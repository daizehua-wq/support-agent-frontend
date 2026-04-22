export type ApiEnvelope<TData, TMeta = undefined> = {
  success: boolean;
  message: string;
  data?: TData;
  meta?: TMeta;
  code?: number;
  traceId?: string;
  [key: string]: unknown;
};

type WrappedApiEnvelope<TData, TMeta = undefined> = {
  code?: number;
  traceId?: string;
  data?:
    | ApiEnvelope<TData, TMeta>
    | {
        success?: boolean;
        message?: string;
        data?: TData;
        meta?: TMeta;
        [key: string]: unknown;
      }
    | TData;
};

export type MaybeWrappedApiEnvelope<TData, TMeta = undefined> =
  | ApiEnvelope<TData, TMeta>
  | WrappedApiEnvelope<TData, TMeta>
  | {
      data?: ApiEnvelope<TData, TMeta> | TData;
      meta?: TMeta;
      success?: boolean;
      message?: string;
      code?: number;
      traceId?: string;
    }
  | TData;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const attachTransportMeta = <TData, TMeta = undefined>(
  envelope: ApiEnvelope<TData, TMeta>,
  rawResponse: Record<string, unknown>,
): ApiEnvelope<TData, TMeta> => {
  return {
    ...envelope,
    code: typeof rawResponse.code === 'number' ? rawResponse.code : envelope.code,
    traceId: typeof rawResponse.traceId === 'string' ? rawResponse.traceId : envelope.traceId,
  };
};

export function normalizeApiEnvelope<TData, TMeta = undefined>(
  rawResponse: MaybeWrappedApiEnvelope<TData, TMeta>,
  fallbackMessage: string,
): ApiEnvelope<TData, TMeta> {
  if (isRecord(rawResponse) && 'success' in rawResponse) {
    return rawResponse as ApiEnvelope<TData, TMeta>;
  }

  if (
    isRecord(rawResponse) &&
    'data' in rawResponse &&
    isRecord(rawResponse.data) &&
    'success' in rawResponse.data
  ) {
    return attachTransportMeta(
      rawResponse.data as ApiEnvelope<TData, TMeta>,
      rawResponse,
    );
  }

  if (isRecord(rawResponse) && 'data' in rawResponse) {
    if (isRecord(rawResponse.data) && ('message' in rawResponse.data || 'meta' in rawResponse.data)) {
      return attachTransportMeta(
        {
          ...(rawResponse.data as Record<string, unknown>),
          success:
            typeof rawResponse.data.success === 'boolean' ? rawResponse.data.success : true,
          message:
            typeof rawResponse.data.message === 'string'
              ? rawResponse.data.message
              : fallbackMessage,
          data: ('data' in rawResponse.data ? rawResponse.data.data : rawResponse.data) as TData,
          meta: ('meta' in rawResponse.data ? rawResponse.data.meta : undefined) as TMeta,
        } as ApiEnvelope<TData, TMeta>,
        rawResponse,
      );
    }

    return attachTransportMeta(
      {
        success: true,
        message: fallbackMessage,
        data: rawResponse.data as TData,
        meta: ('meta' in rawResponse ? rawResponse.meta : undefined) as TMeta,
      },
      rawResponse,
    );
  }

  return {
    success: true,
    message: fallbackMessage,
    data: rawResponse as TData,
  };
}
