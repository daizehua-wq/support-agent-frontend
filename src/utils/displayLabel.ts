const TECHNICAL_LABEL_MAP: Record<string, string> = {
  'api-enhanced': '增强链路',
  main_workflow: '主任务链路',
  main_workflow_agent: '主业务智能体',
  fallback: '降级处理',
  embedded_model: '本地快速判断',
  rule: '规则命中',
  cloud_model: '云端模型处理',
  fast_channel: '快速通道',
  route_decision: '路由判断',
  field_extraction: '字段提取',
  structured_transform: '结构化转换',

  'rules-only': '规则优先',
  'local-only': '本地检索',
  'external-enabled': '外部检索',
  'local-model': '本地生成',
  local_model: '本地模型',
  'api-model': '云端生成',
  'template-only': '模板生成',
  'rules-fallback': '规则降级',
  'template-fallback': '模板降级',
  'local-documents-only': '本地资料检索',
  'search-fallback': '检索降级',

  api: '云端模型',
  local: '本地模型',
  cloud: '云端 API',
  ollama: '本地模型',
  'node-llama-cpp': '本地微模型适配器',

  mounted: '模块挂载来源',
  default: '默认来源',
  override: '显式覆盖',
  'default-model': '默认模型',
  'module-binding': '模块绑定',
  'settings.default-model': '系统默认模型',
  'module-strategy': '模块策略',
  'runtime.executionContext.assistant': '运行上下文',

  healthy: '健康',
  unhealthy: '异常',
  critical: '严重',
  warning: '预警',
  info: '提示',
  open: '待处理',
  general: '通用',
  unknown: '未知',
  'raw-response': '原始响应',
  analyze: '判断',
  search: '检索',
  script: '写作',
  output: '输出',
  'analyze-customer': '任务判断',
  'search-documents': '资料检索',
  'generate-script': '参考写作',
  draft: '草稿',
  published: '已发布',
  superseded: '已替换',
  archived: '已归档',
  save: '保存',
  'settings.save': '保存设置',
  'settings.publish': '发布设置',
  'settings.rollback': '回滚设置',
  'unknown-actor': '未知操作者',
  'unknown-role': '未知角色',
  activate: '激活',
  create: '创建',
  delete: '删除',
  update: '更新',
  publish: '发布',
  'assistant-center': '助手治理中心',
};

export const formatTechnicalLabel = (value: unknown, fallback = '未返回'): string => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    return String(value);
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return fallback;
  }

  return TECHNICAL_LABEL_MAP[normalizedValue] || normalizedValue;
};

export const formatSlashSeparatedLabels = (value: unknown, fallback = '未返回'): string => {
  if (typeof value !== 'string') {
    return formatTechnicalLabel(value, fallback);
  }

  const parts = value
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return fallback;
  }

  return parts.map((item) => formatTechnicalLabel(item, fallback)).join(' / ');
};

export const formatTechnicalValue = (value: unknown, fallback = '未返回'): string => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'string') {
    return formatTechnicalLabel(value, fallback);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value, (_key, item) => {
      if (typeof item === 'string') {
        return formatTechnicalLabel(item, item);
      }
      return item;
    }, 2);
  } catch {
    return '[复杂对象，暂不展开]';
  }
};

