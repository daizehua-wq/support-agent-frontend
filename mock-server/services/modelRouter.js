

import { getModulePolicy, isApiModelAllowed } from '../config/policyConfig.js';

export const MODEL_ROUTES = {
  LOCAL_LLM: 'local-llm',
  API_LLM: 'api-llm',
  TEMPLATE_FALLBACK: 'template-fallback',
};

export const shouldUseLocalLLM = ({ moduleName, useLocalLLM = false }) => {
  const modulePolicy = getModulePolicy(moduleName);
  return Boolean(useLocalLLM && modulePolicy?.localModelPreferred && !isApiModelAllowed(moduleName));
};

export const shouldUseApiLLM = ({ moduleName, useApiLLM = false }) => {
  return Boolean(useApiLLM && isApiModelAllowed(moduleName));
};

export const resolveModelRoute = ({
  moduleName,
  useLocalLLM = false,
  useApiLLM = false,
}) => {
  const modulePolicy = getModulePolicy(moduleName);

  if (!modulePolicy) {
    return {
      route: MODEL_ROUTES.TEMPLATE_FALLBACK,
      reason: 'module-policy-not-found',
      modulePolicy: null,
    };
  }

  if (shouldUseLocalLLM({ moduleName, useLocalLLM })) {
    return {
      route: MODEL_ROUTES.LOCAL_LLM,
      reason: 'local-model-enabled-by-policy',
      modulePolicy,
    };
  }

  if (shouldUseApiLLM({ moduleName, useApiLLM })) {
    return {
      route: MODEL_ROUTES.API_LLM,
      reason: 'api-model-enabled-by-policy',
      modulePolicy,
    };
  }

  return {
    route: MODEL_ROUTES.TEMPLATE_FALLBACK,
    reason: 'fallback-by-policy',
    modulePolicy,
  };
};