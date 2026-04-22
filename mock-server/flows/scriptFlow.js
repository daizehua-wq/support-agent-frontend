import { readJsonFile } from '../services/jsonDataService.js';
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
    .filter((item) => focusPoints.includes(item.keyword || ''))
    .map((item) => item.cautionNote)
    .filter(Boolean);
};

const replaceProductPlaceholder = (templateText = '', taskSubject = '') => {
  return String(templateText || '').replaceAll('【任务主题】', taskSubject || '相关事项');
};

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
    context = '',
    deliverable = '',
    variables = {},
    attachments = [],
  } = normalizedInput;
  const resolvedEvidence = getSessionEvidenceById(sessionId, evidenceId);
  const resolvedEvidenceContext = buildResolvedEvidenceContext(resolvedEvidence);
  const effectiveSourceDocId = resolvedEvidenceContext?.sourceDocId || sourceDocId;
  const effectiveSourceDocName = resolvedEvidenceContext?.sourceDocName || sourceDocName;
  const effectiveSourceDocType = resolvedEvidenceContext?.sourceDocType || sourceDocType;
  const effectiveSourceApplicableScene =
    resolvedEvidenceContext?.sourceApplicableScene || sourceApplicableScene;
  const effectiveSourceExternalAvailable =
    resolvedEvidenceContext?.sourceExternalAvailable ?? sourceExternalAvailable;
  const effectiveTaskSubject =
    taskSubject || resolvedEvidenceContext?.taskSubject || '';
  const effectiveReferenceSummary =
    resolvedEvidenceContext?.referenceSummary || referenceSummary || '';

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
      }
    : baseScriptModelConfig;

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

  const templates = readJsonFile('script_templates.json', []);
  const faqs = readJsonFile('faqs.json', []);
  const rules = readJsonFile('rules.json', { scriptToneRules: [] });
  const modulePolicy = getModulePolicy('generateScript');

  const { scene, sceneTemplates, formalTemplate, conciseTemplate, spokenTemplate } =
    resolveSceneTemplates({
      templates,
      goalScene,
    });

  const cautionNotes = collectCautionNotes({
    faqs,
    focusPoints,
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

  if (toneStyle === 'concise') {
    formalVersion = conciseVersion;
  }

  if (toneStyle === 'spoken') {
    formalVersion = spokenVersion;
  }

  const selectedTemplate =
    toneStyle === 'spoken'
      ? spokenVersion
      : toneStyle === 'concise'
        ? conciseVersion
        : formalVersion;

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

  const llmResult = await generateScriptWithLLM({
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
    sanitizedCustomerText: customerSanitizationResult.sanitizedText,
    sanitizedReferenceSummary: referenceSummarySanitizationResult.sanitizedText,
    outboundAllowed,
    outboundReason,
    modelConfig: scriptModelConfig,
  });

  const finalResult = {
    ...templateResult,
    ...(llmResult?.result || {}),
    llmVersion: llmResult?.rewrittenScript || templateResult.llmVersion,
    llmRoute: llmResult?.route || templateResult.llmRoute,
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
    evidenceId: resolvedEvidence?.evidenceId || evidenceId || '',
    resolvedEvidence,
    sourceDocId: effectiveSourceDocId,
    sourceDocName: effectiveSourceDocName,
    sourceDocType: effectiveSourceDocType,
    sourceApplicableScene: effectiveSourceApplicableScene,
    sourceExternalAvailable: effectiveSourceExternalAvailable,
    modelRuntime,
    resolvedModel: modelRuntime.resolvedModel,
    modelSource: modelRuntime.resolvedModel?.source || modelRuntime.reason || '',
    executionContext,
    promptId,
    promptVersion,
    promptName: scriptPrompt?.name || '',
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
      resolvedModel: modelRuntime.resolvedModel,
      audience,
      taskPhase,
      goalScene,
      focusPoints,
      referenceSummary: effectiveReferenceSummary,
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
    },
    outputPayload: finalResult,
    summary: finalResult.llmVersion || finalResult.formalVersion || '',
    route: finalResult.llmRoute || '',
    strategy: scriptStrategy,
    executionStrategy: scriptExecutionStrategy,
    outboundAllowed,
    outboundReason,
    modelName: scriptModelConfig.modelName || '',
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
    modelRuntime,
    scriptStrategy,
    scriptExecutionStrategy,
    selectedTemplate,
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
