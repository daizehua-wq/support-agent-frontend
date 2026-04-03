import { resolveModelRoute, MODEL_ROUTES } from './modelRouter.js';
import { generateScriptWithLocalLLM } from './localLLMService.js';
import { generateScriptWithAPILLM } from './apiLLMService.js';

export const generateScriptWithLLM = async ({
  moduleName = 'generateScript',
  useLocalLLM = false,
  useApiLLM = false,
  ...payload
}) => {
  const routeResult = resolveModelRoute({
    moduleName,
    useLocalLLM,
    useApiLLM,
  });

  if (routeResult.route === MODEL_ROUTES.LOCAL_LLM) {
    const result = await generateScriptWithLocalLLM(payload);

    const finalRoute =
      result.source === 'local-llm' ? MODEL_ROUTES.LOCAL_LLM : MODEL_ROUTES.TEMPLATE_FALLBACK;

    return {
      ...result,
      route: finalRoute,
      routeReason: result.reason || routeResult.reason,
      modulePolicy: routeResult.modulePolicy,
    };
  }

  if (routeResult.route === MODEL_ROUTES.API_LLM) {
    const result = await generateScriptWithAPILLM(payload);

    const finalRoute = result.source === 'api-llm' ? MODEL_ROUTES.API_LLM : MODEL_ROUTES.TEMPLATE_FALLBACK;

    return {
      ...result,
      route: finalRoute,
      routeReason: result.reason || routeResult.reason,
      modulePolicy: routeResult.modulePolicy,
    };
  }

  return {
    prompt: '',
    rewrittenScript: payload.selectedTemplate || '',
    source: 'template-fallback',
    route: MODEL_ROUTES.TEMPLATE_FALLBACK,
    routeReason: routeResult.reason,
    modulePolicy: routeResult.modulePolicy,
  };
};