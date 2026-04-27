const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeString = (value = '') => String(value || '').trim();

const firstNonEmptyString = (...values) => {
  for (const value of values) {
    const normalizedValue = normalizeString(value);
    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return '';
};

const normalizeBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === 'true') return true;
    if (normalizedValue === 'false') return false;
  }

  return fallback;
};

const toPlainObject = (value) => (isPlainObject(value) ? { ...value } : {});

const normalizeAttachments = (value = []) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (typeof item === 'string') {
        const normalizedItem = normalizeString(item);
        if (!normalizedItem) {
          return null;
        }

        return {
          id: `attachment-${index + 1}`,
          name: normalizedItem,
          type: 'text',
          value: normalizedItem,
        };
      }

      if (!isPlainObject(item)) {
        return null;
      }

      const record = item;
      const name =
        firstNonEmptyString(record.name, record.title, record.filename, record.fileName) ||
        `attachment-${index + 1}`;

      return {
        id: firstNonEmptyString(record.id, `attachment-${index + 1}`),
        name,
        type: firstNonEmptyString(record.type, record.mimeType, 'file'),
        value: firstNonEmptyString(record.value, record.url, record.path, record.summary),
        summary: firstNonEmptyString(record.summary),
        metadata: toPlainObject(record.metadata),
      };
    })
    .filter(Boolean);
};

const inferComposeScene = (goal = '', deliverable = '', taskInput = '') => {
  const mergedText = `${goal} ${deliverable} ${taskInput}`;

  if (
    mergedText.includes('测试') ||
    mergedText.includes('样品') ||
    mergedText.includes('验证') ||
    mergedText.includes('推进') ||
    mergedText.includes('跟进')
  ) {
    return 'sample_followup';
  }

  if (
    mergedText.includes('技术') ||
    mergedText.includes('参数') ||
    mergedText.includes('说明') ||
    mergedText.includes('答复')
  ) {
    return 'technical_reply';
  }

  if (mergedText.includes('重新') || mergedText.includes('激活') || mergedText.includes('召回')) {
    return 'reactivate';
  }

  return 'first_reply';
};

const buildDefaultGoal = (capability = 'judge') => {
  if (capability === 'retrieve') return '整理相关资料并返回可复用依据';
  if (capability === 'compose') return '生成可直接参考的文稿草案';
  return '完成任务判断并给出建议';
};

const buildDefaultDeliverable = (capability = 'judge') => {
  if (capability === 'retrieve') return '资料清单、证据摘要与检索结论';
  if (capability === 'compose') return '参考文稿、提纲或正文';
  return '判断摘要、风险提示与下一步建议';
};

const seedVariables = (rawInput = {}) => {
  const inputVariables = toPlainObject(rawInput.variables);
  const mergedVariables = {
    ...inputVariables,
  };

  const seedEntries = {
    taskObject: rawInput.taskObject || rawInput.customerName,
    customerName: rawInput.taskObject || rawInput.customerName,
    audience: rawInput.audience || rawInput.customerType,
    customerType: rawInput.audience || rawInput.customerType,
    industryType: rawInput.industryType,
    taskPhase: rawInput.taskPhase || rawInput.salesStage,
    stage: rawInput.taskPhase || rawInput.salesStage,
    taskSubject: rawInput.taskSubject || rawInput.productDirection,
    subject: rawInput.taskSubject || rawInput.productDirection,
    docType: rawInput.docType,
    focusPoints: rawInput.focusPoints || rawInput.concernPoints,
    concernPoints: rawInput.focusPoints || rawInput.concernPoints,
    toneStyle: rawInput.toneStyle,
    goal: rawInput.goal || rawInput.communicationGoal,
    goalScene: rawInput.goalScene || rawInput.communicationGoal,
    communicationGoal: rawInput.goalScene || rawInput.communicationGoal,
    onlyExternalAvailable: rawInput.onlyExternalAvailable,
    enableExternalSupplement: rawInput.enableExternalSupplement,
  };

  Object.entries(seedEntries).forEach(([key, value]) => {
    if (mergedVariables[key] !== undefined && mergedVariables[key] !== null && mergedVariables[key] !== '') {
      return;
    }

    if (typeof value === 'boolean') {
      mergedVariables[key] = value;
      return;
    }

    const normalizedValue = normalizeString(value);
    if (normalizedValue) {
      mergedVariables[key] = normalizedValue;
    }
  });

  return mergedVariables;
};

const readVariableString = (variables = {}, keys = []) => {
  for (const key of keys) {
    const value = variables[key];
    const normalizedValue = normalizeString(value);
    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return '';
};

const readVariableBoolean = (variables = {}, keys = [], fallback = false) => {
  for (const key of keys) {
    const value = variables[key];
    if (typeof value === 'boolean') {
      return value;
    }

    const normalizedValue = normalizeString(value).toLowerCase();
    if (normalizedValue === 'true') return true;
    if (normalizedValue === 'false') return false;
  }

  return fallback;
};

export const buildGenericTaskModel = (rawInput = {}, capability = 'judge') => {
  const variables = seedVariables(rawInput);
  const attachments = normalizeAttachments(rawInput.attachments);
  const taskInput = firstNonEmptyString(rawInput.taskInput, rawInput.customerText, rawInput.keyword);
  const context = firstNonEmptyString(
    rawInput.context,
    rawInput.contextNote,
    rawInput.referenceSummary,
    rawInput.remark,
  );
  const goal = firstNonEmptyString(
    rawInput.goal,
    rawInput.communicationGoal,
    rawInput.currentGoal,
    buildDefaultGoal(capability),
  );
  const deliverable = firstNonEmptyString(
    rawInput.deliverable,
    rawInput.expectedDeliverable,
    buildDefaultDeliverable(capability),
  );

  return {
    taskInput,
    context,
    goal,
    deliverable,
    variables,
    attachments,
  };
};

export const normalizeCapabilityRequest = (rawInput = {}, capability = 'judge') => {
  const genericTask = buildGenericTaskModel(rawInput, capability);
  const variables = toPlainObject(genericTask.variables);

  const taskObject = firstNonEmptyString(
    rawInput.taskObject,
    rawInput.customerName,
    readVariableString(variables, ['taskObject', 'customerName']),
  );
  const audience = firstNonEmptyString(
    rawInput.audience,
    rawInput.customerType,
    readVariableString(variables, ['audience', 'customerType']),
  );
  const industryType = firstNonEmptyString(
    rawInput.industryType,
    readVariableString(variables, ['industryType', 'domain']),
    'other',
  );
  const taskPhase = firstNonEmptyString(
    rawInput.taskPhase,
    rawInput.salesStage,
    readVariableString(variables, ['taskPhase', 'stage', 'phase']),
    'other',
  );
  const taskSubject = firstNonEmptyString(
    rawInput.taskSubject,
    rawInput.productDirection,
    readVariableString(variables, ['taskSubject', 'subject', 'productDirection', 'topic']),
  );
  const taskInput = firstNonEmptyString(genericTask.taskInput, rawInput.customerText, rawInput.keyword);
  const context = firstNonEmptyString(genericTask.context, rawInput.remark, rawInput.referenceSummary);
  const keyword = firstNonEmptyString(rawInput.keyword, taskInput, taskSubject);
  const referenceSummary = firstNonEmptyString(rawInput.referenceSummary, genericTask.context);
  const focusPoints = firstNonEmptyString(
    rawInput.focusPoints,
    rawInput.concernPoints,
    readVariableString(variables, ['focusPoints', 'concernPoints']),
  );
  const docType = firstNonEmptyString(rawInput.docType, readVariableString(variables, ['docType']));
  const toneStyle = firstNonEmptyString(rawInput.toneStyle, readVariableString(variables, ['toneStyle']), 'formal');
  const goal = firstNonEmptyString(
    genericTask.goal,
    rawInput.communicationGoal,
    readVariableString(variables, ['goal', 'communicationGoal']),
    buildDefaultGoal(capability),
  );
  const goalScene = firstNonEmptyString(
    rawInput.goalScene,
    rawInput.communicationGoal,
    readVariableString(variables, ['goalScene', 'communicationGoal']),
    inferComposeScene(goal, genericTask.deliverable, taskInput),
  );
  const onlyExternalAvailable = normalizeBoolean(
    rawInput.onlyExternalAvailable,
    readVariableBoolean(variables, ['onlyExternalAvailable'], false),
  );
  const enableExternalSupplement = normalizeBoolean(
    rawInput.enableExternalSupplement,
    readVariableBoolean(variables, ['enableExternalSupplement'], false),
  );
  const appId = firstNonEmptyString(
    rawInput.appId,
    rawInput.app_id,
    readVariableString(variables, ['appId', 'app_id']),
  );

  const payload = {
    ...rawInput,
    ...genericTask,
    variables,
    attachments: genericTask.attachments,
    taskObject,
    audience,
    industryType,
    taskPhase,
    taskSubject,
    taskInput,
    context,
    keyword,
    referenceSummary,
    focusPoints,
    docType: docType || undefined,
    toneStyle,
    goal,
    goalScene,
    onlyExternalAvailable,
    enableExternalSupplement,
    appId,
    app_id: appId,
    customerName: taskObject,
    customerType: audience,
    salesStage: taskPhase,
    productDirection: taskSubject,
    remark: context,
    customerText: taskInput,
    concernPoints: focusPoints,
    communicationGoal: goalScene,
  };

  return {
    capability,
    taskModel: genericTask,
    payload,
  };
};
