export const EMBEDDED_MODEL_SCHEMA_VERSION = 'embedded-model-preprocess/v2';
export const FAST_CHANNEL_SCHEMA_VERSION = 'fast-channel-route-test/v1';

export const EMBEDDED_MODEL_TASKS = Object.freeze({
  ROUTE_DECISION: 'route_decision',
  REQUEST_UNDERSTANDING: 'request_understanding',
  FIELD_EXTRACTION: 'field_extraction',
  STRUCTURED_TRANSFORM: 'structured_transform',
  TASK_PLANNER: 'task_planner',
});

export const EMBEDDED_MODEL_TASK_SET = new Set(Object.values(EMBEDDED_MODEL_TASKS));

export const EMBEDDED_MODEL_CAPABILITIES = new Set([
  'analyze',
  'search',
  'script',
  'session',
  'unknown',
]);

export const EMBEDDED_MODEL_ROUTES = new Set(['fast_channel', 'main_workflow']);

const SHORT_STRING = {
  type: 'string',
  maxLength: 32,
};

export const ROUTE_DECISION_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    routeDecision: {
      type: 'string',
      enum: ['fast_channel', 'main_workflow'],
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
    fallback: {
      type: 'boolean',
    },
  },
  required: ['routeDecision', 'confidence', 'fallback'],
};

export const REQUEST_UNDERSTANDING_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    capability: {
      type: 'string',
      enum: ['analyze', 'search', 'script', 'session', 'unknown'],
    },
    normalizedText: {
      type: 'string',
      maxLength: 48,
    },
    language: {
      type: 'string',
      maxLength: 12,
    },
    keywords: {
      type: 'array',
      maxItems: 3,
      items: SHORT_STRING,
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
    needsMainWorkflow: {
      type: 'boolean',
    },
  },
  required: [
    'capability',
    'normalizedText',
    'language',
    'keywords',
    'confidence',
    'needsMainWorkflow',
  ],
};

export const FIELD_EXTRACTION_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fields: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: SHORT_STRING,
          value: {
            type: 'string',
            maxLength: 48,
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
          },
        },
        required: ['name', 'value', 'confidence'],
      },
    },
    missingFields: {
      type: 'array',
      maxItems: 3,
      items: SHORT_STRING,
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
    needsMainWorkflow: {
      type: 'boolean',
    },
  },
  required: ['fields', 'missingFields', 'confidence', 'needsMainWorkflow'],
};

export const STRUCTURED_TRANSFORM_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    capability: {
      type: 'string',
      enum: ['analyze', 'search', 'script', 'session', 'unknown'],
    },
    routeDecision: {
      type: 'string',
      enum: ['fast_channel', 'main_workflow'],
    },
    normalizedText: {
      type: 'string',
      maxLength: 48,
    },
    keywords: {
      type: 'array',
      maxItems: 3,
      items: SHORT_STRING,
    },
    signals: {
      type: 'array',
      maxItems: 3,
      items: SHORT_STRING,
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
    fallback: {
      type: 'boolean',
    },
  },
  required: [
    'capability',
    'routeDecision',
    'normalizedText',
    'keywords',
    'signals',
    'confidence',
    'fallback',
  ],
};

export const TASK_PLANNER_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    taskType: {
      type: 'string',
      enum: ['full_workflow', 'customer_analysis', 'evidence_search', 'output_generation'],
    },
    taskTitle: {
      type: 'string',
      maxLength: 32,
    },
    understanding: {
      type: 'string',
      maxLength: 200,
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
    needsExternalSources: {
      type: 'boolean',
    },
    shouldGenerateOutput: {
      type: 'boolean',
    },
    missingInfoPolicy: {
      type: 'string',
      enum: ['strict', 'lenient', 'skip'],
    },
  },
  required: ['taskType', 'taskTitle', 'understanding', 'confidence'],
};

export const EMBEDDED_MODEL_JSON_SCHEMAS = Object.freeze({
  [EMBEDDED_MODEL_TASKS.ROUTE_DECISION]: ROUTE_DECISION_OUTPUT_SCHEMA,
  [EMBEDDED_MODEL_TASKS.REQUEST_UNDERSTANDING]: REQUEST_UNDERSTANDING_OUTPUT_SCHEMA,
  [EMBEDDED_MODEL_TASKS.FIELD_EXTRACTION]: FIELD_EXTRACTION_OUTPUT_SCHEMA,
  [EMBEDDED_MODEL_TASKS.STRUCTURED_TRANSFORM]: STRUCTURED_TRANSFORM_OUTPUT_SCHEMA,
  [EMBEDDED_MODEL_TASKS.TASK_PLANNER]: TASK_PLANNER_OUTPUT_SCHEMA,
});

const CONFIDENCE_GBNF = [
  '"0"',
  '"0.1"',
  '"0.2"',
  '"0.3"',
  '"0.4"',
  '"0.5"',
  '"0.6"',
  '"0.7"',
  '"0.8"',
  '"0.9"',
  '"1"',
  '"1.0"',
].join(' | ');

const JSON_STRING_GBNF = [
  'string ::= "\\"" char{0,48} "\\""',
  'shortstring ::= "\\"" char{0,24} "\\""',
  'char ::= [^"\\\\\\x7F\\x00-\\x1F] | "\\\\" (["\\\\/bfnrt] | "u" [0-9a-fA-F]{4})',
].join('\n');

const COMMON_GBNF = [
  `confidence ::= ${CONFIDENCE_GBNF}`,
  'boolean ::= "true" | "false"',
  'route ::= "\\"fast_channel\\"" | "\\"main_workflow\\""',
  'capability ::= "\\"analyze\\"" | "\\"search\\"" | "\\"script\\"" | "\\"session\\"" | "\\"unknown\\""',
  JSON_STRING_GBNF,
].join('\n');

export const EMBEDDED_MODEL_GBNF_GRAMMARS = Object.freeze({
  [EMBEDDED_MODEL_TASKS.ROUTE_DECISION]: [
    'root ::= "{" "\\"" "routeDecision" "\\"" ":" route "," "\\"" "confidence" "\\"" ":" confidence "," "\\"" "fallback" "\\"" ":" boolean "}"',
    COMMON_GBNF,
  ].join('\n'),
  [EMBEDDED_MODEL_TASKS.REQUEST_UNDERSTANDING]: [
    'root ::= "{" "\\"" "capability" "\\"" ":" capability "," "\\"" "normalizedText" "\\"" ":" string "," "\\"" "language" "\\"" ":" shortstring "," "\\"" "keywords" "\\"" ":[" stringlist "]," "\\"" "confidence" "\\"" ":" confidence "," "\\"" "needsMainWorkflow" "\\"" ":" boolean "}"',
    'stringlist ::= (string ("," string)?)?',
    COMMON_GBNF,
  ].join('\n'),
  [EMBEDDED_MODEL_TASKS.FIELD_EXTRACTION]: [
    'root ::= "{" "\\"" "fields" "\\"" ":[" fieldlist "]," "\\"" "missingFields" "\\"" ":[" stringlist "]," "\\"" "confidence" "\\"" ":" confidence "," "\\"" "needsMainWorkflow" "\\"" ":" boolean "}"',
    'fieldlist ::= field ("," field)?',
    'field ::= "{" "\\"" "name" "\\"" ":" shortstring "," "\\"" "value" "\\"" ":" string "," "\\"" "confidence" "\\"" ":" confidence "}"',
    'stringlist ::= (string ("," string)?)?',
    COMMON_GBNF,
  ].join('\n'),
  [EMBEDDED_MODEL_TASKS.STRUCTURED_TRANSFORM]: [
    'root ::= "{" "\\"" "capability" "\\"" ":" capability "," "\\"" "routeDecision" "\\"" ":" route "," "\\"" "normalizedText" "\\"" ":" string "," "\\"" "keywords" "\\"" ":[" stringlist "]," "\\"" "signals" "\\"" ":[" stringlist "]," "\\"" "confidence" "\\"" ":" confidence "," "\\"" "fallback" "\\"" ":" boolean "}"',
    'stringlist ::= (string ("," string)?)?',
    COMMON_GBNF,
  ].join('\n'),
  [EMBEDDED_MODEL_TASKS.TASK_PLANNER]: [
    'root ::= "{" "\\"" "taskType" "\\"" ":" tasktype "," "\\"" "taskTitle" "\\"" ":" string "," "\\"" "understanding" "\\"" ":" longstr "," "\\"" "confidence" "\\"" ":" confidence ("," "\\"" "needsExternalSources" "\\"" ":" boolean)? ("," "\\"" "shouldGenerateOutput" "\\"" ":" boolean)? ("," "\\"" "missingInfoPolicy" "\\"" ":" policy)? "}"',
    'tasktype ::= "\\""full_workflow\\"" | "\\""customer_analysis\\"" | "\\""evidence_search\\"" | "\\""output_generation\\""',
    'policy ::= "\\""strict\\"" | "\\""lenient\\"" | "\\""skip\\""',
    'longstr ::= "\\"" char{0,200} "\\""',
    COMMON_GBNF,
  ].join('\n'),
});

export const normalizeText = (value = '') => String(value || '').trim();

export const normalizeEmbeddedModelTask = (value = '') => {
  const task = normalizeText(value).toLowerCase();
  return EMBEDDED_MODEL_TASK_SET.has(task)
    ? task
    : EMBEDDED_MODEL_TASKS.ROUTE_DECISION;
};

export const getEmbeddedModelJsonSchema = (task = EMBEDDED_MODEL_TASKS.ROUTE_DECISION) =>
  EMBEDDED_MODEL_JSON_SCHEMAS[normalizeEmbeddedModelTask(task)] ||
  EMBEDDED_MODEL_JSON_SCHEMAS[EMBEDDED_MODEL_TASKS.ROUTE_DECISION];

const clampConfidence = (value = 0) => {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.min(1, Math.max(0, numberValue));
};

const normalizeStringArray = (value = [], maxLength = 8) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, maxLength);
};

export const sanitizeModelJsonText = (rawText = '') => {
  const cleanedText = normalizeText(rawText)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  if (!cleanedText) {
    return '';
  }

  const firstBrace = cleanedText.indexOf('{');
  const lastBrace = cleanedText.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return cleanedText.slice(firstBrace, lastBrace + 1);
  }

  return cleanedText;
};

export const parseEmbeddedModelJson = (rawText = '') => {
  const jsonText = sanitizeModelJsonText(rawText);

  if (!jsonText) {
    const error = new Error('embedded model returned empty text');
    error.code = 'INVALID_JSON';
    throw error;
  }

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    const parseError = new Error(`embedded model returned invalid json: ${error.message}`);
    parseError.code = 'INVALID_JSON';
    parseError.rawText = rawText;
    throw parseError;
  }
};

const normalizeCapability = (value = '') => {
  const capability = normalizeText(value).toLowerCase();
  return EMBEDDED_MODEL_CAPABILITIES.has(capability) ? capability : 'unknown';
};

const normalizeRoute = (value = '') => {
  const route = normalizeText(value).toLowerCase();
  return EMBEDDED_MODEL_ROUTES.has(route) ? route : 'main_workflow';
};

const normalizeFieldItems = (value = []) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      name: normalizeText(item?.name).slice(0, 32),
      value: normalizeText(item?.value).slice(0, 48),
      confidence: clampConfidence(item?.confidence),
    }))
    .filter((item) => item.name && item.value)
    .slice(0, 5);
};

export const normalizeEmbeddedModelOutput = (
  value = {},
  task = EMBEDDED_MODEL_TASKS.ROUTE_DECISION,
) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error('embedded model output must be a JSON object');
    error.code = 'INVALID_JSON';
    throw error;
  }

  const normalizedTask = normalizeEmbeddedModelTask(task);

  if (normalizedTask === EMBEDDED_MODEL_TASKS.ROUTE_DECISION) {
    const routeDecision = normalizeRoute(value.routeDecision || value.route);

    return {
      schemaVersion: `${EMBEDDED_MODEL_SCHEMA_VERSION}/route-decision`,
      task: normalizedTask,
      routeDecision,
      confidence: clampConfidence(value.confidence),
      fallback: routeDecision !== 'fast_channel',
    };
  }

  if (normalizedTask === EMBEDDED_MODEL_TASKS.REQUEST_UNDERSTANDING) {
    return {
      schemaVersion: `${EMBEDDED_MODEL_SCHEMA_VERSION}/request-understanding`,
      task: normalizedTask,
      capability: normalizeCapability(value.capability),
      normalizedText: normalizeText(value.normalizedText).slice(0, 48),
      language: normalizeText(value.language) || 'unknown',
      keywords: normalizeStringArray(value.keywords, 3),
      confidence: clampConfidence(value.confidence),
      needsMainWorkflow: value.needsMainWorkflow === true,
    };
  }

  if (normalizedTask === EMBEDDED_MODEL_TASKS.FIELD_EXTRACTION) {
    return {
      schemaVersion: `${EMBEDDED_MODEL_SCHEMA_VERSION}/field-extraction`,
      task: normalizedTask,
      fields: normalizeFieldItems(value.fields),
      missingFields: normalizeStringArray(value.missingFields, 3),
      confidence: clampConfidence(value.confidence),
      needsMainWorkflow: value.needsMainWorkflow === true,
    };
  }

  if (normalizedTask === EMBEDDED_MODEL_TASKS.TASK_PLANNER) {
    return {
      schemaVersion: `${EMBEDDED_MODEL_SCHEMA_VERSION}/task-planner`,
      task: normalizedTask,
      taskType: normalizeText(value.taskType) || 'full_workflow',
      taskTitle: normalizeText(value.taskTitle).slice(0, 32),
      understanding: normalizeText(value.understanding).slice(0, 200),
      confidence: clampConfidence(value.confidence),
      needsExternalSources: value.needsExternalSources === true,
      shouldGenerateOutput: value.shouldGenerateOutput !== false,
      missingInfoPolicy: normalizeText(value.missingInfoPolicy) || 'lenient',
    };
  }

  const routeDecision = normalizeRoute(value.routeDecision || value.route);

  return {
    schemaVersion: `${EMBEDDED_MODEL_SCHEMA_VERSION}/structured-transform`,
    task: EMBEDDED_MODEL_TASKS.STRUCTURED_TRANSFORM,
    capability: normalizeCapability(value.capability),
    routeDecision,
    normalizedText: normalizeText(value.normalizedText).slice(0, 48),
    keywords: normalizeStringArray(value.keywords, 3),
    signals: normalizeStringArray(value.signals, 3),
    confidence: clampConfidence(value.confidence),
    fallback: value.fallback === true || routeDecision === 'main_workflow',
  };
};

export const validateEmbeddedModelOutput = (output = {}, options = {}) => {
  const minConfidence = Number.isFinite(Number(options.minConfidence))
    ? Number(options.minConfidence)
    : 0.6;
  const task = normalizeEmbeddedModelTask(options.task);
  const normalized = normalizeEmbeddedModelOutput(output, task);

  if (task === EMBEDDED_MODEL_TASKS.REQUEST_UNDERSTANDING && !normalized.normalizedText) {
    return {
      ok: false,
      reason: 'normalized_text_missing',
      data: normalized,
    };
  }

  if (task === EMBEDDED_MODEL_TASKS.TASK_PLANNER && !normalized.understanding) {
    return {
      ok: false,
      reason: 'understanding_missing',
      data: normalized,
    };
  }

  if (task === EMBEDDED_MODEL_TASKS.STRUCTURED_TRANSFORM && !normalized.normalizedText) {
    return {
      ok: false,
      reason: 'normalized_text_missing',
      data: normalized,
    };
  }

  if (normalized.confidence < minConfidence) {
    return {
      ok: false,
      reason: 'low_confidence',
      data: normalized,
    };
  }

  return {
    ok: true,
    reason: 'valid',
    data: normalized,
  };
};

const buildCompactInput = ({
  text = '',
  domainType = '',
  workflowStage = '',
  goal = '',
  locale = 'zh-CN',
} = {}) => ({
  text: normalizeText(text).slice(0, 160),
  domainType: normalizeText(domainType).slice(0, 32),
  workflowStage: normalizeText(workflowStage).slice(0, 32),
  goal: normalizeText(goal).slice(0, 48),
  locale: normalizeText(locale) || 'zh-CN',
});

const TASK_PROMPT_LINES = Object.freeze({
  [EMBEDDED_MODEL_TASKS.ROUTE_DECISION]: [
    '任务: route_decision',
    '输出字段: routeDecision(fast_channel|main_workflow), confidence(0-1), fallback(boolean)。',
    '短闲聊/明确轻量归一化走fast_channel且fallback=false；信息不足/复杂/要外部知识走main_workflow且fallback=true。',
    '必须输出单行紧凑JSON，不要空格换行。',
  ],
  [EMBEDDED_MODEL_TASKS.REQUEST_UNDERSTANDING]: [
    '任务: request_understanding',
    '输出字段: capability, normalizedText, language, keywords, confidence, needsMainWorkflow。',
    'normalizedText<=48字；keywords最多3个。',
  ],
  [EMBEDDED_MODEL_TASKS.FIELD_EXTRACTION]: [
    '任务: field_extraction',
    '输出字段: fields[{name,value,confidence}], missingFields, confidence, needsMainWorkflow。',
    '只抽取输入中明确出现的通用字段；fields最多5个。',
  ],
  [EMBEDDED_MODEL_TASKS.STRUCTURED_TRANSFORM]: [
    '任务: structured_transform',
    '输出字段: capability, routeDecision, normalizedText, keywords, signals, confidence, fallback。',
    '只做轻量结构化；复杂或不确定 routeDecision=main_workflow。',
  ],
  [EMBEDDED_MODEL_TASKS.TASK_PLANNER]: [
    '任务: task_planner',
    '输出字段: taskType, taskTitle(<=32字), understanding(<=200字), confidence(0-1), needsExternalSources(boolean), shouldGenerateOutput(boolean), missingInfoPolicy(strict|lenient|skip)。',
    '根据用户目标选择最佳 taskType；understanding 必须用中文描述系统对任务目标的理解。',
    '涉及企查查/工商/经营风险/外部资料 → needsExternalSources=true。',
    '需要生成交付文稿/报告/邮件 → shouldGenerateOutput=true。',
    '必须输出单行紧凑JSON，不要空格换行。',
  ],
});

export const buildEmbeddedModelPrompt = (input = {}, options = {}) => {
  const task = normalizeEmbeddedModelTask(options.task || input.task);
  const taskLines = TASK_PROMPT_LINES[task] || TASK_PROMPT_LINES[EMBEDDED_MODEL_TASKS.ROUTE_DECISION];

  return [
    ...taskLines,
    '只输出JSON。',
    `输入:${JSON.stringify(buildCompactInput(input))}`,
  ].join('\n');
};

export const buildFallbackRouteDecision = ({
  reason = 'fallback',
  text = '',
  domainType = '',
  workflowStage = '',
  appId = '',
  task = EMBEDDED_MODEL_TASKS.ROUTE_DECISION,
  modelStatus = null,
  embeddedModel = null,
} = {}) => {
  return {
    schemaVersion: FAST_CHANNEL_SCHEMA_VERSION,
    route: 'main_workflow',
    source: 'fallback',
    fallback: true,
    fallbackReason: normalizeText(reason) || 'fallback',
    confidence: 0,
    appId: normalizeText(appId),
    input: {
      text: normalizeText(text),
      domainType: normalizeText(domainType),
      workflowStage: normalizeText(workflowStage),
      task: normalizeEmbeddedModelTask(task),
    },
    rule: null,
    embeddedModel,
    modelStatus,
  };
};
