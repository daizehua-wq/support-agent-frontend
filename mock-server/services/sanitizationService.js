const SENSITIVE_FIELD_RULES = [
  { key: 'contactName', placeholder: '[客户联系人]' },
  { key: 'customerName', placeholder: '[客户公司]' },
  { key: 'companyName', placeholder: '[客户公司]' },
  { key: 'taskSubject', placeholder: '[任务主题]' },
  { key: 'productDirection', placeholder: '[任务主题]' },
  { key: 'projectCode', placeholder: '[项目编号]' },
  { key: 'sampleCode', placeholder: '[样品编号]' },
  { key: 'phone', placeholder: '[联系电话]' },
  { key: 'email', placeholder: '[邮箱地址]' },
  { key: 'wechat', placeholder: '[微信号]' },
  { key: 'factoryName', placeholder: '[工厂名称]' },
];

const REMOVED_FIELD_KEYS = ['remark', 'internalNote', 'internalJudgement', 'internalStrategy'];

const SEMANTIC_ABSTRACTION_RULES = [
  {
    type: 'time_window',
    pattern: /(下周|本周|本月|下个月|本季度|近期)/g,
    replacement: '近期',
  },
  {
    type: 'testing_plan',
    pattern: /(安排打样|安排测试|开始打样|开始测试|安排验证|导入测试)/g,
    replacement: '计划安排样品测试',
  },
  {
    type: 'project_stage',
    pattern: /(导入阶段|验证阶段|试样阶段|打样阶段|评估阶段)/g,
    replacement: '评估阶段',
  },
  {
    type: 'factory_location',
    pattern: /[\u4e00-\u9fa5A-Za-z0-9-]{2,20}(厂区|产线|车间)/g,
    replacement: '某生产现场',
  },
  {
    type: 'purchase_timing',
    pattern: /(准备采购|准备下单|下单安排|采购节奏)/g,
    replacement: '近期采购安排',
  },
];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const replaceAllSafe = (text, target, placeholder) => {
  if (!text || !target) {
    return text;
  }

  const pattern = new RegExp(escapeRegExp(target), 'g');
  return text.replace(pattern, placeholder);
};

const nextIndexedPlaceholder = (basePlaceholder, existingMapping = {}) => {
  if (!existingMapping[basePlaceholder]) {
    return basePlaceholder;
  }

  let index = 2;
  while (existingMapping[`${basePlaceholder}${index}`]) {
    index += 1;
  }

  return `${basePlaceholder}${index}`;
};

const collectAutoContactMatches = (text, existingMapping = {}) => {
  const autoMapping = {};
  let nextText = text || '';

  const contactPatterns = [
    /[\u4e00-\u9fa5]{1,3}(总|工|经理|主任|老师|总监)/g,
    /\b[A-Z][a-zA-Z]{1,20}\b/g,
  ];

  contactPatterns.forEach((pattern) => {
    const matches = nextText.match(pattern) || [];
    matches.forEach((item) => {
      if (!item || item.startsWith('[') || item.endsWith(']')) {
        return;
      }

      const placeholder = nextIndexedPlaceholder('[客户联系人]', {
        ...existingMapping,
        ...autoMapping,
      });

      autoMapping[placeholder] = item;
      nextText = replaceAllSafe(nextText, item, placeholder);
    });
  });

  return {
    sanitizedText: nextText,
    mapping: autoMapping,
  };
};

const collectAutoSensitiveMatches = (text, existingMapping = {}) => {
  const autoMapping = {};
  let nextText = text || '';

  const phoneMatches = nextText.match(/1[3-9]\d{9}/g) || [];
  phoneMatches.forEach((item, index) => {
    const placeholder = index === 0 ? '[联系电话]' : `[联系电话${index + 1}]`;
    autoMapping[placeholder] = item;
    nextText = replaceAllSafe(nextText, item, placeholder);
  });

  const emailMatches = nextText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
  emailMatches.forEach((item, index) => {
    const placeholder = index === 0 ? '[邮箱地址]' : `[邮箱地址${index + 1}]`;
    autoMapping[placeholder] = item;
    nextText = replaceAllSafe(nextText, item, placeholder);
  });

  const contactResult = collectAutoContactMatches(nextText, {
    ...existingMapping,
    ...autoMapping,
  });
  nextText = contactResult.sanitizedText;
  Object.assign(autoMapping, contactResult.mapping);

  return {
    sanitizedText: nextText,
    mapping: autoMapping,
  };
};

const abstractBusinessSensitiveText = (text = '') => {
  let nextText = text;
  const detectedTypes = [];

  SEMANTIC_ABSTRACTION_RULES.forEach((rule) => {
    if (rule.pattern.test(nextText)) {
      detectedTypes.push(rule.type);
      nextText = nextText.replace(rule.pattern, rule.replacement);
    }
    rule.pattern.lastIndex = 0;
  });

  return {
    sanitizedText: nextText,
    detectedTypes,
  };
};

const detectSensitiveTypes = ({ mapping = {}, sanitizedText = '' }) => {
  const detectedTypes = new Set();

  Object.keys(mapping).forEach((placeholder) => {
    if (placeholder.startsWith('[客户联系人]') || placeholder.startsWith('[客户联系人')) {
      detectedTypes.add('person');
    }
    if (placeholder.startsWith('[客户公司]')) {
      detectedTypes.add('company');
    }
    if (placeholder.startsWith('[联系电话]') || placeholder.startsWith('[联系电话')) {
      detectedTypes.add('phone');
    }
    if (placeholder.startsWith('[邮箱地址]') || placeholder.startsWith('[邮箱地址')) {
      detectedTypes.add('email');
    }
    if (placeholder.startsWith('[微信号]')) {
      detectedTypes.add('wechat');
    }
    if (placeholder.startsWith('[项目编号]')) {
      detectedTypes.add('project_code');
    }
    if (placeholder.startsWith('[样品编号]')) {
      detectedTypes.add('sample_code');
    }
    if (placeholder.startsWith('[工厂名称]')) {
      detectedTypes.add('factory');
    }
    if (placeholder.startsWith('[任务主题]')) {
      detectedTypes.add('task_subject');
    }
  });

  if (/评估阶段|计划安排样品测试|近期采购安排|某生产现场/.test(sanitizedText)) {
    detectedTypes.add('business_context');
  }

  return Array.from(detectedTypes);
};

export const sanitizeForExternalLLM = (input = {}) => {
  const sourceText = input.taskInput || input.customerText || '';
  let sanitizedText = sourceText;
  const mapping = {};
  const removedFields = {};

  const candidates = SENSITIVE_FIELD_RULES.map((rule) => ({
    placeholder: rule.placeholder,
    value: input[rule.key],
  }))
    .filter((item) => typeof item.value === 'string' && item.value.trim())
    .sort((a, b) => b.value.length - a.value.length);

  candidates.forEach((item) => {
    mapping[item.placeholder] = item.value.trim();
    sanitizedText = replaceAllSafe(sanitizedText, item.value.trim(), item.placeholder);
  });

  const autoResult = collectAutoSensitiveMatches(sanitizedText, mapping);
  sanitizedText = autoResult.sanitizedText;
  Object.assign(mapping, autoResult.mapping);

  const semanticResult = abstractBusinessSensitiveText(sanitizedText);
  sanitizedText = semanticResult.sanitizedText;

  REMOVED_FIELD_KEYS.forEach((key) => {
    if (typeof input[key] === 'string' && input[key].trim()) {
      removedFields[key] = input[key].trim();
    }
  });

  const detectedSensitiveTypes = Array.from(
    new Set([
      ...detectSensitiveTypes({ mapping, sanitizedText }),
      ...semanticResult.detectedTypes,
    ]),
  );

  return {
    sanitizedText,
    mapping,
    removedFields,
    detectedSensitiveTypes,
  };
};

export const validatePlaceholderIntegrity = (text = '', mapping = {}) => {
  const placeholders = Object.keys(mapping);
  const missingPlaceholders = placeholders.filter((item) => !text.includes(item));
  const foundPlaceholders =
    text.match(/\[(客户联系人|客户公司|任务主题|项目编号|样品编号|联系电话|邮箱地址|微信号|工厂名称)(?:\d+)?\]/g) || [];
  const unknownPlaceholders = foundPlaceholders.filter((item) => !placeholders.includes(item));

  return {
    isValid: missingPlaceholders.length === 0 && unknownPlaceholders.length === 0,
    missingPlaceholders,
    unknownPlaceholders,
  };
};

export const restorePlaceholdersInText = (text = '', mapping = {}) => {
  let nextText = text;

  Object.entries(mapping)
    .sort((a, b) => b[0].length - a[0].length)
    .forEach(([placeholder, realValue]) => {
      nextText = replaceAllSafe(nextText, placeholder, realValue);
    });

  return nextText;
};

export const restoreFromMapping = (data, mapping = {}) => {
  if (typeof data === 'string') {
    return restorePlaceholdersInText(data, mapping);
  }

  if (Array.isArray(data)) {
    return data.map((item) => restoreFromMapping(item, mapping));
  }

  if (data && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, restoreFromMapping(value, mapping)]),
    );
  }

  return data;
};

export const judgeOutboundAllowed = ({
  moduleName = 'generateScript',
  strategy = 'raw-local',
  sanitizedText = '',
  detectedSensitiveTypes = [],
}) => {
  if (strategy === 'raw-local') {
    return {
      outboundAllowed: false,
      outboundReason: `${moduleName}-raw-local-only`,
    };
  }

  if (strategy === 'raw-api') {
    return {
      outboundAllowed: true,
      outboundReason: `${moduleName}-raw-api-explicitly-allowed`,
    };
  }

  if (strategy === 'masked-api') {
    const hasSanitizedText = Boolean(sanitizedText && sanitizedText.trim());
    const hasDetectedContent = detectedSensitiveTypes.length >= 0;

    return {
      outboundAllowed: hasSanitizedText && hasDetectedContent,
      outboundReason: hasSanitizedText
        ? `${moduleName}-masked-api-allowed`
        : `${moduleName}-masked-api-empty-text-blocked`,
    };
  }

  return {
    outboundAllowed: false,
    outboundReason: `${moduleName}-strategy-not-supported`,
  };
};

export const buildOutboundSanitizationResult = ({
  moduleName = 'generateScript',
  strategy = 'masked-api',
  input = {},
  sourceText = '',
}) => {
  const originalText = sourceText || input.taskInput || input.customerText || '';
  const baseResult = sanitizeForExternalLLM({
    ...input,
    taskInput: originalText,
    customerText: originalText,
  });

  const outboundDecision = judgeOutboundAllowed({
    moduleName,
    strategy,
    sanitizedText: baseResult.sanitizedText,
    detectedSensitiveTypes: baseResult.detectedSensitiveTypes,
  });

  return {
    originalText,
    sanitizedText: baseResult.sanitizedText,
    mapping: baseResult.mapping,
    removedFields: baseResult.removedFields,
    detectedSensitiveTypes: baseResult.detectedSensitiveTypes,
    outboundAllowed: outboundDecision.outboundAllowed,
    outboundReason: outboundDecision.outboundReason,
  };
};

export const sanitizeAnalyzePayload = (input = {}) => {
  const { sanitizedText, mapping, removedFields, detectedSensitiveTypes } =
    sanitizeForExternalLLM(input);

  return {
    sanitizedText,
    mapping,
    removedFields,
    detectedSensitiveTypes,
    safeMeta: {
      industryType: input.industryType || '',
      taskPhase: input.taskPhase || input.salesStage || '',
      taskSubject:
        mapping['[任务主题]'] ? '[任务主题]' : input.taskSubject || input.productDirection || '',
    },
  };
};
