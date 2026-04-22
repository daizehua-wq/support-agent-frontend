type ApiErrorPayload = {
  code?: string;
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
  data?: {
    code?: string;
    message?: string;
  };
};

type ApiErrorLike = {
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
  response?: {
    data?: ApiErrorPayload;
  };
};

const asApiError = (error: unknown): ApiErrorLike => (error || {}) as ApiErrorLike;

export const getApiErrorCode = (error: unknown): string => {
  const parsedError = asApiError(error);
  return (
    parsedError.response?.data?.error?.code ||
    parsedError.response?.data?.code ||
    parsedError.response?.data?.data?.code ||
    parsedError.error?.code ||
    ''
  );
};

export const getApiErrorMessage = (error: unknown, fallbackMessage: string): string => {
  const parsedError = asApiError(error);
  return (
    parsedError.response?.data?.error?.message ||
    parsedError.response?.data?.message ||
    parsedError.response?.data?.data?.message ||
    parsedError.error?.message ||
    parsedError.message ||
    fallbackMessage
  );
};
