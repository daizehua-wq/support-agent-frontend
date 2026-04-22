const normalizeBaseUrl = (baseUrl = '') => baseUrl.replace(/\/$/, '');

const buildEndpointCandidates = (provider = '', baseUrl = '') => {
  const normalized = normalizeBaseUrl(baseUrl);

  if (!normalized) {
    return [];
  }

  if (normalized.endsWith('/api/chat') || normalized.endsWith('/chat/completions')) {
    return [normalized];
  }

  if (normalized.endsWith('/v1')) {
    return [`${normalized}/chat/completions`];
  }

  if (provider === 'local') {
    return [`${normalized}/api/chat`, `${normalized}/v1/chat/completions`, `${normalized}/chat/completions`];
  }

  return [`${normalized}/chat/completions`, `${normalized}/v1/chat/completions`];
};

const buildHeaders = (apiKey = '') => {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
};

const buildRequestBody = (modelConfig = {}, endpoint = '') => {
  if (endpoint.endsWith('/api/chat')) {
    return {
      model: modelConfig.modelName,
      messages: [{ role: 'user', content: 'ping' }],
      stream: false,
    };
  }

  return {
    model: modelConfig.modelName,
    messages: [{ role: 'user', content: 'ping' }],
    temperature: 0,
    max_tokens: 8,
  };
};

const buildResolvedModelFromConfig = (modelConfig = {}) => {
  const externalResolvedModel = modelConfig.resolvedModel || null;

  if (externalResolvedModel) {
    return externalResolvedModel;
  }

  return {
    resolvedModelId: modelConfig.id || modelConfig.activeModelId || '',
    resolvedProvider: modelConfig.modelProvider || '',
    resolvedBaseUrl: normalizeBaseUrl(modelConfig.baseUrl || modelConfig.apiBaseUrl || ''),
    resolvedModelName: modelConfig.modelName || '',
    source: 'direct-test-config',
    isResolved: Boolean(
      (modelConfig.modelProvider || '') &&
        (modelConfig.baseUrl || modelConfig.apiBaseUrl || '') &&
        (modelConfig.modelName || ''),
    ),
  };
};

export const testModelConnection = async (modelConfig = {}) => {
  const resolvedModel = buildResolvedModelFromConfig(modelConfig);
  const provider = resolvedModel.resolvedProvider || modelConfig.modelProvider || 'local';
  const baseUrl = normalizeBaseUrl(
    resolvedModel.resolvedBaseUrl || modelConfig.baseUrl || modelConfig.apiBaseUrl || '',
  );
  const apiKey = modelConfig.apiKey || '';
  const modelName = resolvedModel.resolvedModelName || modelConfig.modelName || '';
  const timeout = Number(modelConfig.timeout || 180000);

  const endpointCandidates = buildEndpointCandidates(provider, baseUrl);

  if (!baseUrl) {
    throw new Error('model baseUrl is required');
  }

  if (!modelName) {
    throw new Error('modelName is required');
  }

  if (endpointCandidates.length === 0) {
    throw new Error('model endpoint is required');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    let lastError = null;

    console.log('[test-model] start', {
      provider,
      baseUrl,
      modelName,
      endpointCandidates,
      resolvedModel,
    });

    for (const endpoint of endpointCandidates) {
      try {
        console.log('[test-model] trying endpoint', endpoint);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: buildHeaders(apiKey),
          body: JSON.stringify(buildRequestBody(modelConfig, endpoint)),
          signal: controller.signal,
        });

        const rawText = await response.text();

        if (!response.ok) {
          lastError = new Error(`model test failed: ${response.status} ${rawText}`);

          if (response.status === 404) {
            continue;
          }

          throw lastError;
        }

        let parsed;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          parsed = null;
        }

        console.log('[test-model] success', {
          provider,
          endpoint,
          modelName,
          resolvedModel,
          status: response.status,
        });

        return {
          success: true,
          provider,
          baseUrl,
          endpoint,
          modelName,
          resolvedModel,
          status: response.status,
          preview: parsed?.choices?.[0]?.message?.content || rawText.slice(0, 120),
        };
      } catch (error) {
        lastError = error;

        console.error('[test-model] endpoint failed', {
          endpoint,
          message: error?.message || String(error),
        });

        if (error?.name === 'AbortError') {
          throw error;
        }
      }
    }

    throw lastError || new Error('model test failed: no endpoint matched');
  } finally {
    clearTimeout(timer);
  }
};