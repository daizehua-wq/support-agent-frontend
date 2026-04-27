import {
  allVariablesAvailable,
  listTemplates,
  renderTemplate,
} from '../data/models/generationTemplate.js';
import { listNotes } from '../data/models/guidanceNote.js';
import { matchRules } from '../data/models/knowledgeRule.js';
import {
  readSettings,
  getModelConfigForModule,
  getDefaultSettings,
  getResolvedExecutionContextForModule,
} from '../services/settingsService.js';
import { getModulePolicy } from '../config/policyConfig.js';
import { resolveModelRuntimeForModule } from '../services/modelRouter.js';
import { buildOutboundSanitizationResult } from '../services/sanitizationService.js';
import { generateScriptWithLLM } from '../services/llmService.js';
import {
  getOrCreateSession,
  appendSessionStep,
  attachSessionAsset,
  getSessionEvidenceById,
  updateSession,
} from '../services/sessionService.js';
import { buildExecutionContextFromProfile, resolveAssistantProfile } from '../services/assistantContextService.js';
import { getDefaultAssistantProfile, getPromptForModule } from '../services/promptService.js';
import { normalizeCapabilityRequest } from '../services/taskModelService.js';
import {
  buildPerspectiveCautionNotes,
  resolveAssistantPerspective,
} from '../services/assistantPerspectiveService.js';
import {
  buildReferencePackSummaryText,
  getReferencePackScriptInput,
} from '../services/referencePackService.js';


const buildTemplateScriptResult = ({
  formalVersion = '',
  conciseVersion = '',
  spokenVersion = '',
  cautionNotes = [],
}) => {
  return {
    formalVersion,
    conciseVersion,
    spokenVersion,
    llmVersion: '',
    llmRoute: 'template-fallback',
    cautionNotes,
  };
};

const inferOutputType = ({ goal = '', taskInput = '', referenceSummary = '' }) => {
  const mergedText = `${goal} ${taskInput} ${referenceSummary}`;

  if (
    mergedText.includes('测试') ||
    mergedText.includes('验证') ||
    mergedText.includes('寄样') ||
    mergedText.includes('样品')
  ) {
    return 'test_promotion';
  }

  if (
    mergedText.includes('技术') ||
    mergedText.includes('工艺') ||
    mergedText.includes('兼容性') ||
    mergedText.includes('参数') ||
    mergedText.includes('残留')
  ) {
    return 'technical_reply';
  }

  if (mergedText.includes('跟进') || mergedText.includes('回复') || mergedText.includes('说明')) {
    return 'followup_script';
  }

  return 'generic_output';
};

const collectCautionNotes = ({ faqs = [], focusPoints = '' }) => {
  if (!focusPoints) {
    return [];
  }

  return (faqs || [])
    .filter((item) => {
      const keywords = Array.isArray(item.keywords)
        ? item.keywords
        : [item.keyword, item.content].filter(Boolean);

      return keywords.some((keyword) => {
        const normalizedKeyword = String(keyword || '').trim();
        return (
          normalizedKeyword &&
          (focusPoints.includes(normalizedKeyword) || normalizedKeyword.includes(focusPoints))
        );
      });
    })
    .map((item) => item.cautionNote || item.content)
    .filter(Boolean);
};

const buildFaqsFromNotes = (notes = []) => {
  return (notes || []).map((note) => ({
    id: note.id,
    keyword: note.content,
    keywords: [note.content],
    cautionNote: note.content,
    content: note.content,
  }));
};

const buildScriptRulesFromKnowledge = (rules = []) => {
  return {
    scriptToneRules: (rules || []).map((rule) => {
      const legacyRule = rule.legacyRule || {};
      const suggestions =
        rule.suggestions && typeof rule.suggestions === 'object' && !Array.isArray(rule.suggestions)
          ? rule.suggestions
          : {};

      return {
        ...legacyRule,
        name: legacyRule.name || rule.id,
        ruleType: legacyRule.ruleType || rule.topic || '',
        scene: legacyRule.scene || rule.scenario || '',
        toneStyle: legacyRule.toneStyle || rule.scenario || rule.topic || '',
        keywords: legacyRule.keywords || rule.keywords || [],
        description: legacyRule.description || suggestions.description || '',
        scope: legacyRule.scope || [rule.domainType || rule.domain_type || 'general'],
      };
    }),
  };
};

const replaceProductPlaceholder = (templateText = '', taskSubject = '') => {
  return String(templateText || '').replaceAll('【任务主题】', taskSubject || '相关事项');
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeText = (value = '') => String(value || '').trim();

const toSnakeCase = (value = '') =>
  normalizeText(value).replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);

const stringifyTemplateValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => (isPlainObject(item) ? JSON.stringify(item) : normalizeText(item)))
      .filter(Boolean)
      .join('；');
  }

  if (isPlainObject(value)) {
    return JSON.stringify(value);
  }

  return normalizeText(value);
};

const flattenTemplateContext = (source = {}, prefix = '', target = {}) => {
  if (!isPlainObject(source)) {
    return target;
  }

  Object.entries(source).forEach(([rawKey, value]) => {
    const key = normalizeText(rawKey);
    if (!key) {
      return;
    }

    const nextKey = prefix ? `${prefix}.${key}` : key;
    const snakeKey = toSnakeCase(nextKey);

    target[nextKey] = value;
    if (snakeKey && snakeKey !== nextKey) {
      target[snakeKey] = value;
    }

    if (isPlainObject(value)) {
      flattenTemplateContext(value, nextKey, target);
    }
  });

  return target;
};

const firstTemplateValue = (...values) => {
  for (const value of values) {
    const normalizedValue = stringifyTemplateValue(value);
    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return '';
};

const buildRuleOnlyTemplateContext = ({
  normalizedInput = {},
  variables = {},
  effectiveTaskSubject = '',
  effectiveReferenceSummary = '',
  cautionNotes = [],
} = {}) => {
  const analysisResult = isPlainObject(normalizedInput.analysisResult)
    ? normalizedInput.analysisResult
    : isPlainObject(normalizedInput.analysis_result)
      ? normalizedInput.analysis_result
      : {};
  const cachedCompanyData = isPlainObject(normalizedInput.cachedCompanyData)
    ? normalizedInput.cachedCompanyData
    : isPlainObject(normalizedInput.companyData)
      ? normalizedInput.companyData
      : isPlainObject(normalizedInput.cached_company_data)
        ? normalizedInput.cached_company_data
        : {};
  const contextData = {
    ...flattenTemplateContext(variables),
    ...flattenTemplateContext(analysisResult, 'analysisResult'),
    ...flattenTemplateContext(cachedCompanyData, 'companyData'),
    task_subject: effectiveTaskSubject,
    taskSubject: effectiveTaskSubject,
    task_input: normalizedInput.taskInput || '',
    taskInput: normalizedInput.taskInput || '',
    reference_summary: effectiveReferenceSummary,
    referenceSummary: effectiveReferenceSummary,
    focus_points: normalizedInput.focusPoints || '',
    focusPoints: normalizedInput.focusPoints || '',
    goal: normalizedInput.goal || '',
    suggestions: firstTemplateValue(
      variables.suggestions,
      variables.recommended_actions,
      variables.recommendedActions,
      normalizedInput.suggestions,
      normalizedInput.recommendations,
      analysisResult.suggestions,
      analysisResult.recommended_actions,
      analysisResult.recommendedActions,
    ),
    guidance_notes: cautionNotes.map(stringifyTemplateValue).filter(Boolean).join('\n'),
    guidanceNotes: cautionNotes.map(stringifyTemplateValue).filter(Boolean).join('\n'),
  };

  contextData.company_name = firstTemplateValue(
    variables.company_name,
    variables.companyName,
    normalizedInput.company_name,
    normalizedInput.companyName,
    cachedCompanyData.companyName,
    cachedCompanyData.company_name,
    effectiveTaskSubject,
    normalizedInput.taskObject,
  );
  contextData.companyName = contextData.company_name;
  contextData.risk_level = firstTemplateValue(
    variables.risk_level,
    variables.riskLevel,
    normalizedInput.risk_level,
    normalizedInput.riskLevel,
    analysisResult.risk_level,
    analysisResult.riskLevel,
  );
  contextData.riskLevel = contextData.risk_level;
  contextData.risk_details = firstTemplateValue(
    variables.risk_details,
    variables.riskDetails,
    normalizedInput.risk_details,
    normalizedInput.riskDetails,
    analysisResult.risk_details,
    analysisResult.riskDetails,
    analysisResult.summary,
    cachedCompanyData.riskInfo,
    cachedCompanyData.risk_info,
  );
  contextData.riskDetails = contextData.risk_details;

  return contextData;
};

const buildRuleOnlyModelRuntime = (durationMs = 0) => ({
  route: 'rule_only',
  reason: 'standard_template_rendered_without_llm',
  durationMs,
  latencyMs: durationMs,
  tokensUsed: 0,
  resolvedModel: {
    isResolved: true,
    resolvedProvider: 'rule',
    resolvedModelName: 'rule_only',
    source: 'generation-template',
  },
});

const resolveSceneTemplates = ({ templates = [], goalScene = '' }) => {
  const scene = goalScene || 'first_reply';
  let sceneTemplates = (templates || []).filter((item) => item.scene === scene);

  if (sceneTemplates.length === 0) {
    sceneTemplates = (templates || []).filter((item) => item.scene === 'first_reply');
  }

  const getTemplateByTone = (tone) => {
    return (
      sceneTemplates.find((item) => item.toneStyle === tone) ||
      (templates || []).find((item) => item.scene === 'first_reply' && item.toneStyle === tone) ||
      null
    );
  };

  return {
    scene,
    sceneTemplates,
    formalTemplate: getTemplateByTone('formal'),
    conciseTemplate: getTemplateByTone('concise'),
    spokenTemplate: getTemplateByTone('spoken'),
  };
};

const buildFallbackExecutionContext = (assistantId = '') => {
  const assistantProfile = resolveAssistantProfile(assistantId) || getDefaultAssistantProfile();
  return buildExecutionContextFromProfile(assistantProfile, readSettings());
};

const getProductDirectionFromEvidenceTitle = (title = '') => {
  const rawTitle = String(title || '').trim();

  if (!rawTitle) {
    return '';
  }

  return rawTitle.replace(/规格书|FAQ|说明资料|说明文件|资料/g, '').trim() || rawTitle;
};

const buildEvidenceReferenceSummary = (evidence = null) => {
  if (!evidence) {
    return '';
  }

  return `${evidence.title || ''}：${evidence.summary || ''}`.trim();
};

const buildResolvedEvidenceContext = (evidence = null) => {
  if (!evidence) {
    return null;
  }

  return {
    evidenceId: evidence.evidenceId || '',
    sourceDocId: evidence.sourceRef || '',
    sourceDocName: evidence.title || '',
    sourceDocType: evidence.docType || '',
    sourceApplicableScene: evidence.applicableScene || '',
    sourceExternalAvailable: evidence.outboundStatus === 'allowed',
    referenceSummary: buildEvidenceReferenceSummary(evidence),
    taskSubject: evidence.productName || getProductDirectionFromEvidenceTitle(evidence.title),
  };
};

export const runGenerateScriptFlow = async (rawInput = {}, options = {}) => {
  const normalizedRequest = normalizeCapabilityRequest(rawInput, 'compose');
  const taskModel = normalizedRequest.taskModel;
  const normalizedInput = normalizedRequest.payload;
  const {
    sessionId = '',
    fromModule = 'manual',
    evidenceId = '',
    sourceDocId = '',
    sourceDocName = '',
    sourceDocType = '',
    sourceApplicableScene = '',
    sourceExternalAvailable = false,
    industryType = 'other',
    audience = '',
    taskPhase = 'other',
    goal = '',
    goalScene = 'first_reply',
    taskSubject = '',
    focusPoints = '',
    taskInput = '',
    referenceSummary = '',
    toneStyle = 'formal',
    outputStyle = '',
    context = '',
    deliverable = '',
    variables = {},
    attachments = [],
    appId = '',
    referencePackId = '',
  } = normalizedInput;
  const resolvedEvidence = getSessionEvidenceById(sessionId, evidenceId);
  const resolvedEvidenceContext = buildResolvedEvidenceContext(resolvedEvidence);
  const referencePackInput = referencePackId
    ? getReferencePackScriptInput(referencePackId)
    : null;
  const referencePackSummary = buildReferencePackSummaryText(referencePackInput);
  const effectiveSourceDocId =
    referencePackInput?.referencePackId || resolvedEvidenceContext?.sourceDocId || sourceDocId;
  const effectiveSourceDocName =
    referencePackInput?.title || resolvedEvidenceContext?.sourceDocName || sourceDocName;
  const effectiveSourceDocType =
    referencePackInput ? 'reference_pack' : resolvedEvidenceContext?.sourceDocType || sourceDocType;
  const effectiveSourceApplicableScene =
    referencePackInput ? 'governed_reference_pack' : resolvedEvidenceContext?.sourceApplicableScene || sourceApplicableScene;
  const effectiveSourceExternalAvailable =
    referencePackInput ? false : resolvedEvidenceContext?.sourceExternalAvailable ?? sourceExternalAvailable;
  const effectiveTaskSubject =
    taskSubject || referencePackInput?.title || resolvedEvidenceContext?.taskSubject || '';
  const effectiveReferenceSummary =
    referencePackSummary || resolvedEvidenceContext?.referenceSummary || referenceSummary || '';

  const runtimeSettings = options.settings || readSettings() || getDefaultSettings();
  const baseScriptModelConfig = getModelConfigForModule('script');
  const modelRuntime = resolveModelRuntimeForModule({
    moduleName: 'script',
    modelSettings: runtimeSettings.model || {},
  });
  const scriptModelConfig = modelRuntime.resolvedModel?.isResolved
    ? {
        ...baseScriptModelConfig,
        modelProvider:
          modelRuntime.resolvedModel.resolvedProvider || baseScriptModelConfig.modelProvider,
        baseUrl: modelRuntime.resolvedModel.resolvedBaseUrl || baseScriptModelConfig.baseUrl,
        modelName: modelRuntime.resolvedModel.resolvedModelName || baseScriptModelConfig.modelName,
        appId,
      }
    : {
        ...baseScriptModelConfig,
        appId,
      };

  const defaultAssistantProfile = getDefaultAssistantProfile();
  const activeAssistantIdFromSettings =
    runtimeSettings.assistant?.activeAssistantId ||
    runtimeSettings.activeAssistantId ||
    defaultAssistantProfile?.id ||
    '';
  const initialExecutionContextInput =
    runtimeSettings.assistant?.executionContext || buildFallbackExecutionContext(activeAssistantIdFromSettings);
  const initialScriptPrompt = getPromptForModule(activeAssistantIdFromSettings, 'script');
  const initialResolvedExecutionContext = getResolvedExecutionContextForModule(
    'script',
    initialExecutionContextInput,
    {
      modulePrompt: {
        promptId: initialScriptPrompt?.id || '',
        promptVersion: initialScriptPrompt?.version || '',
      },
    },
  );
  const activeAssistantId =
    initialResolvedExecutionContext.resolvedAssistant?.assistantId || activeAssistantIdFromSettings;
  const scriptPrompt = getPromptForModule(activeAssistantId, 'script');
  const baseExecutionContext = getResolvedExecutionContextForModule(
    'script',
    initialExecutionContextInput,
    {
      modulePrompt: {
        promptId: scriptPrompt?.id || '',
        promptVersion: scriptPrompt?.version || '',
      },
    },
  );
  const promptId = baseExecutionContext.resolvedPrompt?.promptId || scriptPrompt?.id || '';
  const promptVersion = baseExecutionContext.resolvedPrompt?.promptVersion || scriptPrompt?.version || '';
  const executionContext = {
    ...baseExecutionContext,
    resolvedPrompt: {
      ...(baseExecutionContext.resolvedPrompt || {}),
      promptId,
      promptVersion,
    },
    source: {
      ...(baseExecutionContext.source || {}),
      prompt:
        baseExecutionContext.source?.prompt && baseExecutionContext.source?.prompt !== 'none'
          ? baseExecutionContext.source.prompt
          : promptId
            ? 'module.script.prompt'
            : baseExecutionContext.source?.prompt || 'none',
      promptVersion:
        baseExecutionContext.source?.promptVersion && baseExecutionContext.source?.promptVersion !== 'none'
          ? baseExecutionContext.source.promptVersion
          : promptVersion
            ? 'module.script.promptVersion'
            : baseExecutionContext.source?.promptVersion || 'none',
    },
    fallbackReason: {
      ...(baseExecutionContext.fallbackReason || {}),
      prompt:
        promptId && baseExecutionContext.fallbackReason?.prompt === 'prompt-missing'
          ? 'module-prompt-applied'
          : baseExecutionContext.fallbackReason?.prompt,
      promptVersion:
        promptVersion && baseExecutionContext.fallbackReason?.promptVersion === 'prompt-version-missing'
          ? 'module-prompt-version-applied'
          : baseExecutionContext.fallbackReason?.promptVersion,
    },
    summary: {
      ...(baseExecutionContext.summary || {}),
      promptId,
      promptVersion,
    },
  };
  const configuredScriptStrategy =
    executionContext.strategy?.id ||
    runtimeSettings.strategy?.scriptStrategy ||
    getDefaultSettings().strategy.scriptStrategy;
  const scriptStrategy = modelRuntime.resolvedModel?.isResolved
    ? modelRuntime.resolvedModel.resolvedProvider === 'api'
      ? 'api-model'
      : modelRuntime.resolvedModel.resolvedProvider === 'local'
        ? 'local-model'
        : configuredScriptStrategy
    : configuredScriptStrategy;
  const scriptExecutionStrategy =
    scriptStrategy === 'api-model'
      ? 'masked-api'
      : scriptStrategy === 'local-model'
        ? 'raw-local'
        : 'template-only';

  const templates = listTemplates({ appId });
  const faqs = buildFaqsFromNotes(listNotes());
  const rules = buildScriptRulesFromKnowledge(
    matchRules({
      appId,
      domainType: executionContext.rulesScope?.[0] || executionContext.productScope?.[0] || '',
      workflowStage: 'script',
      keyword: `${goalScene} ${toneStyle} ${focusPoints}`,
    }),
  );
  const modulePolicy = getModulePolicy('generateScript');

  const { scene, sceneTemplates, formalTemplate, conciseTemplate, spokenTemplate } =
    resolveSceneTemplates({
      templates,
      goalScene,
    });

  let cautionNotes = collectCautionNotes({
    faqs,
    focusPoints,
  });
  const assistantPerspective = resolveAssistantPerspective({
    assistantId: activeAssistantId,
    assistantProfile: resolveAssistantProfile(activeAssistantId),
    industryType,
    text: [
      audience,
      taskPhase,
      goal,
      effectiveTaskSubject,
      focusPoints,
      taskInput,
      effectiveReferenceSummary,
    ].join(' '),
  });
  cautionNotes = buildPerspectiveCautionNotes({
    perspective: assistantPerspective,
    cautionNotes,
  });

  const toneRule = (rules.scriptToneRules || []).find((item) => item.toneStyle === toneStyle) || null;

  let formalVersion = formalTemplate
    ? replaceProductPlaceholder(formalTemplate.template, effectiveTaskSubject)
    : '您好，关于这项工作，我们先整理了一版基础说明供您参考。';

  let conciseVersion = conciseTemplate
    ? replaceProductPlaceholder(conciseTemplate.template, effectiveTaskSubject)
    : formalVersion;

  let spokenVersion = spokenTemplate
    ? replaceProductPlaceholder(spokenTemplate.template, effectiveTaskSubject)
    : conciseVersion;

  const selectedTemplate =
    toneStyle === 'spoken'
      ? spokenVersion
      : toneStyle === 'concise'
        ? conciseVersion
        : formalVersion;
  const selectedTemplateRecord =
    toneStyle === 'spoken'
      ? spokenTemplate
      : toneStyle === 'concise'
        ? conciseTemplate
        : formalTemplate;

  const outputType = inferOutputType({
    goal,
    taskInput,
    referenceSummary: effectiveReferenceSummary,
  });

  const customerSanitizationResult = buildOutboundSanitizationResult({
    moduleName: 'generateScript',
    strategy: scriptExecutionStrategy,
    sourceText: taskInput,
    sourceMeta: {
      taskSubject: effectiveTaskSubject,
      taskPhase,
      audience,
    },
  });

  const referenceSummarySanitizationResult = buildOutboundSanitizationResult({
    moduleName: 'generateScript',
    strategy: scriptExecutionStrategy,
    sourceText: effectiveReferenceSummary,
    sourceMeta: {
      taskSubject: effectiveTaskSubject,
      taskPhase,
      audience,
    },
  });

  const outboundAllowed =
    customerSanitizationResult.outboundAllowed && referenceSummarySanitizationResult.outboundAllowed;
  const outboundReason = !customerSanitizationResult.outboundAllowed
    ? customerSanitizationResult.outboundReason
    : referenceSummarySanitizationResult.outboundReason;

  const templateResult = buildTemplateScriptResult({
    formalVersion,
    conciseVersion,
    spokenVersion,
    cautionNotes,
  });

  let llmResult = null;
  let ruleOnlyModelRuntime = null;
  let generationRoute = '';
  const normalizedOutputStyle = normalizeText(outputStyle).toLowerCase();
  const ruleOnlyStartedAt = Date.now();
  const ruleOnlyContextData = buildRuleOnlyTemplateContext({
    normalizedInput,
    variables,
    effectiveTaskSubject,
    effectiveReferenceSummary,
    cautionNotes,
  });
  const canRenderRuleOnly =
    normalizedOutputStyle === 'standard' &&
    selectedTemplate &&
    allVariablesAvailable(selectedTemplate, ruleOnlyContextData);

  if (canRenderRuleOnly) {
    const renderedReport = renderTemplate(selectedTemplate, ruleOnlyContextData);
    const guidanceText = cautionNotes.map(stringifyTemplateValue).filter(Boolean).join('\n');
    const finalReport = guidanceText
      ? `${renderedReport}\n\n注意事项：\n${guidanceText}`
      : renderedReport;

    generationRoute = 'rule_only';
    ruleOnlyModelRuntime = buildRuleOnlyModelRuntime(Date.now() - ruleOnlyStartedAt);
    llmResult = {
      route: 'rule_only',
      rewrittenScript: finalReport,
      result: {
        formalVersion: finalReport,
        conciseVersion: finalReport,
        spokenVersion: finalReport,
        llmVersion: finalReport,
        llmRoute: 'rule_only',
        generationRoute,
        templateRender: {
          rendered: true,
          missingVariables: [],
          outputStyle: normalizedOutputStyle,
        },
      },
    };
  } else {
    generationRoute = normalizedOutputStyle === 'standard'
      ? 'llm_fallback_missing_variables'
      : 'llm_enhanced';
    llmResult = await generateScriptWithLLM({
      moduleName: 'script',
      useLocalLLM: scriptExecutionStrategy === 'raw-local',
      useApiLLM: scriptExecutionStrategy === 'masked-api',
      selectedTemplate,
      cautionNotes,
      toneRule,
      audience,
      taskPhase,
      goal,
      goalScene,
      taskSubject: effectiveTaskSubject,
      focusPoints,
      taskInput,
      referenceSummary: effectiveReferenceSummary,
      assistantId: activeAssistantId,
      promptId,
      promptVersion,
      promptContent: scriptPrompt?.content || '',
      sessionId,
      sanitizedCustomerText: customerSanitizationResult.sanitizedText,
      sanitizedReferenceSummary: referenceSummarySanitizationResult.sanitizedText,
      outboundAllowed,
      outboundReason,
      modelConfig: scriptModelConfig,
      appId,
    });
  }

  const effectiveModelRuntime = ruleOnlyModelRuntime || modelRuntime;

  const finalResult = {
    ...templateResult,
    ...(llmResult?.result || {}),
    llmVersion: llmResult?.rewrittenScript || templateResult.llmVersion,
    llmRoute: llmResult?.route || templateResult.llmRoute,
    generationRoute,
    scriptStrategy,
    scriptExecutionStrategy,
    outboundAllowed,
    outboundReason,
    sanitizedTaskInput: customerSanitizationResult.sanitizedText,
    sanitizedCustomerText: customerSanitizationResult.sanitizedText,
    sanitizedReferenceSummary: referenceSummarySanitizationResult.sanitizedText,
    cautionNotes,
    assistantId: activeAssistantId,
    resolvedAssistant: executionContext.resolvedAssistant,
    resolvedPrompt: executionContext.resolvedPrompt,
    strategy: executionContext.strategy,
    source: executionContext.source,
    fallbackReason: executionContext.fallbackReason,
    executionContextSummary: executionContext.summary,
    outputType,
    referencePackId: referencePackInput?.referencePackId || referencePackId || '',
    referencePack: referencePackInput,
    facts: referencePackInput?.facts || [],
    background: referencePackInput?.background || [],
    riskNotes: referencePackInput?.riskNotes || [],
    conflicts: referencePackInput?.conflicts || [],
    doNotUse: referencePackInput?.doNotUse || [],
    evidenceId: resolvedEvidence?.evidenceId || evidenceId || '',
    resolvedEvidence,
    sourceDocId: effectiveSourceDocId,
    sourceDocName: effectiveSourceDocName,
    sourceDocType: effectiveSourceDocType,
    sourceApplicableScene: effectiveSourceApplicableScene,
    sourceExternalAvailable: effectiveSourceExternalAvailable,
    modelRuntime: effectiveModelRuntime,
    resolvedModel: effectiveModelRuntime.resolvedModel,
    modelSource: effectiveModelRuntime.resolvedModel?.source || effectiveModelRuntime.reason || '',
    executionContext,
    promptId,
    promptVersion,
    promptName: scriptPrompt?.name || '',
    selectedTemplateId: selectedTemplateRecord?.id || '',
  };

  const session = getOrCreateSession({
    sessionId,
    title:
      effectiveTaskSubject
        ? `compose｜${effectiveTaskSubject}`
        : taskInput
          ? `compose｜${taskInput}`
          : undefined,
    taskInput,
    context,
    goal,
    deliverable,
    variables,
    attachments,
    audience: audience || '通用工作会话',
    industryType,
    sourceModule: 'script',
    currentStage: taskPhase,
    currentGoal: goal || 'compose_document',
    taskSubject: effectiveTaskSubject,
    assistantId: activeAssistantId,
    executionContext,
  });

  const scriptStep = appendSessionStep({
    sessionId: session.id,
    stepType: 'script',
    inputPayload: {
      sessionId,
      fromModule,
      evidenceId: resolvedEvidence?.evidenceId || evidenceId || '',
      assistantId: activeAssistantId,
      promptId,
      promptVersion,
      strategy: executionContext.strategy,
      source: executionContext.source,
      fallbackReason: executionContext.fallbackReason,
      resolvedAssistant: executionContext.resolvedAssistant,
      resolvedPrompt: executionContext.resolvedPrompt,
      executionContextSummary: executionContext.summary,
      executionContext,
      resolvedModel: effectiveModelRuntime.resolvedModel,
      audience,
      taskPhase,
      goalScene,
      focusPoints,
      referenceSummary: effectiveReferenceSummary,
      referencePackId: referencePackInput?.referencePackId || referencePackId || '',
      referencePackInput,
      taskInput: taskModel.taskInput,
      context: taskModel.context,
      goal: taskModel.goal,
      deliverable: taskModel.deliverable,
      variables: taskModel.variables,
      attachments: taskModel.attachments,
      sourceDocId: effectiveSourceDocId,
      sourceDocName: effectiveSourceDocName,
      sourceDocType: effectiveSourceDocType,
      sourceApplicableScene: effectiveSourceApplicableScene,
      sourceExternalAvailable: effectiveSourceExternalAvailable,
      toneStyle,
      referencePackId: referencePackInput?.referencePackId || referencePackId || '',
    },
    outputPayload: finalResult,
    summary: finalResult.llmVersion || finalResult.formalVersion || '',
    route: finalResult.llmRoute || '',
    strategy: scriptStrategy,
    executionStrategy: scriptExecutionStrategy,
    outboundAllowed,
    outboundReason,
    modelName:
      effectiveModelRuntime.resolvedModel?.resolvedModelName ||
      effectiveModelRuntime.resolvedModel?.modelName ||
      scriptModelConfig.modelName ||
      '',
  });

  if (effectiveSourceDocName) {
    attachSessionAsset({
      sessionId: session.id,
      sourceModule: fromModule || 'search',
      docId: effectiveSourceDocId,
      docName: effectiveSourceDocName,
      docType: effectiveSourceDocType,
      applicableScene: effectiveSourceApplicableScene,
      externalAvailable: effectiveSourceExternalAvailable,
    });
  }

  updateSession(session.id, {
    sourceModule: 'script',
    currentStage: taskPhase,
    currentGoal: goal || 'compose_document',
    assistantId: activeAssistantId,
    executionContextSummary: executionContext.summary,
    source: executionContext.source,
    fallbackReason: executionContext.fallbackReason,
    title:
      effectiveTaskSubject
        ? `compose｜${effectiveTaskSubject}`
        : taskInput
          ? `compose｜${taskInput}`
          : session.title,
  });

  return {
    rawInput,
    sessionId: session.id,
    stepId: scriptStep.id,
    modulePolicy,
    scriptModelConfig,
    modelRuntime: effectiveModelRuntime,
    scriptStrategy,
    scriptExecutionStrategy,
    selectedTemplate,
    selectedTemplateId: selectedTemplateRecord?.id || '',
    referencePackId: referencePackInput?.referencePackId || referencePackId || '',
    referencePackInput,
    scene,
    sceneTemplates,
    toneRule,
    cautionNotes,
    customerSanitizationResult,
    referenceSummarySanitizationResult,
    outboundAllowed,
    outboundReason,
    strategy: executionContext.strategy,
    source: executionContext.source,
    fallbackReason: executionContext.fallbackReason,
    promptId,
    promptVersion,
    executionContext,
    finalResult,
  };
};
