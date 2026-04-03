export const policyConfig = {
  securityLevel: 'high',
  defaultMode: 'local-first',
  allowInternetFallback: false,
  allowApiModel: false,
  allowExport: false,
  logLevel: 'dev',

  modules: {
    analyzeCustomer: {
      localDataRequired: true,
      internetSupplementAllowed: false,
      localModelPreferred: true,
      apiModelAllowed: false,
      sensitiveDataAllowedToLeaveLocal: false,
      notes: '客户分析默认只允许本地知识线和本地模型处理。',
    },

    searchDocuments: {
      localDataRequired: true,
      internetSupplementAllowed: true,
      localModelPreferred: false,
      apiModelAllowed: false,
      sensitiveDataAllowedToLeaveLocal: false,
      notes: '资料检索以本地知识线为主，互联网补充线后续可选接入。',
    },

    generateScript: {
      localDataRequired: true,
      internetSupplementAllowed: false,
      localModelPreferred: true,
      apiModelAllowed: false,
      sensitiveDataAllowedToLeaveLocal: false,
      notes: '话术生成默认只允许本地模型处理，避免客户原话出网。',
    },

    conversationHistory: {
      localDataRequired: true,
      internetSupplementAllowed: false,
      localModelPreferred: false,
      apiModelAllowed: false,
      sensitiveDataAllowedToLeaveLocal: false,
      notes: '历史对话必须本地保存，不允许上传云端。',
    },

    testLogging: {
      localDataRequired: true,
      internetSupplementAllowed: false,
      localModelPreferred: false,
      apiModelAllowed: false,
      sensitiveDataAllowedToLeaveLocal: false,
      notes: '测试日志仅用于本地调试与验证。',
    },
  },

  dataLines: {
    localBusinessLine: {
      enabled: true,
      canLeaveLocal: false,
      description: '本地业务知识线，包含产品、FAQ、模板、规则、历史对话和测试记录。',
    },

    internetSupplementLine: {
      enabled: false,
      canLeaveLocal: true,
      description: '互联网补充知识线，仅用于公开信息补充，不可承载本地敏感数据。',
    },
  },

  modelRouting: {
    localModelEnabled: true,
    apiModelEnabled: false,
    upgradeAffectsHistory: false,
    notes: '模型可替换、可升级，但历史记录必须独立于模型保存。',
  },

  exportPolicy: {
    allowRawConversationExport: false,
    allowSensitiveDataExport: false,
    allowDesensitizedExport: true,
    notes: '导出能力默认受限，后续只建议开放脱敏导出。',
  },
};

export const getModulePolicy = (moduleName) => {
  return policyConfig.modules[moduleName] || null;
};

export const isInternetSupplementAllowed = (moduleName) => {
  const modulePolicy = getModulePolicy(moduleName);
  return Boolean(modulePolicy?.internetSupplementAllowed);
};

export const isApiModelAllowed = (moduleName) => {
  const modulePolicy = getModulePolicy(moduleName);
  return Boolean(modulePolicy?.apiModelAllowed);
};

export const isSensitiveDataAllowedToLeaveLocal = (moduleName) => {
  const modulePolicy = getModulePolicy(moduleName);
  return Boolean(modulePolicy?.sensitiveDataAllowedToLeaveLocal);
};