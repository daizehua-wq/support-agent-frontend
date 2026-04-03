const SENSITIVE_FIELD_RULES = [
  { key: 'contactName', placeholder: '[客户联系人]' },
  { key: 'customerName', placeholder: '[客户公司]' },
  { key: 'companyName', placeholder: '[客户公司]' },
  { key: 'productDirection', placeholder: '[产品方向]' },
  { key: 'projectCode', placeholder: '[项目编号]' },
  { key: 'sampleCode', placeholder: '[样品编号]' },
  { key: 'phone', placeholder: '[联系电话]' },
  { key: 'email', placeholder: '[邮箱地址]' },
  { key: 'wechat', placeholder: '[微信号]' },
  { key: 'factoryName', placeholder: '[工厂名称]' },
];

const REMOVED_FIELD_KEYS = ['remark', 'internalNote', 'internalJudgement', 'internalStrategy'];

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

export const sanitizeForExternalLLM = (input = {}) => {
  const sourceText = input.customerText || '';
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

  REMOVED_FIELD_KEYS.forEach((key) => {
    if (typeof input[key] === 'string' && input[key].trim()) {
      removedFields[key] = input[key].trim();
    }
  });

  return {
    sanitizedText,
    mapping,
    removedFields,
  };
};

export const validatePlaceholderIntegrity = (text = '', mapping = {}) => {
  const placeholders = Object.keys(mapping);
  const missingPlaceholders = placeholders.filter((item) => !text.includes(item));
  const foundPlaceholders =
    text.match(/\[(客户联系人|客户公司|产品方向|项目编号|样品编号|联系电话|邮箱地址|微信号|工厂名称)(?:\d+)?\]/g) || [];
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
      Object.entries(data).map(([key, value]) => [key, restoreFromMapping(value, mapping)])
    );
  }

  return data;
};

export const sanitizeAnalyzePayload = (input = {}) => {
  const { sanitizedText, mapping, removedFields } = sanitizeForExternalLLM(input);

  return {
    sanitizedText,
    mapping,
    removedFields,
    safeMeta: {
      industryType: input.industryType || '',
      salesStage: input.salesStage || '',
      productDirection: mapping['[产品方向]'] ? '[产品方向]' : input.productDirection || '',
    },
  };
};