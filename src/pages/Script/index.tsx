import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Alert, Button, Card, Col, Form, Input, Row, Select, Space, Spin, Tag, message } from 'antd';

import AgentClientStatusBadge from '../../components/common/AgentClientStatusBadge';
import ClientAdapterPreviewCard from '../../components/common/ClientAdapterPreviewCard';
import EmptyBlock from '../../components/common/EmptyBlock';
import PageHeader from '../../components/common/PageHeader';
import ResultCard from '../../components/common/ResultCard';
import ResolvedSummaryCard from '../../components/card/ResolvedSummaryCard';
import type { ExecutionContext } from '../../api/settings';

import {
  composeDocument,
  getSessionDetail,
  type AgentAdapterResponse,
  type AgentClientType,
  type GenerateScriptResponse,
  type RuntimeSnapshot,
  type SessionDetailRecord,
  type SessionEvidenceRecord,
} from '../../api/agent';
import {
  getAgentClientTypeLabel,
  isAdapterPreviewMode,
  isAgentAdapterResponse,
  useRememberedAgentClientType,
} from '../../utils/agentClientDebug';
import {
  buildContinueNavigationState,
  buildTaskSeedFromPayload,
  findEvidenceById,
  findLatestStepByType,
  findPreferredEvidence,
  findPreferredStep,
  findStepById,
  hasPersistedSession,
  getAnalyzeOutputRecord,
  getSessionExecutionContext,
  getStepAssistantId,
  getStepExecutionContext,
  getStepInputPayload,
  mergeContinueContexts,
  mergeTaskSeeds,
  parseContinueContext,
  readExecutionContextAssistantId,
  readExecutionContextPromptId,
  readExecutionContextPromptVersion,
  readExecutionContextStrategyId,
  readString,
  readStringArray,
} from '../../utils/sessionResume';
import {
  buildScriptTemplateExample,
  loadActiveAssistantTemplateDefaults,
  shouldApplyAssistantDefault,
  type ActiveAssistantTemplateDefaults,
} from '../../utils/assistantTemplateDefaults';
import { formatTechnicalLabel, formatTechnicalValue } from '../../utils/displayLabel';

const { TextArea } = Input;

const stageOptions = [
  { label: '启动评估', value: 'initial_contact' },
  { label: '需求沟通', value: 'requirement_discussion' },
  { label: '执行推进', value: 'sample_followup' },
  { label: '定稿确认', value: 'quotation' },
  { label: '其他', value: 'other' },
];

const goalOptions = [
  { label: '形成初版说明', value: '形成初版说明', scene: 'first_reply' },
  { label: '推进后续事项', value: '推进后续事项', scene: 'sample_followup' },
  { label: '输出专业说明', value: '输出专业说明', scene: 'technical_reply' },
  { label: '重新发起事项', value: '重新发起事项', scene: 'reactivate' },
];

const toneOptions = [
  { label: '正式', value: 'formal' },
  { label: '简洁', value: 'concise' },
  { label: '口语', value: 'spoken' },
];

const staleScriptDefaults = {
  audience: ['老板汇报 / 跨部门沟通', '通用任务'],
  taskPhase: ['other'],
  taskSubject: ['合同风险说明'],
  focusPoints: ['责任边界、付款节点、汇报口径'],
  taskInput: ['请基于合同审阅结果，整理一版给老板汇报的风险说明初稿。'],
  context: ['重点说明高风险条款、建议修改方向和本周是否建议签署。'],
  toneStyle: ['formal'],
};

type ScriptResultData = NonNullable<GenerateScriptResponse['data']>;

type ScriptExecutionContext = ExecutionContext &
  Record<string, unknown> & {
  promptId?: string;
  promptVersion?: string;
  strategyId?: string;
  databaseRelationSource?: unknown;
};

type ScriptNavigationState = ReturnType<typeof parseContinueContext>;

type MaterialContext = {
  referencePackId?: string;
  evidenceId?: string;
  sourceDocId?: string;
  sourceDocName?: string;
  sourceDocType?: string;
  sourceApplicableScene?: string;
  sourceExternalAvailable?: boolean;
  referenceSummary?: string;
  sourceType?: string;
  sourceRef?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

function formatScriptDisplayText(value: unknown) {
  return formatTechnicalValue(value);
}

function readStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function formatSourceSummary(value: unknown) {
  if (value === undefined || value === null || value === '') return '未返回';

  if (typeof value === 'string') {
    const sourceMap: Record<string, string> = {
      mounted: '模块挂载来源',
      default: '默认来源',
      override: '显式覆盖',
      fallback: '回退生效',
      'module-binding': '模块绑定',
      'settings.default-model': '系统默认模型',
    };

    return sourceMap[value] || formatTechnicalLabel(value);
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const labelMap: Record<string, string> = {
      assistant: 'Assistant',
      assistantVersion: 'AssistantVersion',
      prompt: 'Prompt',
      promptVersion: 'PromptVersion',
      strategy: '策略',
    };

    const valueMap: Record<string, string> = {
      'runtime.executionContext.assistant': '运行上下文',
      'module.script.prompt': 'Script 模块 Prompt',
      'module.script.promptVersion': 'Script 模块 PromptVersion',
      'module.prompt': '模块 Prompt',
      'module.promptVersion': '模块 PromptVersion',
      'module.strategy': '模块策略',
      'module-strategy': '模块策略',
      'settings.strategy.scriptStrategy': 'Script 模块策略',
      'settings.default-model': '系统默认模型',
      'module-binding': '模块绑定',
      none: '未返回',
    };

    const entries = Object.entries(record)
      .filter(([key, entryValue]) => {
        if (entryValue === undefined || entryValue === null || entryValue === '') return false;
        if (key === 'assistantVersion' && String(entryValue) === 'none') return false;
        return true;
      })
      .map(([key, entryValue]) => {
        const label = labelMap[key] || key;
        const displayValue = valueMap[String(entryValue)] || formatTechnicalLabel(entryValue);
        return `${label}：${displayValue}`;
      });

    return entries.length ? entries.join('；') : '未返回';
  }

  return formatScriptDisplayText(value);
}

function formatFallbackSummary(value: unknown) {
  if (value === undefined || value === null || value === '') return '未触发';

  if (typeof value === 'string') {
    const fallbackMap: Record<string, string> = {
      'assistant-version-missing': 'AssistantVersion 未返回，已触发回退',
      'module-prompt-applied': 'Prompt 命中模块 Prompt',
      'module-prompt-version-applied': 'PromptVersion 命中模块 PromptVersion',
      'module-strategy-applied': '策略命中模块策略',
    };

    return fallbackMap[value] || formatTechnicalLabel(value);
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const labelMap: Record<string, string> = {
      assistant: 'Assistant',
      assistantVersion: 'AssistantVersion',
      prompt: 'Prompt',
      promptVersion: 'PromptVersion',
      strategy: '策略',
    };

    const fallbackMap: Record<string, string> = {
      'assistant-version-missing': '未返回，已触发回退',
      'module-prompt-applied': '命中模块 Prompt',
      'module-prompt-version-applied': '命中模块 PromptVersion',
      'module-strategy-applied': '命中模块策略',
    };

    const entries = Object.entries(record)
      .filter(([, entryValue]) => entryValue !== undefined && entryValue !== null && entryValue !== '')
      .map(([key, entryValue]) => {
        const label = labelMap[key] || key;
        const displayValue = fallbackMap[String(entryValue)] || formatTechnicalLabel(entryValue);
        return `${label}：${displayValue}`;
      });

    return entries.length ? entries.join('；') : '未触发';
  }

  return formatScriptDisplayText(value);
}

function formatResumeStepLabel(stepType?: string) {
  if (stepType === 'script') return '最近的写作步骤';
  if (stepType === 'search') return '最近的检索步骤';
  if (stepType === 'analyze') return '最近的判断步骤';
  return 'session 级上下文';
}

function formatDatabaseRelationSummary(value: unknown) {
  if (value === undefined || value === null || value === '') return '当前未返回数据库关系摘要';

  if (typeof value === 'string') return value;

  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;

    const defaultDatabase =
      readStringValue(record.defaultAssociatedDatabase) ||
      readStringValue(record.defaultDatabase) ||
      readStringValue(record.databaseId) ||
      readStringValue(record.databaseName);

    const visibleDatabases = Array.isArray(record.visibleDatabases)
      ? record.visibleDatabases
          .map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              const itemRecord = item as Record<string, unknown>;
              return (
                readStringValue(itemRecord.databaseName) ||
                readStringValue(itemRecord.databaseId) ||
                undefined
              );
            }
            return undefined;
          })
          .filter((item): item is string => Boolean(item))
      : [];

    const relationSource =
      readStringValue(record.databaseRelationSource) ||
      readStringValue(record.relationSource) ||
      readStringValue(record.bindingSource) ||
      readStringValue(record.source);

    const parts = [
      defaultDatabase ? `默认关联：${defaultDatabase}` : undefined,
      visibleDatabases.length ? `可见数据库：${visibleDatabases.join('、')}` : undefined,
      relationSource ? `关系来源：${relationSource}` : undefined,
    ].filter((item): item is string => Boolean(item));

    return parts.length ? parts.join('；') : '当前未返回数据库关系摘要';
  }

  return formatScriptDisplayText(value);
}

const buildMaterialContextFromEvidence = (
  evidence?: SessionEvidenceRecord | null,
): MaterialContext | null => {
  if (!evidence) {
    return null;
  }

  return {
    evidenceId: evidence.evidenceId,
    referencePackId: '',
    sourceDocId: evidence.sourceRef,
    sourceDocName: evidence.title,
    sourceDocType: evidence.docType,
    sourceApplicableScene: evidence.applicableScene,
    sourceExternalAvailable: evidence.outboundStatus === 'allowed',
    referenceSummary: evidence.summary ? `${evidence.title || ''}：${evidence.summary}` : evidence.title,
    sourceType: evidence.sourceType,
    sourceRef: evidence.sourceRef,
  };
};

const buildMaterialContextFromNavigationState = (
  state?: unknown,
): MaterialContext | null => {
  const continueContext = parseContinueContext(state);
  const carryPayload =
    isRecord(state) && isRecord(state.carryPayload) ? state.carryPayload : null;
  const referenceSummary =
    readStringValue(carryPayload?.referenceSummary) || readStringValue(carryPayload?.context);
  const materialContext: MaterialContext = {
    evidenceId:
      continueContext?.evidenceId ||
      readStringValue(carryPayload?.evidenceId),
    referencePackId: readStringValue(carryPayload?.referencePackId),
    sourceDocId:
      readStringValue(carryPayload?.sourceDocId) ||
      readStringValue(carryPayload?.sourceRef),
    sourceDocName: readStringValue(carryPayload?.sourceDocName),
    sourceDocType: readStringValue(carryPayload?.sourceDocType),
    sourceApplicableScene: readStringValue(carryPayload?.sourceApplicableScene),
    sourceExternalAvailable:
      typeof carryPayload?.sourceExternalAvailable === 'boolean'
        ? carryPayload.sourceExternalAvailable
        : undefined,
    referenceSummary,
    sourceType: readStringValue(carryPayload?.sourceType),
    sourceRef: readStringValue(carryPayload?.sourceRef),
  };

  if (
    !materialContext.evidenceId &&
    !materialContext.referencePackId &&
    !materialContext.sourceDocName &&
    !materialContext.sourceDocType &&
    !materialContext.referenceSummary
  ) {
    return null;
  }

  return materialContext;
};

const resolveGoalScene = (value?: string) => {
  if (value === 'first_reply' || value === '形成初版说明') return 'first_reply';
  if (value === 'sample_followup' || value === '推进后续事项') return 'sample_followup';
  if (value === 'technical_reply' || value === '输出专业说明') return 'technical_reply';
  if (value === 'reactivate' || value === '重新发起事项') return 'reactivate';
  return '';
};

const normalizeGoalValue = (value?: string) => {
  const scene = resolveGoalScene(value);
  if (scene === 'first_reply') return '形成初版说明';
  if (scene === 'sample_followup') return '推进后续事项';
  if (scene === 'technical_reply') return '输出专业说明';
  if (scene === 'reactivate') return '重新发起事项';
  return value || undefined;
};

const getGoalLabel = (value?: string) => {
  return normalizeGoalValue(value) || '未返回';
};

const getOutputTypeLabel = ({
  goal,
  fromModule,
}: {
  goal?: string;
  fromModule?: string;
}) => {
  const goalScene = resolveGoalScene(goal);
  if (goalScene === 'technical_reply') return '专业说明输出';
  if (goalScene === 'sample_followup') return '后续推进输出';
  if (goalScene === 'reactivate') return '重启事项输出';
  if (fromModule === 'search') return '资料承接输出';
  if (fromModule === 'session-detail') return '会话恢复输出';
  return '参考写作输出';
};

const buildOutputTitle = ({
  taskSubject,
  goal,
}: {
  taskSubject?: string;
  goal?: string;
}) => {
  const goalLabel = getGoalLabel(goal);
  if (taskSubject) {
    return `${taskSubject}｜${goalLabel}`;
  }
  return `参考写作结果｜${goalLabel}`;
};

const buildScriptGuide = ({
  goal,
  taskPhase,
  materialContext,
}: {
  goal?: string;
  taskPhase?: string;
  materialContext?: MaterialContext | null;
}) => {
  const goalScene = resolveGoalScene(goal);
  const baseGuide = {
    recommendedVersion: '正式版',
    usageAdvice: '建议先使用正式版对外发送，确保表达清晰、边界稳妥。',
    nextAction: '发送文稿后，继续确认对象反馈、关注点和下一步动作。',
    materialNote:
      materialContext?.sourceExternalAvailable === false
        ? '当前带入资料为内部参考，建议只提炼可说结论，不直接对外转发原资料。'
        : materialContext?.sourceExternalAvailable === true
          ? '当前带入资料可外发，可结合正式版文稿一起发送。'
          : '当前未返回资料外发状态，建议先按稳妥口径使用。',
  };

  if (goalScene === 'technical_reply') {
    return {
      ...baseGuide,
      recommendedVersion: '正式版',
      usageAdvice: '当前更适合先发正式版，结合资料结论做专业说明，再继续补充必要条件。',
      nextAction:
        taskPhase === 'requirement_discussion'
          ? '先发资料说明，再补充关键指标、约束条件和执行计划。'
          : '先回复专业说明，再确认是否需要进入进一步协同。',
    };
  }

  if (goalScene === 'sample_followup') {
    return {
      ...baseGuide,
      recommendedVersion: '简洁版',
      usageAdvice: '当前更适合先发简洁版，快速推动样品、测试安排和时间节点确认。',
      nextAction: '发出文稿后，继续确认时间节点、执行条件和协同安排。',
    };
  }

  if (goalScene === 'reactivate') {
    return {
      ...baseGuide,
      recommendedVersion: '口语版',
      usageAdvice: '当前更适合先用口语版重新建立沟通，再逐步带回正式资料和下一步动作。',
      nextAction: '先恢复沟通，再判断是否需要补资料、补背景或重新进入协同推进。',
    };
  }

  return baseGuide;
};

type AssistantPerspectiveKey =
  | 'operations'
  | 'legal'
  | 'finance'
  | 'hr'
  | 'product'
  | 'sales-support'
  | 'generic';

const TECHNICAL_RISK_KEYWORDS = [
  '工艺',
  '材料体系',
  '清洗',
  '蚀刻',
  '刻蚀',
  '样品',
  '测试指标',
  '验证条件',
  '性能',
  '产品',
  '参数',
  '线宽',
  '残留',
];

const assistantPerspectiveConfigs: Record<
  AssistantPerspectiveKey,
  {
    key: AssistantPerspectiveKey;
    assistantIds: string[];
    industryTypes: string[];
    templateRoles: string[];
    keywords: string[];
    riskRows: Array<{ label: string; value: string }>;
    outboundLabel: string;
    outboundBoundary: string;
    cautionNotes: string[];
    suppressTechnicalNotes?: boolean;
  }
> = {
  operations: {
    key: 'operations',
    assistantIds: ['operations-workbench-template'],
    industryTypes: ['operations'],
    templateRoles: ['operations'],
    keywords: ['运营', '活动', 'sop', 'SOP', '复盘', '执行', '协同', '排期', '转化', '指标', '值班', '异常', '审批', '资源'],
    riskRows: [
      {
        label: '当前协同风险',
        value: '目标、负责人、截止时间和验收口径未完全对齐时，容易出现推进断点、重复沟通或责任边界不清。',
      },
      {
        label: '暂不应承诺',
        value: '不直接承诺上线时间、资源投入、转化结果或复盘结论，除非负责人、数据口径、审批边界和依赖条件已确认。',
      },
      {
        label: '当前仍需确认信息',
        value: '需确认目标指标、关键里程碑、责任人、协同方、资源缺口、审批节点和异常升级机制。',
      },
    ],
    outboundLabel: '对外同步边界',
    outboundBoundary: '可以同步已确认的安排和待办；未确认的数据、责任归属、资源承诺和复盘定性只作为内部待确认项。',
    cautionNotes: [
      '未确认目标、负责人、截止时间和验收口径前，不直接承诺完成时间或结果。',
      '复盘结论需基于实际数据和责任边界，避免先定性后补证据。',
    ],
    suppressTechnicalNotes: true,
  },
  legal: {
    key: 'legal',
    assistantIds: ['legal-workbench-template'],
    industryTypes: ['legal'],
    templateRoles: ['legal'],
    keywords: ['法务', '合同', '合规', '条款', '违约', '签署', '争议', '赔偿', '保密', '律师函'],
    riskRows: [
      {
        label: '当前法务风险',
        value: '合同版本、主体资质、责任边界、付款条件或违约责任未核定时，容易形成签署、履约或争议处理风险。',
      },
      {
        label: '暂不应承诺',
        value: '不直接给出可签署、必胜、绝对合规或无需修改的结论，除非文本版本、证据材料和授权边界已经完成复核。',
      },
      {
        label: '当前仍需确认信息',
        value: '需确认合同版本、交易主体、金额与期限、关键义务、违约责任、管辖条款、审批记录和相关证据。',
      },
    ],
    outboundLabel: '对外同步边界',
    outboundBoundary: '可同步已核定事实和待修改条款；法律结论、责任判断和谈判底线需经法务确认后再对外表达。',
    cautionNotes: [
      '未完成文本和证据复核前，不输出最终法律结论或签署建议。',
      '对外表达应区分事实、风险判断和谈判立场，避免把内部评估说成确定承诺。',
    ],
    suppressTechnicalNotes: true,
  },
  finance: {
    key: 'finance',
    assistantIds: ['finance-workbench-template'],
    industryTypes: ['finance'],
    templateRoles: ['finance'],
    keywords: ['财务', '预算', '回款', '付款', '费用', '现金流', '开票', '成本', '结算', '审批'],
    riskRows: [
      {
        label: '当前财务风险',
        value: '金额口径、预算归属、发票税务、现金流影响或审批链路未确认时，容易造成误判、超支或付款合规风险。',
      },
      {
        label: '暂不应承诺',
        value: '不直接承诺可付款、可报销、可确认收入或预算充足，除非金额、凭证、合同、审批和税务口径已核对。',
      },
      {
        label: '当前仍需确认信息',
        value: '需确认金额口径、预算科目、合同/订单、发票与税率、付款条件、回款节点、审批人和异常差异原因。',
      },
    ],
    outboundLabel: '对外同步边界',
    outboundBoundary: '可同步已核对的金额和流程状态；未经复核的财务预测、付款承诺和异常归因只作为内部判断。',
    cautionNotes: [
      '未核对凭证、合同和审批链路前，不直接承诺付款或费用归属。',
      '涉及经营预测时需标明口径、假设和数据来源。',
    ],
    suppressTechnicalNotes: true,
  },
  hr: {
    key: 'hr',
    assistantIds: ['hr-workbench-template'],
    industryTypes: ['hr'],
    templateRoles: ['hr'],
    keywords: ['人事', 'HR', '招聘', '面试', '绩效', '员工关系', '调薪', '录用', '离职', '制度'],
    riskRows: [
      {
        label: '当前人事风险',
        value: '制度依据、评价标准、沟通对象或证据记录未明确时，容易引发公平性、员工关系或流程合规风险。',
      },
      {
        label: '暂不应承诺',
        value: '不直接承诺录用、淘汰、调薪、处罚或绩效结论，除非审批链路、评价依据和沟通口径已确认。',
      },
      {
        label: '当前仍需确认信息',
        value: '需确认岗位要求、评价记录、制度条款、审批人、沟通对象、员工反馈和后续留痕方式。',
      },
    ],
    outboundLabel: '沟通边界',
    outboundBoundary: '可同步流程安排和已确认事实；个人评价、薪酬结论和处理意见需按授权口径沟通。',
    cautionNotes: [
      '涉及个人评价和员工关系时，应保留证据依据和沟通记录。',
      '未完成审批前，不提前释放录用、调薪、处罚或绩效结论。',
    ],
    suppressTechnicalNotes: true,
  },
  product: {
    key: 'product',
    assistantIds: ['product-workbench-template'],
    industryTypes: ['product'],
    templateRoles: ['product'],
    keywords: ['产品', '需求', 'PRD', '路线图', '发布', '上线', '优先级', '用户价值', '范围', '研发'],
    riskRows: [
      {
        label: '当前产品风险',
        value: '用户价值、范围边界、优先级、依赖资源或验收指标未对齐时，容易产生范围蔓延、延期或上线质量风险。',
      },
      {
        label: '暂不应承诺',
        value: '不直接承诺上线时间、完整范围、研发排期或效果指标，除非需求边界、技术依赖和验收标准已确认。',
      },
      {
        label: '当前仍需确认信息',
        value: '需确认目标用户、核心场景、价值假设、优先级、非目标范围、技术依赖、验收指标和发布风险。',
      },
    ],
    outboundLabel: '对齐边界',
    outboundBoundary: '可同步已确认的需求范围和下一步动作；排期、资源和效果指标需按评审结论表达。',
    cautionNotes: [
      '未完成需求评审前，不承诺完整范围和上线时间。',
      '需要明确非目标范围、依赖关系和验收口径，避免后续范围蔓延。',
    ],
    suppressTechnicalNotes: true,
  },
  'sales-support': {
    key: 'sales-support',
    assistantIds: ['semiconductor-sales-support', 'pcb-sales-support'],
    industryTypes: ['semiconductor', 'pcb'],
    templateRoles: ['sales-support'],
    keywords: ['销售', '客户', 'FAE', '工艺', '样品', '测试', '验证', '清洗', '蚀刻', '方案'],
    riskRows: [
      {
        label: '当前客户沟通风险',
        value: '客户场景、工艺条件、评价标准或验证节奏未明确时，容易把资料说明误读成效果承诺。',
      },
      {
        label: '暂不应承诺',
        value: '不直接承诺最终效果、性能改善、成本节省或导入结论，除非测试条件、评价指标和验证边界已确认。',
      },
      {
        label: '当前仍需确认信息',
        value: '需确认客户应用场景、现用方案、关键指标、样测条件、时间节点和决策链路。',
      },
    ],
    outboundLabel: '外发限制',
    outboundBoundary: '可外发已授权资料和稳妥说明；内部判断、未验证结论和客户敏感信息不得直接外发。',
    cautionNotes: [
      '在未明确应用条件和评价标准前，不建议承诺最终效果。',
      '涉及成本、性能或导入结论时，应先确认验证边界。',
    ],
  },
  generic: {
    key: 'generic',
    assistantIds: [],
    industryTypes: ['other', 'general'],
    templateRoles: ['generic'],
    keywords: [],
    riskRows: [
      {
        label: '当前沟通风险',
        value: '当前信息、对象、边界或下一步责任未完全明确，建议先按保守口径推进。',
      },
      {
        label: '当前不可承诺内容',
        value: '不直接承诺未经确认的结果、时间、资源或责任归属。',
      },
      {
        label: '当前仍需确认信息',
        value: '需确认目标、对象、依据、限制条件、负责人和下一步动作。',
      },
    ],
    outboundLabel: '外发限制',
    outboundBoundary: '只同步已确认事实和稳妥建议；未确认判断作为内部参考。',
    cautionNotes: ['当前阶段不建议直接承诺未经验证或未经确认的结果。'],
  },
};

const includesAnyKeyword = (text = '', keywords: string[]) => {
  return keywords.some((keyword) => text.includes(keyword));
};

const normalizePerspectiveToken = (value?: string) => String(value || '').trim().toLowerCase();

const resolveAssistantPerspective = ({
  assistantId = '',
  industryType = '',
  templateRole = '',
  executionContext = null,
  taskSubject = '',
  taskInput = '',
  audience = '',
  taskPhase = '',
}: {
  assistantId?: string;
  industryType?: string;
  templateRole?: string;
  executionContext?: ScriptExecutionContext | null;
  taskSubject?: string;
  taskInput?: string;
  audience?: string;
  taskPhase?: string;
}) => {
  const configs = Object.values(assistantPerspectiveConfigs).filter((item) => item.key !== 'generic');
  const normalizedAssistantId = normalizePerspectiveToken(assistantId);
  const normalizedIndustryType = normalizePerspectiveToken(industryType);
  const normalizedTemplateRole = normalizePerspectiveToken(templateRole);
  const contextText = [
    assistantId,
    industryType,
    templateRole,
    executionContext?.assistantId,
    executionContext?.resolvedAssistant?.assistantId,
    executionContext?.source,
    taskSubject,
    taskInput,
    audience,
    taskPhase,
  ]
    .map((item) => (typeof item === 'string' ? item : JSON.stringify(item || '')))
    .join(' ');

  return (
    configs.find((config) =>
      config.assistantIds.some((item) => normalizePerspectiveToken(item) === normalizedAssistantId),
    ) ||
    configs.find((config) =>
      config.industryTypes.some((item) => normalizePerspectiveToken(item) === normalizedIndustryType),
    ) ||
    configs.find((config) =>
      config.templateRoles.some((item) => normalizePerspectiveToken(item) === normalizedTemplateRole),
    ) ||
    configs.find((config) => includesAnyKeyword(contextText, config.keywords)) ||
    assistantPerspectiveConfigs.generic
  );
};

const isTechnicalRiskText = (text = '') => includesAnyKeyword(text, TECHNICAL_RISK_KEYWORDS);

const buildPerspectiveRiskRows = ({
  perspective,
  outboundAllowedLabel,
  outboundReasonLabel,
}: {
  perspective: typeof assistantPerspectiveConfigs[AssistantPerspectiveKey];
  outboundAllowedLabel: string;
  outboundReasonLabel: string;
}) => [
  ...perspective.riskRows,
  {
    label: perspective.outboundLabel,
    value:
      outboundAllowedLabel === '不允许'
        ? outboundReasonLabel
        : perspective.outboundBoundary,
  },
];

function ScriptPage() {
  const [form] = Form.useForm();
  const [resultVisible, setResultVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeLoadIssue, setResumeLoadIssue] = useState('');
  const [clientType] = useRememberedAgentClientType();
  const [lastResponseClientType, setLastResponseClientType] = useState<AgentClientType>('web');
  const [adapterPreview, setAdapterPreview] = useState<AgentAdapterResponse | null>(null);
  const [scriptResult, setScriptResult] = useState<ScriptResultData | null>(null);
  const [scriptRuntime, setScriptRuntime] = useState<RuntimeSnapshot | null>(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [carriedSource, setCarriedSource] = useState<ScriptNavigationState | null>(null);
  const [resumeDetail, setResumeDetail] = useState<SessionDetailRecord | null>(null);
  const [resolvedEvidence, setResolvedEvidence] = useState<SessionEvidenceRecord | null>(null);
  const [assistantDefaults, setAssistantDefaults] =
    useState<ActiveAssistantTemplateDefaults | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const currentGoal = Form.useWatch('goal', form);
  const currentTaskPhase = Form.useWatch('taskPhase', form);
  const hasResumeSession = hasPersistedSession(carriedSource);
  const hasNavigationTaskSeed = useMemo(
    () => Object.keys(buildTaskSeedFromPayload(location.state)).length > 0,
    [location.state],
  );
  const hasNavigationContinueContext = useMemo(
    () => Boolean(parseContinueContext(location.state)),
    [location.state],
  );
  const sourceStep = useMemo(
    () =>
      findPreferredStep({
        detail: resumeDetail,
        stepId: carriedSource?.stepId,
        preferredTypes: ['script', 'search', 'analyze'],
      }),
    [carriedSource?.stepId, resumeDetail],
  );
  const sourceStepInputPayload = useMemo(
    () => getStepInputPayload(sourceStep),
    [sourceStep],
  );
  const analyzeSourceStep = useMemo(
    () =>
      sourceStep?.stepType === 'analyze'
        ? sourceStep
        : findLatestStepByType(resumeDetail, 'analyze'),
    [resumeDetail, sourceStep],
  );
  const analyzeSourceInputPayload = useMemo(
    () => getStepInputPayload(analyzeSourceStep),
    [analyzeSourceStep],
  );
  const analyzeSourceOutputRecord = useMemo(
    () => getAnalyzeOutputRecord(analyzeSourceStep),
    [analyzeSourceStep],
  );
  const analyzeSourceSummary = readString(analyzeSourceOutputRecord?.summary);
  const sourceTaskSeed = useMemo(
    () =>
      mergeTaskSeeds(
        buildTaskSeedFromPayload(sourceStepInputPayload),
        buildTaskSeedFromPayload(analyzeSourceInputPayload),
        buildTaskSeedFromPayload(resumeDetail?.session || null),
      ),
    [analyzeSourceInputPayload, resumeDetail?.session, sourceStepInputPayload],
  );

  const effectiveSessionId = scriptRuntime?.sessionId || resumeDetail?.session.id || '';
  const effectiveAssistantId =
    scriptRuntime?.assistantId ||
    carriedSource?.assistantId ||
    readExecutionContextAssistantId(scriptRuntime?.executionContext) ||
    getStepAssistantId(sourceStep) ||
    getStepAssistantId(analyzeSourceStep) ||
    resumeDetail?.session.assistantId ||
    '';
  const effectiveExecutionContext =
    (scriptRuntime?.executionContext ||
      scriptRuntime?.executionContextSummary ||
      carriedSource?.executionContext ||
      carriedSource?.executionContextSummary ||
      getStepExecutionContext(sourceStep) ||
      getStepExecutionContext(analyzeSourceStep) ||
      getSessionExecutionContext(resumeDetail) ||
      null) as
      | ScriptExecutionContext
      | null;
  const resumeFallbackNotice = useMemo(() => {
    if (!resumeDetail) {
      return '';
    }

    const notices: string[] = [];

    if (carriedSource?.stepId && !findStepById(resumeDetail, carriedSource.stepId)) {
      notices.push(
        sourceStep
          ? `stepId ${carriedSource.stepId} 未找到，已自动回退到${formatResumeStepLabel(sourceStep.stepType)}继续恢复。`
          : `stepId ${carriedSource.stepId} 未找到，已自动退回 session 级数据恢复。`,
      );
    }

    if (carriedSource?.evidenceId && !findEvidenceById(resumeDetail, carriedSource.evidenceId)) {
      notices.push(
        resolvedEvidence?.evidenceId
          ? `evidenceId ${carriedSource.evidenceId} 未找到，已自动回退到证据 ${resolvedEvidence.evidenceId}。`
          : `evidenceId ${carriedSource.evidenceId} 未找到，当前仅保留已带入页面的资料摘要。`,
      );
    }

    return notices.join('；');
  }, [carriedSource?.evidenceId, carriedSource?.stepId, resumeDetail, resolvedEvidence, sourceStep]);
  const navigationMaterialContext = useMemo(
    () => buildMaterialContextFromNavigationState(location.state),
    [location.state],
  );
  const materialContext = useMemo<MaterialContext | null>(() => {
    const evidenceContext = buildMaterialContextFromEvidence(resolvedEvidence);

    if (evidenceContext) {
      return evidenceContext;
    }

    if (scriptResult?.sourceDocName || scriptResult?.referenceSummary || scriptResult?.evidenceId) {
      return {
        evidenceId: scriptResult?.evidenceId,
        referencePackId: scriptResult?.referencePackId,
        sourceDocId: scriptResult?.sourceDocId,
        sourceDocName: scriptResult?.sourceDocName,
        sourceDocType: scriptResult?.sourceDocType,
        sourceApplicableScene: scriptResult?.sourceApplicableScene,
        sourceExternalAvailable: scriptResult?.sourceExternalAvailable,
        referenceSummary: scriptResult?.referenceSummary,
      };
    }

    return navigationMaterialContext;
  }, [navigationMaterialContext, resolvedEvidence, scriptResult]);
  const selectedEvidenceId =
    resolvedEvidence?.evidenceId ||
    (effectiveSessionId ? materialContext?.evidenceId || carriedSource?.evidenceId : '') ||
    '';
  const hasCarriedMaterialContext = Boolean(
    materialContext?.referencePackId ||
      materialContext?.sourceDocName ||
      materialContext?.sourceDocType ||
      materialContext?.referenceSummary ||
      materialContext?.sourceApplicableScene ||
      materialContext?.evidenceId,
  );
  const adapterPreviewMode = isAdapterPreviewMode(clientType);

  useEffect(() => {
    let cancelled = false;

    const applyActiveAssistantDefaults = async () => {
      const defaults = await loadActiveAssistantTemplateDefaults();

      if (cancelled) {
        return;
      }

      setAssistantDefaults(defaults);

      if (
        hasResumeSession ||
        hasNavigationTaskSeed ||
        hasNavigationContinueContext ||
        navigationMaterialContext
      ) {
        return;
      }

      const currentValues = form.getFieldsValue([
        'audience',
        'taskPhase',
        'goal',
        'taskSubject',
        'focusPoints',
        'taskInput',
        'context',
        'toneStyle',
      ]) as Record<string, unknown>;
      const exampleValues = buildScriptTemplateExample(defaults);
      const nextValues: Record<string, string> = {};

      if (shouldApplyAssistantDefault(currentValues.audience, staleScriptDefaults.audience)) {
        nextValues.audience = exampleValues.audience;
      }

      if (shouldApplyAssistantDefault(currentValues.taskPhase, staleScriptDefaults.taskPhase)) {
        nextValues.taskPhase = exampleValues.taskPhase;
      }

      if (shouldApplyAssistantDefault(currentValues.goal)) {
        nextValues.goal = exampleValues.goal;
      }

      if (shouldApplyAssistantDefault(currentValues.taskSubject, staleScriptDefaults.taskSubject)) {
        nextValues.taskSubject = exampleValues.taskSubject;
      }

      if (shouldApplyAssistantDefault(currentValues.focusPoints, staleScriptDefaults.focusPoints)) {
        nextValues.focusPoints = exampleValues.focusPoints;
      }

      if (shouldApplyAssistantDefault(currentValues.taskInput, staleScriptDefaults.taskInput)) {
        nextValues.taskInput = exampleValues.taskInput;
      }

      if (shouldApplyAssistantDefault(currentValues.context, staleScriptDefaults.context)) {
        nextValues.context = exampleValues.context;
      }

      if (shouldApplyAssistantDefault(currentValues.toneStyle, staleScriptDefaults.toneStyle)) {
        nextValues.toneStyle = exampleValues.toneStyle;
      }

      if (Object.keys(nextValues).length) {
        form.setFieldsValue(nextValues);
      }
    };

    applyActiveAssistantDefaults().catch((error) => {
      console.warn('写作页当前 Assistant 默认值读取失败：', error);
    });

    return () => {
      cancelled = true;
    };
  }, [
    form,
    hasNavigationContinueContext,
    hasNavigationTaskSeed,
    hasResumeSession,
    navigationMaterialContext,
  ]);


  const executionContextRows = useMemo(
    () => [
      {
        label: '规则范围',
        value: formatScriptDisplayText(effectiveExecutionContext?.rulesScope || '未返回'),
      },
      {
        label: '产品范围',
        value: formatScriptDisplayText(effectiveExecutionContext?.productScope || '未返回'),
      },
      {
        label: '资料范围',
        value: formatScriptDisplayText(effectiveExecutionContext?.docScope || '未返回'),
      },
      {
        label: '判断策略',
        value: formatScriptDisplayText(effectiveExecutionContext?.analyzeStrategy || '未返回'),
      },
      {
        label: '检索策略',
        value: formatScriptDisplayText(effectiveExecutionContext?.searchStrategy || '未返回'),
      },
      {
        label: '写作策略',
        value: formatScriptDisplayText(effectiveExecutionContext?.scriptStrategy || '未返回'),
      },
    ],
    [effectiveExecutionContext],
  );

  const scriptResultRecord = (scriptResult as Record<string, unknown> | null) || null;
  const executionContextSummaryRecord = scriptRuntime?.executionContextSummary || undefined;
  const governanceSummaryRecord = scriptRuntime?.governanceSummary || undefined;

  const effectivePromptId = formatScriptDisplayText(
    readExecutionContextPromptId(effectiveExecutionContext) ||
      readStringValue(executionContextSummaryRecord?.promptId) ||
      readStringValue(governanceSummaryRecord?.promptId),
  );
  const effectivePromptVersion = formatScriptDisplayText(
    readExecutionContextPromptVersion(effectiveExecutionContext) ||
      readStringValue(executionContextSummaryRecord?.promptVersion) ||
      readStringValue(governanceSummaryRecord?.promptVersion),
  );
  const effectiveStrategyId = formatScriptDisplayText(
    readExecutionContextStrategyId(effectiveExecutionContext) ||
      readStringValue(executionContextSummaryRecord?.strategyId) ||
      readStringValue(governanceSummaryRecord?.strategyId) ||
      effectiveExecutionContext?.scriptStrategy ||
      scriptResult?.scriptStrategy,
  );
  const effectiveSourceSummary = formatSourceSummary(effectiveExecutionContext?.source);
  const effectiveFallbackSummary = formatFallbackSummary(effectiveExecutionContext?.fallbackReason);
  const databaseRelationSummaryLabel = formatDatabaseRelationSummary(
    scriptRuntime?.databaseRelationSummary ||
      (scriptResultRecord?.databaseRelationSummary as unknown) ||
      (scriptResultRecord?.databaseSummary as unknown) ||
      (scriptResultRecord?.databaseRelation as unknown) ||
      (executionContextSummaryRecord?.databaseRelationSummary as unknown) ||
      (executionContextSummaryRecord?.databaseRelationSource as unknown) ||
      (governanceSummaryRecord?.databaseRelationSummary as unknown) ||
      (governanceSummaryRecord?.databaseRelationSource as unknown) ||
      effectiveExecutionContext?.databaseRelationSource,
  );
  const shouldShowRuntimeSummary = Boolean(
    resultVisible || scriptRuntime || effectiveExecutionContext || sourceStep || analyzeSourceStep,
  );

  const handleGenerate = async () => {
    try {
      if (hasResumeSession && resumeLoading && !resumeDetail?.session.id) {
        message.warning('session 正在恢复，请稍后再提交。');
        return;
      }

      const values = await form.validateFields();
      setLoading(true);

      const fallbackMaterialContext = navigationMaterialContext;
      const effectiveReferenceSummary =
        values.context ||
        materialContext?.referenceSummary ||
        fallbackMaterialContext?.referenceSummary ||
        '';
      const payload = {
        audience: values.audience || '',
        sessionId: effectiveSessionId,
        fromModule: carriedSource?.fromModule || 'manual',
        assistantId: effectiveAssistantId,
        executionContext: effectiveExecutionContext || undefined,
        evidenceId: selectedEvidenceId || undefined,
        referencePackId: materialContext?.referencePackId || navigationMaterialContext?.referencePackId || undefined,
        taskPhase: values.taskPhase || 'other',
        goal: values.goal || '形成初版说明',
        goalScene: resolveGoalScene(values.goal),
        taskSubject: values.taskSubject || '',
        focusPoints: values.focusPoints || '',
        taskInput: values.taskInput || '',
        context: values.context || '',
        referenceSummary: effectiveReferenceSummary,
        toneStyle: values.toneStyle || 'formal',
        industryType: resumeDetail?.session.industryType || assistantDefaults?.industryType || '',
        ...(!selectedEvidenceId
          ? {
              sourceDocId: fallbackMaterialContext?.sourceDocId || '',
              sourceDocName: fallbackMaterialContext?.sourceDocName || '',
              sourceDocType: fallbackMaterialContext?.sourceDocType || '',
              sourceApplicableScene: fallbackMaterialContext?.sourceApplicableScene || '',
              sourceExternalAvailable: fallbackMaterialContext?.sourceExternalAvailable,
            }
          : {}),
      };

      try {
        const response = await composeDocument(
          {
            ...payload,
            taskInput: values.taskInput || '',
            context: values.context || '',
            referenceSummary: effectiveReferenceSummary,
            goal: values.goal || '形成初版说明',
            goalScene: resolveGoalScene(values.goal),
            deliverable: '参考邮件、说明文稿或沟通草稿',
            variables: {
              audience: values.audience || '',
              industryType: resumeDetail?.session.industryType || assistantDefaults?.industryType || '',
              taskPhase: values.taskPhase || '',
              taskSubject: values.taskSubject || '',
              focusPoints: values.focusPoints || '',
              toneStyle: values.toneStyle || 'formal',
              referencePackId: payload.referencePackId || '',
            },
          },
          adapterPreviewMode ? { clientType } : undefined,
        );

        if (isAgentAdapterResponse(response)) {
          setLastResponseClientType(clientType);
          setAdapterPreview(response);
          setScriptResult(null);
          setScriptRuntime(null);
          setShowDebugInfo(false);
          setResultVisible(true);
          message.success(`${getAgentClientTypeLabel(clientType)} 响应预览已生成`);
          return;
        }

        if (response.success && response.data) {
          setAdapterPreview(null);
          setLastResponseClientType('web');
          setScriptResult(response.data);
          setScriptRuntime(response.runtime || null);
          if (response.data.resolvedEvidence && typeof response.data.resolvedEvidence === 'object') {
            setResolvedEvidence(response.data.resolvedEvidence as SessionEvidenceRecord);
          }
          setResultVisible(true);
          setShowDebugInfo(false);
          message.success(response.message || '生成完成');
        } else {
          message.error(response.message || '生成失败');
        }
      } catch (error) {
        console.error('参考写作真实接口调用失败：', error);
        message.error('真实接口调用失败，请查看浏览器控制台');
        setLoading(false);
        return;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage) {
        message.warning(errorMessage);
      } else {
        message.warning('请先补充必填信息');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    form.resetFields();
    setResultVisible(false);
    setAdapterPreview(null);
    setLastResponseClientType('web');
    setScriptResult(null);
    setScriptRuntime(null);
    setShowDebugInfo(false);
    setCarriedSource(null);
    setResumeDetail(null);
    setResolvedEvidence(null);
  };

  const handleFillExample = () => {
    form.setFieldsValue(buildScriptTemplateExample(assistantDefaults));
  };

  useEffect(() => {
    const state = parseContinueContext(location.state) as ScriptNavigationState | null;

    setCarriedSource(state);
    setResultVisible(false);
    setAdapterPreview(null);
    setScriptResult(null);
    setScriptRuntime(null);
    setResumeDetail(null);
    setResolvedEvidence(null);
  }, [location.state]);

  useEffect(() => {
    const navigationSeed = buildTaskSeedFromPayload(location.state);

    if (!Object.keys(navigationSeed).length) {
      return;
    }

    form.setFieldsValue({
      audience: navigationSeed.audience || undefined,
      taskPhase: navigationSeed.taskPhase || undefined,
      goal:
        normalizeGoalValue(
          navigationSeed.goal,
        ) ||
        undefined,
      taskSubject: navigationSeed.taskSubject || undefined,
      focusPoints: navigationSeed.focusPoints || undefined,
      taskInput: navigationSeed.taskInput || undefined,
      context: navigationSeed.context || undefined,
      toneStyle: navigationSeed.toneStyle || undefined,
    });
  }, [form, location.state]);

  useEffect(() => {
    let cancelled = false;

    const loadResumeDetail = async () => {
      if (!hasResumeSession || !carriedSource?.sessionId) {
        setResumeDetail(null);
        setResolvedEvidence(null);
        setResumeLoadIssue('');
        setResumeLoading(false);
        return;
      }

      setResumeLoading(true);
      const response = await getSessionDetail(carriedSource.sessionId);
      const detail = response.data || null;
      const resolvedSourceStep = findPreferredStep({
        detail,
        stepId: carriedSource.stepId,
        preferredTypes: ['script', 'search', 'analyze'],
      });
      const fallbackEvidence = findPreferredEvidence({
        detail,
        evidenceId: carriedSource.evidenceId,
        step: resolvedSourceStep,
      });

      if (!cancelled) {
        setResumeDetail(detail);
        setResolvedEvidence(fallbackEvidence);
        setResumeLoadIssue(
          detail
            ? ''
            : response.message
              ? `${response.message}（sessionId：${carriedSource.sessionId}）`
              : `sessionId ${carriedSource.sessionId} 未找到，已退回页面入参恢复。`,
        );
        setResumeLoading(false);
      }
    };

    loadResumeDetail().catch((error) => {
      console.error('Script 恢复上下文加载失败：', error);
      if (!cancelled) {
        setResumeDetail(null);
        setResolvedEvidence(null);
        setResumeLoadIssue(
          carriedSource?.sessionId
            ? `sessionId ${carriedSource.sessionId} 加载失败，当前仅保留已带入页面的字段。`
            : '恢复上下文加载失败，当前仅保留已带入页面的字段。',
        );
        setResumeLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [carriedSource?.evidenceId, carriedSource?.sessionId, carriedSource?.stepId, hasResumeSession]);

  useEffect(() => {
    if (
      !Object.keys(sourceTaskSeed).length &&
      !resolvedEvidence &&
      !analyzeSourceSummary
    ) {
      return;
    }

    const inferredGoal =
      normalizeGoalValue(sourceTaskSeed.goal) ||
      (resolvedEvidence?.docType === '规格书' || resolvedEvidence?.docType === '方案资料'
        ? '输出专业说明'
        : '形成初版说明');
    const evidenceReferenceSummary = resolvedEvidence?.summary
      ? `${resolvedEvidence.title || ''}：${resolvedEvidence.summary}`
      : resolvedEvidence?.title || undefined;
    const preferredReferenceSummary =
      navigationMaterialContext?.referenceSummary ||
      evidenceReferenceSummary ||
      sourceTaskSeed.context ||
      analyzeSourceSummary ||
      undefined;

    form.setFieldsValue({
      audience: sourceTaskSeed.audience || undefined,
      taskPhase: sourceTaskSeed.taskPhase || undefined,
      goal: inferredGoal,
      taskSubject:
        sourceTaskSeed.taskSubject ||
        resolvedEvidence?.productName ||
        resolvedEvidence?.title ||
        undefined,
      focusPoints: sourceTaskSeed.focusPoints || undefined,
      taskInput:
        sourceTaskSeed.taskInput ||
        (resolvedEvidence?.title ? `先给我你们的${resolvedEvidence.title}相关资料。` : undefined),
      context: preferredReferenceSummary,
      toneStyle: sourceTaskSeed.toneStyle || undefined,
    });
  }, [
    analyzeSourceSummary,
    form,
    navigationMaterialContext?.referenceSummary,
    resolvedEvidence,
    sourceTaskSeed,
  ]);

  const scriptRouteLabel = scriptResult?.llmRoute || '未返回';
  const scriptStrategyLabel = scriptResult?.scriptStrategy || '未返回';
  const scriptExecutionStrategyLabel = scriptResult?.scriptExecutionStrategy || '未返回';

  const resolvedModelInfo =
    (scriptResult as
      | (ScriptResultData & {
          resolvedModel?: {
            id?: string;
            label?: string;
            provider?: string;
            modelName?: string;
            baseUrl?: string;
            module?: string;
            source?: string;
            resolvedModelId?: string;
            resolvedProvider?: string;
            resolvedModelName?: string;
            resolvedBaseUrl?: string;
            moduleName?: string;
          };
          failureType?: string;
        })
      | null)?.resolvedModel || null;

  const resolvedModelLabel = resolvedModelInfo
    ? `${
        resolvedModelInfo.label ||
        resolvedModelInfo.id ||
        resolvedModelInfo.resolvedModelId ||
        '未命名模型'
      } / ${resolvedModelInfo.provider || resolvedModelInfo.resolvedProvider || 'unknown'} / ${
        resolvedModelInfo.modelName || resolvedModelInfo.resolvedModelName || '未返回模型名'
      }`
    : '未返回';

  const resolvedModelSourceLabel = resolvedModelInfo?.source || '未返回';
  const resolvedModelModuleLabel =
    resolvedModelInfo?.module || resolvedModelInfo?.moduleName || '未返回';
  const scriptFailureTypeLabel =
    ((scriptResult as (ScriptResultData & { failureType?: string }) | null)?.failureType as
      | string
      | undefined) || '未返回';
  const outboundAllowedLabel =
    scriptResult?.outboundAllowed === undefined
      ? '未返回'
      : scriptResult.outboundAllowed
        ? '允许'
        : '不允许';
  const outboundReasonLabel = scriptResult?.outboundReason || '未返回';
  const sanitizedTaskInputLabel =
    scriptResult?.sanitizedTaskInput ||
    scriptResult?.sanitizedCustomerText ||
    '当前未返回脱敏后的任务输入';
  const sanitizedReferenceSummaryLabel =
    scriptResult?.sanitizedReferenceSummary || '当前未返回脱敏后的资料摘要';

  const scriptGuide = buildScriptGuide({
    goal: currentGoal,
    taskPhase: currentTaskPhase,
    materialContext,
  });
  const goalLabel = getGoalLabel(currentGoal);

  const runtimeVersionLabel = resolvedModelLabel || '未返回';
  const currentScriptStepId =
    scriptRuntime?.stepId || scriptResult?.stepId || sourceStep?.id || analyzeSourceStep?.id || '';
  const scriptContinueContext = mergeContinueContexts(
    {
      sessionId: effectiveSessionId,
      stepId: currentScriptStepId || undefined,
      fromModule: 'output',
      assistantId: effectiveAssistantId || undefined,
      executionContext: effectiveExecutionContext || undefined,
    },
    scriptRuntime?.continuePayload || null,
    carriedSource,
  );
  const analyzeSummary = readString(analyzeSourceOutputRecord?.summary) || '未返回';
  const analyzeSceneJudgement = readString(analyzeSourceOutputRecord?.sceneJudgement) || '未返回';
  const analyzeNextActions = readStringArray(analyzeSourceOutputRecord?.nextActions);
  const analyzeNextStepType = readString(analyzeSourceOutputRecord?.nextStepType) || '未返回';

  const outputTypeLabel = getOutputTypeLabel({
    goal: currentGoal,
    fromModule: carriedSource?.fromModule,
  });

  const outputTitle = buildOutputTitle({
    taskSubject:
      form.getFieldValue('taskSubject') ||
      sourceTaskSeed.taskSubject ||
      resolvedEvidence?.productName ||
      resolvedEvidence?.title,
    goal: currentGoal,
  });

  const oneLineConclusion =
    scriptResult?.conciseVersion ||
    materialContext?.referenceSummary ||
    '当前未形成一句话结论。';

  const analyzeEvidenceRows = [
    {
      label: 'Analyze 摘要',
      value: analyzeSummary,
    },
    {
      label: '场景判断',
      value: analyzeSceneJudgement,
    },
    {
      label: '适用对象',
      value: form.getFieldValue('audience') || resumeDetail?.session.audience || '未返回',
    },
    {
      label: '当前阶段',
      value: form.getFieldValue('taskPhase') || resumeDetail?.session.currentStage || '未返回',
    },
    {
      label: '任务主题',
      value:
        form.getFieldValue('taskSubject') ||
        sourceTaskSeed.taskSubject ||
        resolvedEvidence?.productName ||
        resolvedEvidence?.title ||
        '未返回',
    },
    {
      label: '任务输入',
      value:
        form.getFieldValue('taskInput') ||
        sourceTaskSeed.taskInput ||
        '未返回',
    },
  ];

  const searchEvidenceRows = [
    {
      label: '参考资料包 ID',
      value: materialContext?.referencePackId || scriptResult?.referencePackId || '未返回',
    },
    {
      label: '证据 ID',
      value: materialContext?.evidenceId || '未返回',
    },
    {
      label: '资料名称',
      value: materialContext?.sourceDocName || '未返回',
    },
    {
      label: '资料类型',
      value: materialContext?.sourceDocType || '未返回',
    },
    {
      label: '适用场景',
      value: materialContext?.sourceApplicableScene || '未返回',
    },
    {
      label: '资料摘要',
      value: form.getFieldValue('context') || materialContext?.referenceSummary || '未返回',
    },
    {
      label: '资料外发状态',
      value:
        materialContext?.sourceExternalAvailable === undefined
          ? '未返回'
          : materialContext.sourceExternalAvailable
            ? '可外发'
            : '仅内部参考',
    },
  ];

  const currentRiskTaskSubject =
    form.getFieldValue('taskSubject') ||
    sourceTaskSeed.taskSubject ||
    resolvedEvidence?.productName ||
    resolvedEvidence?.title ||
    '';
  const currentRiskTaskInput = form.getFieldValue('taskInput') || sourceTaskSeed.taskInput || '';
  const currentRiskAudience = form.getFieldValue('audience') || sourceTaskSeed.audience || '';
  const currentRiskIndustryType =
    sourceTaskSeed.industryType ||
    resumeDetail?.session.industryType ||
    assistantDefaults?.industryType ||
    '';
  const assistantPerspective = resolveAssistantPerspective({
    assistantId: effectiveAssistantId,
    industryType: currentRiskIndustryType,
    templateRole: assistantDefaults?.templateRole || '',
    executionContext: effectiveExecutionContext,
    taskSubject: currentRiskTaskSubject,
    taskInput: currentRiskTaskInput,
    audience: currentRiskAudience,
    taskPhase: currentTaskPhase || sourceTaskSeed.taskPhase || '',
  });
  const riskRows = buildPerspectiveRiskRows({
    perspective: assistantPerspective,
    outboundAllowedLabel,
    outboundReasonLabel,
  });
  const visibleCautionNotes = Array.from(
    new Set([
      ...(scriptResult?.cautionNotes || []).filter(
        (item) => !(assistantPerspective.suppressTechnicalNotes && isTechnicalRiskText(item)),
      ),
      ...assistantPerspective.cautionNotes,
    ]),
  );

  const handleCopyText = async (text: string, successMessage: string) => {
    if (!text) {
      message.warning('当前没有可复制内容');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      message.success(successMessage);
    } catch {
      message.error('复制失败，请稍后重试');
    }
  };

  return (
    <div>
      <PageHeader
        title="参考写作"
        description="输入任务与资料背景，快速生成参考邮件、说明文稿或沟通草案，并承接本次真实生效摘要。"
        extra={<AgentClientStatusBadge clientType={clientType} />}
      />

      {resumeLoadIssue ? (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message="session 恢复失败"
          description={resumeLoadIssue}
        />
      ) : null}

      {resumeFallbackNotice ? (
        <Alert
          style={{ marginBottom: 16 }}
          type="info"
          showIcon
          message="session / evidence 恢复已自动降级"
          description={resumeFallbackNotice}
        />
      ) : null}

      {!resumeLoadIssue && !resumeLoading && !effectiveSessionId ? (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message="当前未接到 sessionId"
          description="本次参考写作仍可执行，但 continue 链路和跨页面上下文连续性可能不完整。"
        />
      ) : null}

      {selectedEvidenceId ? (
        <Alert
          style={{ marginBottom: 16 }}
          type="info"
          showIcon
          message={`当前已绑定 evidenceId：${selectedEvidenceId}`}
          description="写作链路会优先按 Session 中已持久化的一级证据回查资料上下文，而不是依赖页面临时带入的 doc/ref 字段。"
        />
      ) : null}

      {hasCarriedMaterialContext ? (
        <ResultCard title="已带入资料信息">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <Card size="small" title="来源模块">
              <p style={{ marginBottom: 0 }}>
                {carriedSource?.fromModule === 'search'
                  ? '资料检索'
                  : carriedSource?.fromModule === 'session-detail'
                    ? '会话详情继续生成'
                    : carriedSource?.fromModule || '未返回'}
              </p>
            </Card>
            <Card size="small" title="当前会话 ID">
              <p style={{ marginBottom: 0 }}>{effectiveSessionId || '未返回'}</p>
            </Card>
            <Card size="small" title="证据 ID">
              <p style={{ marginBottom: 0 }}>{materialContext?.evidenceId || '未返回'}</p>
            </Card>
            <Card size="small" title="参考资料包 ID">
              <p style={{ marginBottom: 0 }}>
                {materialContext?.referencePackId || scriptResult?.referencePackId || '未返回'}
              </p>
            </Card>
            <Card size="small" title="资料名称">
              <p style={{ marginBottom: 0 }}>{materialContext?.sourceDocName || '未返回'}</p>
            </Card>
            <Card size="small" title="资料类型">
              <p style={{ marginBottom: 0 }}>{materialContext?.sourceDocType || '未返回'}</p>
            </Card>
            <Card size="small" title="适用场景">
              <p style={{ marginBottom: 0 }}>{materialContext?.sourceApplicableScene || '未返回'}</p>
            </Card>
            <Card size="small" title="资料外发状态">
              <p style={{ marginBottom: 0 }}>
                {materialContext?.sourceExternalAvailable === undefined
                  ? '未返回'
                  : materialContext?.sourceExternalAvailable
                    ? '可外发'
                    : '仅内部参考'}
              </p>
            </Card>
            <Card size="small" title="参考资料摘要">
              <p style={{ marginBottom: 0 }}>{materialContext?.referenceSummary || '未返回'}</p>
            </Card>
          </div>
        </ResultCard>
      ) : null}

      <Card style={{ borderRadius: 12 }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            toneStyle: 'formal',
          }}
        >
          <Form.Item label="适用对象" name="audience">
            <Input
              placeholder={`例如：${assistantDefaults?.audience || '销售 / 技术支持 / 客户沟通对象'}`}
            />
          </Form.Item>

          <Form.Item label="任务阶段" name="taskPhase">
            <Select placeholder="请选择任务阶段" options={stageOptions} />
          </Form.Item>

          <Form.Item
            label="写作目标"
            name="goal"
            rules={[{ required: true, message: '请选择写作目标' }]}
          >
            <Select placeholder="请选择写作目标" options={goalOptions} />
          </Form.Item>

          <Form.Item label="任务主题" name="taskSubject">
            <Input
              placeholder={`例如：${assistantDefaults?.taskSubject || assistantDefaults?.subjectHint || '湿制程材料方案'}`}
            />
          </Form.Item>

          <Form.Item label="重点关注" name="focusPoints">
            <TextArea
              placeholder={`例如：${assistantDefaults?.focusPoints || '风险、成本、稳定性、边界条件'}`}
              rows={3}
            />
          </Form.Item>

          <Form.Item
            label="任务输入"
            name="taskInput"
            rules={[{ required: true, message: '请输入任务输入' }]}
          >
            <TextArea
              placeholder={assistantDefaults?.scriptTaskInput || '请输入要转成文稿的原始描述、问题或待回复内容'}
              rows={5}
            />
          </Form.Item>

          <Form.Item
            label="参考资料 / 背景摘要"
            name="context"
            extra={selectedEvidenceId ? '当前已绑定 evidenceId，提交时会优先以 Session 证据中的摘要为准。' : undefined}
          >
            <TextArea
              placeholder={assistantDefaults?.scriptContext || '可填写资料摘要、事实依据或背景说明'}
              rows={4}
            />
          </Form.Item>

          <Form.Item
            label="表达风格"
            name="toneStyle"
            rules={[{ required: true, message: '请选择表达风格' }]}
          >
            <Select placeholder="请选择表达风格" options={toneOptions} />
          </Form.Item>

          <Space wrap>
            <Button type="primary" onClick={handleGenerate} loading={loading}>
              生成参考文稿
            </Button>
            <Button onClick={handleReset}>清空</Button>
            <Button onClick={handleFillExample}>载入示例</Button>
          </Space>
        </Form>
      </Card>
      {resultVisible ? (
        <div style={{ marginTop: 24 }}>
          <Spin spinning={loading}>
            {adapterPreview ? (
              <ClientAdapterPreviewCard
                clientType={lastResponseClientType}
                response={adapterPreview}
                note="这份预览用于联调渠道适配效果，便于直接确认飞书卡片结构是否符合预期。"
              />
            ) : (
              <>
            {shouldShowRuntimeSummary ? (
              <>
                <div style={{ marginBottom: 24 }}>
                  <ResolvedSummaryCard
                    title="本次真实生效摘要"
                    assistantId={effectiveAssistantId || '未返回'}
                    promptId={effectivePromptId}
                    promptVersion={effectivePromptVersion}
                    strategyId={effectiveStrategyId}
                    source={effectiveSourceSummary}
                    fallback={effectiveFallbackSummary}
                    versionLabel={runtimeVersionLabel}
                    databaseRelationSource={databaseRelationSummaryLabel}
                  />
                </div>

                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                  <Col xs={24} md={12}>
                    <Card title="模型运行摘要" style={{ borderRadius: 12 }}>
                      <p>
                        <strong>resolvedModel：</strong>
                        {resolvedModelLabel}
                      </p>
                      <p>
                        <strong>来源：</strong>
                        {resolvedModelSourceLabel}
                      </p>
                      <p>
                        <strong>模块：</strong>
                        {resolvedModelModuleLabel}
                      </p>
                      <p style={{ marginBottom: 0 }}>
                        <strong>失败类型：</strong>
                        {scriptFailureTypeLabel}
                      </p>
                    </Card>
                  </Col>

                  <Col xs={24} md={12}>
                    <Card title="数据库关系摘要" style={{ borderRadius: 12 }}>
                      <p style={{ marginBottom: 0 }}>{databaseRelationSummaryLabel}</p>
                    </Card>
                  </Col>
                </Row>
              </>
            ) : null}
            <ResultCard title="页面头部">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                <Card size="small" title="页面标题">
                  <p style={{ marginBottom: 0 }}>参考写作结果</p>
                </Card>
                <Card size="small" title="sessionId">
                  <p style={{ marginBottom: 0 }}>{effectiveSessionId || '未返回'}</p>
                </Card>
                <Card size="small" title="assistantId">
                  <p style={{ marginBottom: 0 }}>{effectiveAssistantId || '未返回'}</p>
                </Card>
                <Card size="small" title="fromModule">
                  <p style={{ marginBottom: 0 }}>{carriedSource?.fromModule || 'manual'}</p>
                </Card>
                <Card size="small" title="outputType">
                  <p style={{ marginBottom: 0 }}>{outputTypeLabel}</p>
                </Card>
              </div>
            </ResultCard>

            <ResultCard title="输出结论区">
              <p style={{ marginBottom: 8 }}>
                <strong>当前输出标题：</strong>
                {outputTitle}
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>一句话结论：</strong>
                {oneLineConclusion}
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>当前输出目标：</strong>
                {goalLabel}
              </p>
              <Space wrap>
                <Tag color="blue">{outputTypeLabel}</Tag>
                <Tag color="purple">assistant：{effectiveAssistantId || '未返回'}</Tag>
                <Tag color="green">建议优先使用：{scriptGuide.recommendedVersion}</Tag>
              </Space>
            </ResultCard>

            <ResultCard title="关键依据区">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 16,
                }}
              >
                <Card size="small" title="判断依据">
                  {analyzeEvidenceRows.map((item) => (
                    <p key={item.label} style={{ marginBottom: 8 }}>
                      <strong>{item.label}：</strong>
                      {item.value}
                    </p>
                  ))}
                </Card>
                <Card size="small" title="检索依据">
                  {searchEvidenceRows.map((item) => (
                    <p key={item.label} style={{ marginBottom: 8 }}>
                      <strong>{item.label}：</strong>
                      {item.value}
                    </p>
                  ))}
                </Card>
                <Card size="small" title="上下文依据">
                  <p style={{ marginBottom: 8 }}>
                    <strong>sessionId：</strong>
                    {effectiveSessionId || '未返回'}
                  </p>
                  {executionContextRows.map((item) => (
                    <p key={item.label} style={{ marginBottom: 8 }}>
                      <strong>{item.label}：</strong>
                      {item.value}
                    </p>
                  ))}
                  <p style={{ marginBottom: 8 }}>
                    <strong>模型路线：</strong>
                    {scriptRouteLabel}
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    <strong>执行策略：</strong>
                    {scriptExecutionStrategyLabel}
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    <strong>resolvedModel：</strong>
                    {resolvedModelLabel}
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    <strong>来源：</strong>
                    {resolvedModelSourceLabel}
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    <strong>模块：</strong>
                    {resolvedModelModuleLabel}
                  </p>
                  <p style={{ marginBottom: 0 }}>
                    <strong>失败类型：</strong>
                    {scriptFailureTypeLabel}
                  </p>
                </Card>
              </div>
            </ResultCard>

            <ResultCard title="风险提醒区">
              {riskRows.map((item) => (
                <p key={item.label} style={{ marginBottom: 8 }}>
                  <strong>{item.label}：</strong>
                  {item.value}
                </p>
              ))}
              {visibleCautionNotes.length ? (
                <ul style={{ marginTop: 12, paddingLeft: 20 }}>
                  {visibleCautionNotes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </ResultCard>

            <ResultCard title="下一步动作区">
              <p style={{ marginBottom: 8 }}>
                <strong>推荐下一步动作：</strong>
                {analyzeNextActions[0] || scriptGuide.nextAction}
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>建议进入链路：</strong>
                {resolveGoalScene(currentGoal) === 'technical_reply'
                  ? '优先继续检索 / 判断'
                  : resolveGoalScene(currentGoal) === 'sample_followup'
                    ? '优先继续写作 / 后续推进'
                    : '优先继续判断 / 写作'}
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>判断链下一步建议：</strong>
                {analyzeNextActions.length ? analyzeNextActions.join('；') : '未返回'}
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>判断链推荐类型：</strong>
                {analyzeNextStepType}
              </p>
              <Space wrap>
                <Button
                  onClick={() =>
                    navigate('/judge', {
                      state: buildContinueNavigationState({
                        continueContext: scriptContinueContext,
                        carryPayload: {
                          taskObject: form.getFieldValue('audience'),
                          industryType: resumeDetail?.session.industryType,
                          taskPhase: form.getFieldValue('taskPhase'),
                          taskSubject: form.getFieldValue('taskSubject'),
                          taskInput: form.getFieldValue('taskInput'),
                          context: form.getFieldValue('context'),
                        },
                      }),
                    })
                  }
                >
                  继续判断
                </Button>
                <Button
                  onClick={() =>
                    navigate('/retrieve', {
                      state: buildContinueNavigationState({
                        continueContext: scriptContinueContext,
                        carryPayload: {
                          taskInput: form.getFieldValue('taskSubject') || form.getFieldValue('taskInput'),
                          taskSubject: form.getFieldValue('taskSubject'),
                          industryType: resumeDetail?.session.industryType,
                          docType: materialContext?.sourceDocType,
                          context: form.getFieldValue('context'),
                        },
                      }),
                    })
                  }
                >
                  继续检索
                </Button>
                <Button type="primary" onClick={handleGenerate}>
                  再生成一次
                </Button>
                <Button
                  onClick={() => {
                    if (!effectiveSessionId) {
                      message.warning('当前未接到 sessionId，无法返回 Session Detail');
                      return;
                    }

                    navigate(`/sessions/${effectiveSessionId}`);
                  }}
                >
                  返回会话详情
                </Button>
              </Space>
            </ResultCard>

            <ResultCard title="可复用输出区">
              <Card size="small" title="正式版" style={{ marginBottom: 12 }}>
                <p>{scriptResult?.formalVersion || '当前未返回正式版文稿。'}</p>
                <Button
                  size="small"
                  onClick={() =>
                    handleCopyText(scriptResult?.formalVersion || '', '正式版已复制')
                  }
                >
                  复制正式版
                </Button>
              </Card>
              <Card size="small" title="简洁版" style={{ marginBottom: 12 }}>
                <p>{scriptResult?.conciseVersion || '当前未返回简洁版文稿。'}</p>
                <Button
                  size="small"
                  onClick={() =>
                    handleCopyText(scriptResult?.conciseVersion || '', '简洁版已复制')
                  }
                >
                  复制简洁版
                </Button>
              </Card>
              <Card size="small" title="口语版" style={{ marginBottom: 12 }}>
                <p>{scriptResult?.spokenVersion || '当前未返回口语版文稿。'}</p>
                <Button
                  size="small"
                  onClick={() =>
                    handleCopyText(scriptResult?.spokenVersion || '', '口语版已复制')
                  }
                >
                  复制口语版
                </Button>
              </Card>

              <div style={{ marginTop: 12 }}>
                <Button type="default" size="small" onClick={() => setShowDebugInfo(!showDebugInfo)}>
                  {showDebugInfo ? '隐藏调试信息' : '查看调试信息'}
                </Button>
              </div>
            </ResultCard>

            {showDebugInfo ? (
              <>
                <ResultCard title="调试补充信息">
                  <p style={{ marginBottom: 8 }}>
                    <strong>模型路线：</strong>
                    {scriptRouteLabel}
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    <strong>模块策略：</strong>
                    {scriptStrategyLabel}
                  </p>
                  <p style={{ marginBottom: 8 }}>
                    <strong>脱敏后的任务输入：</strong>
                    {sanitizedTaskInputLabel}
                  </p>
                  <p style={{ marginBottom: 0 }}>
                    <strong>脱敏后的资料摘要：</strong>
                    {sanitizedReferenceSummaryLabel}
                  </p>
                </ResultCard>

                <ResultCard title="调试数据">
                  <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                    {JSON.stringify(scriptResult, null, 2)}
                  </pre>
                </ResultCard>
              </>
            ) : null}
              </>
            )}
          </Spin>
        </div>
      ) : (
        <div style={{ marginTop: 24 }}>
          <ResultCard title="参考写作结果">
            <EmptyBlock text="请填写信息并点击生成参考文稿。若从其他模块继续进入，本页会优先复用 sessionId、assistantId、executionContext 与资料上下文。" />
          </ResultCard>
        </div>
      )}
    </div>
  );
}

export default ScriptPage;
