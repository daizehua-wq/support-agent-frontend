import {
  readSettings,
  getModelConfigForModule,
  getDefaultSettings,
  getResolvedExecutionContextForModule,
} from '../services/settingsService.js';
import { getModulePolicy } from '../config/policyConfig.js';
import { resolveModelRuntimeForModule } from '../services/modelRouter.js';
import {
  sanitizeAnalyzePayload,
  judgeOutboundAllowed,
  validatePlaceholderIntegrity,
  restoreFromMapping,
} from '../services/sanitizationService.js';
import { enhanceAnalyzeWithLLM } from '../services/analyzeLLMService.js';
import {
  getOrCreateSession,
  appendSessionStep,
  attachSessionAsset,
  updateSession,
} from '../services/sessionService.js';
import { getPromptForModule } from '../services/promptService.js';
import {
  getAssistantExecutionContext,
} from '../services/assistantContextService.js';
import { normalizeCapabilityRequest } from '../services/taskModelService.js';
import { runAnalyzeRuleEngine } from '../plugins/rule-engine/index.js';


const buildBaseAnalyzeResult = ({ matchedRule, matchedProducts }) => {
  return {
    summary: matchedRule?.summaryTemplate || '暂未命中明确规则，建议继续确认客户核心关注点。',
    sceneJudgement: matchedRule?.sceneJudgement || '当前场景仍需进一步确认。',
    recommendedProducts: matchedProducts.map((item) => item.productName),
    followupQuestions: matchedRule?.followupQuestions || [],
    riskNotes: matchedRule?.riskNotes || [],
    nextActions: matchedRule?.nextActions || [],
  };
};

const inferNextStepType = ({
  matchedRule,
  matchedProducts,
  relatedDocumentNames,
  finalAnalyzeData,
  taskPhase,
}) => {
  if (!matchedRule && matchedProducts.length === 0) {
    return 'confirm_info';
  }

  if (matchedRule?.sceneType === 'sample_test' || taskPhase === 'test' || taskPhase === 'sample') {
    return 'go_script';
  }

  if (relatedDocumentNames.length > 0 || matchedProducts.length > 0) {
    return 'go_script';
  }

  if ((finalAnalyzeData?.followupQuestions || []).length > 0) {
    return 'confirm_info';
  }

  return 'go_search';
};

const buildSceneAdjustedAnalyzeResult = ({
  matchedRule,
  matchedProduct,
  relatedDocumentNames,
  taskSubject,
  taskPhase,
  text,
  baseResult,
  executionContext,
  activeAssistantId,
}) => {
  const rulesScope = executionContext?.rulesScope || [];
  const isSemiconductorAssistant =
    activeAssistantId === 'semiconductor-sales-support' || rulesScope.includes('semiconductor');
  const isPcbAssistant =
    activeAssistantId === 'pcb-sales-support' || rulesScope.includes('pcb');

  const defaultPcbResponse = {
    ...baseResult,
    summary:
      baseResult.summary && baseResult.summary !== '暂未命中明确规则，建议继续确认客户核心关注点。'
        ? baseResult.summary
        : '当前需求可先按 PCB 湿制程评估沟通场景理解，仍需进一步确认现用体系、工艺条件和替换目标。',
    sceneJudgement:
      baseResult.sceneJudgement && baseResult.sceneJudgement !== '当前场景仍需进一步确认。'
        ? baseResult.sceneJudgement
        : '当前场景仍需进一步确认，建议按 PCB 工艺沟通方式继续澄清。',
    recommendedProducts:
      baseResult.recommendedProducts.length > 0
        ? baseResult.recommendedProducts
        : ['PCB 工艺基础资料包', '需求澄清问题清单'],
    followupQuestions:
      baseResult.followupQuestions.length > 0
        ? baseResult.followupQuestions
        : [
            '当前使用的体系和工艺条件是什么？',
            '客户更关注成本、稳定性、线宽控制还是测试安排？',
            '是否已有现用方案或替换路径需要评估？',
          ],
    riskNotes:
      baseResult.riskNotes.length > 0
        ? baseResult.riskNotes
        : ['在未明确现用体系、工艺边界和测试方式前，不建议直接承诺成本或性能改善。'],
    nextActions:
      baseResult.nextActions.length > 0
        ? baseResult.nextActions
        : ['先确认现用体系', '发送 PCB 基础资料', '再判断是否进入样品或对比测试'],
  };

  const defaultSemiconductorResponse = {
    ...baseResult,
    summary:
      baseResult.summary && baseResult.summary !== '暂未命中明确规则，建议继续确认客户核心关注点。'
        ? baseResult.summary
        : '当前需求可先按半导体湿制程评估沟通场景理解，仍需进一步确认具体工序、材料体系和导入边界。',
    sceneJudgement:
      baseResult.sceneJudgement && baseResult.sceneJudgement !== '当前场景仍需进一步确认。'
        ? baseResult.sceneJudgement
        : '当前场景仍需进一步确认，建议按半导体湿制程工艺沟通方式继续澄清。',
    recommendedProducts:
      baseResult.recommendedProducts.length > 0
        ? baseResult.recommendedProducts
        : ['半导体湿制程基础资料包', '需求澄清问题清单'],
    followupQuestions:
      baseResult.followupQuestions.length > 0
        ? baseResult.followupQuestions
        : [
            '当前对应的具体工序和处理对象是什么？',
            '客户更关注洁净度、兼容性、残留还是验证配合？',
            '是否已有材料体系或导入边界需要先确认？',
          ],
    riskNotes:
      baseResult.riskNotes.length > 0
        ? baseResult.riskNotes
        : ['在未明确工序条件、洁净度要求和材料兼容性前，不建议直接承诺导入效果。'],
    nextActions:
      baseResult.nextActions.length > 0
        ? baseResult.nextActions
        : ['先确认工序与材料体系', '发送半导体基础资料', '再判断是否进入技术验证沟通'],
  };

  let responseData = isSemiconductorAssistant
    ? defaultSemiconductorResponse
    : isPcbAssistant
      ? defaultPcbResponse
      : {
          ...baseResult,
          recommendedProducts:
            baseResult.recommendedProducts.length > 0
              ? baseResult.recommendedProducts
              : ['基础资料包', '需求澄清问题清单'],
          followupQuestions:
            baseResult.followupQuestions.length > 0
              ? baseResult.followupQuestions
              : [
                  '客户当前想了解的是哪一类产品或方案？',
                  '当前应用工序和处理对象是什么？',
                  '客户更关注产品本身、工艺适配还是测试安排？',
                ],
          riskNotes:
            baseResult.riskNotes.length > 0
              ? baseResult.riskNotes
              : ['当前信息不足，暂不适合给出过于具体的产品判断或性能承诺。'],
          nextActions:
            baseResult.nextActions.length > 0
              ? baseResult.nextActions
              : ['先补充基础信息', '发送基础资料', '再判断是否进入技术沟通'],
        };

  if (matchedRule?.sceneType === 'h2o2') {
    if (isSemiconductorAssistant) {
      responseData = {
        summary:
          matchedProduct?.summary ||
          '客户当前在评估半导体湿电子化学品方案，核心关注点通常是纯度、兼容性、残留控制和导入验证安排。',
        sceneJudgement: '该需求可初步判断为半导体湿制程相关场景，当前仍需进一步确认具体工序和应用目标。',
        recommendedProducts:
          matchedProduct
            ? [matchedProduct.productName, ...relatedDocumentNames]
            : ['电子级化学品基础资料', '兼容性说明资料'],
        followupQuestions: [
          '当前对应的具体工序是什么？',
          '客户更关注纯度、残留、兼容性还是验证安排？',
          '是否已有现用方案或导入窗口可供对比？',
        ],
        riskNotes: ['在未明确具体工序与验证条件前，不建议直接给出明确性能承诺。'],
        nextActions: ['先确认工序与材料体系', '发送基础资料', '再判断是否进入样品或验证沟通'],
      };
    } else {
      responseData = {
        summary:
          matchedProduct?.summary ||
          '客户当前在评估双氧水体系蚀刻液，核心关注点是稳定性、线宽均匀性和整体成本控制。',
        sceneJudgement: '该需求可初步判断为 PCB 蚀刻相关场景，当前处于需求沟通阶段。',
        recommendedProducts:
          matchedProduct
            ? [matchedProduct.productName, ...relatedDocumentNames]
            : ['双氧水体系蚀刻液', '稳定性优化方案资料'],
        followupQuestions: [
          '当前使用的蚀刻体系是什么？',
          '客户更关注成本、稳定性还是线宽控制？',
          '是否有明确的样品测试计划？',
        ],
        riskNotes: ['目前信息仍偏初步，暂不适合承诺具体性能改善结果。'],
        nextActions: ['先发送基础资料', '确认测试需求', '判断是否进入样品沟通'],
      };
    }
  } else if (matchedRule?.sceneType === 'cleaning' || text.includes('清洗') || text.includes('清洗液')) {
    responseData = isSemiconductorAssistant
      ? {
          summary: '客户当前更关注半导体清洗或湿制程化学品方案，重点通常在残留控制、兼容性和导入验证条件。',
          sceneJudgement: '该需求可初步判断为半导体湿制程相关清洗场景。',
          recommendedProducts:
            matchedProduct
              ? [matchedProduct.productName, ...relatedDocumentNames]
              : ['电子级清洗液', '兼容性说明资料'],
          followupQuestions: [
            '当前处理对象和具体工序是什么？',
            '更关注颗粒、金属离子、有机残留还是表面状态？',
            '是否已有现用方案或验证窗口？',
          ],
          riskNotes: ['在未明确材料体系和验证条件前，不建议直接承诺清洗效果。'],
          nextActions: ['先确认工序与目标', '发送基础资料', '再判断是否进入测试沟通'],
        }
      : {
          summary: '客户当前更关注清洗液方案，重点在残留控制、兼容性和清洗后表面状态。',
          sceneJudgement: '该需求可初步判断为湿制程清洗相关场景。',
          recommendedProducts:
            matchedProduct
              ? [matchedProduct.productName, ...relatedDocumentNames]
              : ['电子级清洗液', '清洗兼容性说明资料'],
          followupQuestions: [
            '客户目前清洗的对象是什么材料或工序？',
            '更关注颗粒、金属离子还是有机残留？',
            '是否已有现用清洗方案作为对比？',
          ],
          riskNotes: ['需避免在不了解工艺条件前直接承诺清洗效果。'],
          nextActions: ['先确认应用工序', '发送清洗液资料', '再判断是否进入测试沟通'],
        };
  } else if (
    isSemiconductorAssistant &&
    matchedProduct &&
    (matchedProduct.category === 'semiconductor_etch_support' || text.includes('蚀刻') || text.includes('刻蚀'))
  ) {
    responseData = {
      summary:
        matchedProduct?.summary ||
        '客户当前需求更接近半导体蚀刻相关工艺沟通场景，重点应放在工艺适配、材料兼容性和验证路径确认。',
      sceneJudgement: '该需求可初步判断为半导体蚀刻相关工艺沟通场景。',
      recommendedProducts:
        matchedProduct
          ? [matchedProduct.productName, ...relatedDocumentNames]
          : ['半导体蚀刻相关工艺资料包', '半导体湿制程化学品基础资料'],
      followupQuestions: [
        '当前对应的具体工艺段和处理对象是什么？',
        '客户更关注工艺适配、材料兼容性还是验证安排？',
        '是否已有现用方案或目标验证窗口可供对比？',
      ],
      riskNotes: ['在未明确工艺条件、材料体系和验证标准前，不建议直接承诺工艺结果。'],
      nextActions: ['先确认工艺段与目标', '发送半导体蚀刻相关资料', '再判断是否进入验证推进'],
    };
  } else if (matchedRule?.sceneType === 'sample_test') {
    responseData = isSemiconductorAssistant
      ? {
          summary: '客户当前已进入验证推进阶段，重点在验证条件、评价标准和导入窗口确认。',
          sceneJudgement: '该需求可初步判断为半导体验证推进场景。',
          recommendedProducts:
            matchedProduct
              ? [matchedProduct.productName, ...relatedDocumentNames]
              : [taskSubject || '待确认化学品方案', '半导体验证说明资料'],
          followupQuestions: [
            '客户计划在哪个工序节点安排验证？',
            '本次验证最关注洁净度、兼容性还是残留表现？',
            '验证窗口、材料体系和评价方式是否已明确？',
          ],
          riskNotes: ['验证阶段需先统一评价标准，避免双方对导入结论理解不一致。'],
          nextActions: ['确认验证窗口', '确认材料体系', '明确评价指标'],
        }
      : {
          summary: '客户当前已经进入样品测试推进阶段，重点在测试安排、评价指标和样品规格确认。',
          sceneJudgement: '该需求可初步判断为 PCB 样品测试推进场景。',
          recommendedProducts:
            matchedProduct
              ? [matchedProduct.productName, ...relatedDocumentNames]
              : [taskSubject || '待确认产品方案', '样品测试说明资料'],
          followupQuestions: [
            '客户预计何时安排测试？',
            '本次测试最关注哪些指标？',
            '样品规格、数量和寄送时间是否已明确？',
          ],
          riskNotes: ['样品测试阶段需先确认评价标准，避免双方对测试结果理解不一致。'],
          nextActions: ['确认样品规格', '确认寄样时间', '明确测试指标'],
        };
  } else if (matchedRule?.sceneType === 'cost_sensitive') {
    responseData = isSemiconductorAssistant
      ? {
          summary: '客户当前更关注半导体湿制程方案的综合导入成本，但仍需先确认工序条件、验证要求和替换边界。',
          sceneJudgement: '该需求可初步判断为半导体方案导入成本澄清场景。',
          recommendedProducts: taskSubject
            ? [taskSubject, '导入评估清单']
            : ['导入评估清单', '需求澄清问题清单'],
          followupQuestions: [
            '当前对应的工序、材料体系和验证要求是什么？',
            '客户更关注材料成本、导入成本还是验证成本？',
            '是否已有现用方案可作为导入对比基线？',
          ],
          riskNotes: ['涉及导入成本表达时，需避免在未明确验证边界前直接承诺总体节省空间。'],
          nextActions: ['先确认工序条件', '梳理导入成本构成', '判断是否适合进入技术评估'],
        }
      : {
          summary: '客户当前更关注整体成本优化空间，但信息仍不足，需要先确认现用体系、成本构成和优化目标。',
          sceneJudgement: '该需求可初步判断为 PCB 成本优化澄清场景。',
          recommendedProducts: taskSubject
            ? [taskSubject, '成本对比评估清单']
            : ['成本对比评估清单', '需求澄清问题清单'],
          followupQuestions: [
            '客户当前使用的体系和工艺是什么？',
            '客户希望优化的是采购成本、使用成本还是综合成本？',
            '是否已有现用方案可作为对比基线？',
          ],
          riskNotes: ['涉及成本表达时，建议避免直接承诺节省幅度。'],
          nextActions: ['先确认现用体系', '梳理成本构成', '判断是否适合进入对比评估'],
        };
  } else if (text.includes('样品') || text.includes('测试')) {
    responseData = {
      summary: '客户当前已经进入样品测试推进阶段，重点在测试安排、评价指标和样品规格确认。',
      sceneJudgement: '该需求可初步判断为样品测试或验证推进场景。',
      recommendedProducts:
        matchedProduct
          ? [matchedProduct.productName, ...relatedDocumentNames]
          : [taskSubject || '待确认产品方案', '样品测试说明资料'],
      followupQuestions: [
        '客户预计何时安排测试？',
        '本次测试最关注哪些指标？',
        '样品规格、数量和寄送时间是否已明确？',
      ],
      riskNotes: ['样品测试阶段需先确认评价标准，避免双方对测试结果理解不一致。'],
      nextActions: ['确认样品规格', '确认寄样时间', '明确测试指标'],
    };
  }

  if (isSemiconductorAssistant && isPcbAssistant === false && responseData.sceneJudgement?.includes('PCB')) {
    responseData.sceneJudgement = '该需求当前更适合按中性方式理解，建议先确认具体工序、材料体系和导入目标。';
    responseData.summary = matchedProduct?.summary || '当前已识别到客户存在工艺或化学品评估需求，但仍需进一步确认具体工序后再给出更明确判断。';
    responseData.recommendedProducts =
      matchedProduct && matchedProduct.productName
        ? [matchedProduct.productName, ...relatedDocumentNames]
        : ['基础资料包', '需求澄清问题清单'];
  }

  if (text.includes('成本')) {
    responseData.riskNotes = [
      ...responseData.riskNotes,
      '涉及成本优化时，建议结合客户现用体系做对比。',
    ];
  }

  if (taskPhase === 'initial_contact') {
    responseData.nextActions = [
      '先发送基础介绍资料',
      '了解客户当前工艺',
      '判断是否需要进一步技术沟通',
    ];
  }

  return responseData;
};

export const runAnalyzeCustomerFlow = async (rawInput = {}, options = {}) => {
  const normalizedRequest = normalizeCapabilityRequest(rawInput, 'judge');
  const taskModel = normalizedRequest.taskModel;
  const normalizedInput = normalizedRequest.payload;
  const {
    sessionId = '',
    fromModule = 'manual',
    taskObject = '',
    audience = '',
    industryType = 'other',
    taskInput = '',
    taskSubject = '',
    taskPhase = 'other',
    context = '',
    goal = '',
    deliverable = '',
    variables = {},
    attachments = [],
  } = normalizedInput;
  const runtimeSettings = options.settings || readSettings() || getDefaultSettings();
  const baseAnalyzeModelConfig = getModelConfigForModule('analyze');
  const modelRuntime = resolveModelRuntimeForModule({
    moduleName: 'analyze',
    modelSettings: runtimeSettings.model || {},
  });
  const analyzeModelConfig = modelRuntime.resolvedModel?.isResolved
    ? {
        ...baseAnalyzeModelConfig,
        modelProvider:
          modelRuntime.resolvedModel.resolvedProvider || baseAnalyzeModelConfig.modelProvider,
        baseUrl: modelRuntime.resolvedModel.resolvedBaseUrl || baseAnalyzeModelConfig.baseUrl,
        modelName: modelRuntime.resolvedModel.resolvedModelName || baseAnalyzeModelConfig.modelName,
      }
    : baseAnalyzeModelConfig;
  const assistantContext = getAssistantExecutionContext(runtimeSettings);
  const initialAssistantId =
    assistantContext.assistantId || runtimeSettings.assistant?.activeAssistantId || '';
  const initialAnalyzePrompt = getPromptForModule(initialAssistantId, 'analyze');
  const initialResolvedExecutionContext = getResolvedExecutionContextForModule(
    'analyze',
    assistantContext.executionContext || {},
    {
      modulePrompt: {
        promptId: initialAnalyzePrompt?.id || '',
        promptVersion: initialAnalyzePrompt?.version || '',
      },
    },
  );
  const activeAssistantId =
    initialResolvedExecutionContext.resolvedAssistant?.assistantId || initialAssistantId || '';
  const analyzePrompt = getPromptForModule(activeAssistantId, 'analyze');
  const baseExecutionContext = getResolvedExecutionContextForModule(
    'analyze',
    assistantContext.executionContext || {},
    {
      modulePrompt: {
        promptId: analyzePrompt?.id || '',
        promptVersion: analyzePrompt?.version || '',
      },
    },
  );
  const promptId = baseExecutionContext.resolvedPrompt?.promptId || analyzePrompt?.id || '';
  const promptVersion = baseExecutionContext.resolvedPrompt?.promptVersion || analyzePrompt?.version || '';
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
            ? 'module.analyze.prompt'
            : baseExecutionContext.source?.prompt || 'none',
      promptVersion:
        baseExecutionContext.source?.promptVersion && baseExecutionContext.source?.promptVersion !== 'none'
          ? baseExecutionContext.source.promptVersion
          : promptVersion
            ? 'module.analyze.promptVersion'
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
  const analyzeStrategy =
    executionContext.strategy?.id ||
    runtimeSettings.strategy?.analyzeStrategy ||
    getDefaultSettings().strategy.analyzeStrategy;
  const analyzeExecutionStrategy = analyzeStrategy === 'api-enhanced' ? 'masked-api' : 'rules-only';

  const sanitizedAnalyzeInput = sanitizeAnalyzePayload(rawInput);
  const analyzeOutboundDecision = judgeOutboundAllowed({
    moduleName: 'analyzeCustomer',
    strategy: analyzeExecutionStrategy,
    sanitizedText: sanitizedAnalyzeInput.sanitizedText,
    detectedSensitiveTypes: sanitizedAnalyzeInput.detectedSensitiveTypes || [],
  });

  const modulePolicy = getModulePolicy('analyzeCustomer');

  const text = `${taskInput} ${taskSubject}`;
  const ruleEngineResult = await runAnalyzeRuleEngine({
    capability: 'analyze-context',
    rawInput,
    normalizedInput,
    executionContext,
    taskInput,
    taskSubject,
    taskPhase,
    industryType,
    text,
  });
  const matchedRules = Array.isArray(ruleEngineResult.matchedRules)
    ? ruleEngineResult.matchedRules
    : [];
  const matchedRule = ruleEngineResult.matchedRule || null;
  const matchedProducts = Array.isArray(ruleEngineResult.matchedProducts)
    ? ruleEngineResult.matchedProducts
    : [];
  const matchedProduct = ruleEngineResult.matchedProduct || null;
  const relatedDocumentNames = Array.isArray(ruleEngineResult.relatedDocumentNames)
    ? ruleEngineResult.relatedDocumentNames
    : [];
  console.log('[analyzeFlow] matchedRules:', matchedRules.map((item) => item.name));
  console.log('[analyzeFlow] matchedRule:', matchedRule);
  console.log('[analyzeFlow] matchedProducts:', matchedProducts.map((item) => item.productName));
  console.log('[analyzeFlow] matchedProduct:', matchedProduct?.productName || null);
  console.log('[analyzeFlow] relatedDocumentNames:', relatedDocumentNames);

  const baseResult = {
    ...buildBaseAnalyzeResult({ matchedRule, matchedProducts }),
    ...(ruleEngineResult.analysis || {}),
  };
  const sceneAdjustedResult = buildSceneAdjustedAnalyzeResult({
    matchedRule,
    matchedProduct,
    relatedDocumentNames,
    taskSubject,
    taskPhase,
    text,
    baseResult,
    executionContext,
    activeAssistantId,
  });

  let finalAnalyzeData = sceneAdjustedResult;
  let analysisRoute = 'rules-only';

  if (analyzeExecutionStrategy === 'masked-api' && analyzeOutboundDecision.outboundAllowed) {
    const enhanceResult = await enhanceAnalyzeWithLLM({
      rawInput,
      sanitizedAnalyzeInput,
      analyzeModelConfig,
      baseResult: sceneAdjustedResult,
      analyzeExecutionStrategy,
      salesStage: taskPhase,
      assistantId: activeAssistantId,
      promptId,
      promptVersion,
      promptContent: analyzePrompt?.content || '',
    });

    const integrityCheck = validatePlaceholderIntegrity(
      JSON.stringify(enhanceResult.enhancedResult || {}),
      sanitizedAnalyzeInput.mapping || {},
    );

    if (!integrityCheck.isValid) {
      finalAnalyzeData = sceneAdjustedResult;
      analysisRoute = 'rules-fallback';
    } else {
      finalAnalyzeData = restoreFromMapping(
        enhanceResult.enhancedResult || sceneAdjustedResult,
        sanitizedAnalyzeInput.mapping || {},
      );
      analysisRoute = enhanceResult.route || 'masked-api';
    }
  }

  const nextStepType = inferNextStepType({
    matchedRule,
    matchedProducts,
    relatedDocumentNames,
    finalAnalyzeData,
    taskPhase,
  });

  finalAnalyzeData = {
    ...finalAnalyzeData,
    nextStepType,
  };

  console.log('[analyzeFlow] finalAnalyzeData:', finalAnalyzeData);
  console.log('[analyzeFlow] analysisRoute:', analysisRoute);
  console.log('[analyzeFlow] modelRuntime:', modelRuntime);
  console.log('[analyzeFlow] resolvedExecutionContext.summary:', executionContext.summary);
  console.log('[analyzeFlow] resolvedExecutionContext.source:', executionContext.source);
  console.log('[analyzeFlow] resolvedExecutionContext.fallbackReason:', executionContext.fallbackReason);
 
  const session = getOrCreateSession({
    sessionId,
    title: taskSubject ? `judge｜${taskSubject}` : taskInput ? `judge｜${taskInput}` : undefined,
    taskInput,
    context,
    goal,
    deliverable,
    variables,
    attachments,
    taskObject,
    audience: audience || '通用工作会话',
    industryType,
    sourceModule: 'analyze',
    currentStage: taskPhase,
    currentGoal: goal || 'judge_task',
    taskSubject,
    assistantId: activeAssistantId,
    executionContext,
  });

  const analyzeStep = appendSessionStep({
    sessionId: session.id,
    stepType: 'analyze',
    inputPayload: {
      sessionId,
      fromModule,
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
      taskObject,
      audience,
      industryType,
      taskSubject,
      taskPhase,
      taskInput: taskModel.taskInput,
      context: taskModel.context,
      goal: taskModel.goal,
      deliverable: taskModel.deliverable,
      variables: taskModel.variables,
      attachments: taskModel.attachments,
      remark: context,
    },
    outputPayload: {
      matchedRule,
      matchedProducts,
      matchedProduct,
      relatedDocumentNames,
      strategy: executionContext.strategy,
      source: executionContext.source,
      fallbackReason: executionContext.fallbackReason,
      resolvedAssistant: executionContext.resolvedAssistant,
      resolvedPrompt: executionContext.resolvedPrompt,
      executionContextSummary: executionContext.summary,
      executionContext,
      resolvedModel: modelRuntime.resolvedModel,
      taskModel,
      finalAnalyzeData,
    },
    summary: finalAnalyzeData.summary || '',
    route: analysisRoute,
    strategy: analyzeStrategy,
    executionStrategy: analyzeExecutionStrategy,
    outboundAllowed: analyzeOutboundDecision.outboundAllowed,
    outboundReason: analyzeOutboundDecision.outboundReason,
    modelName: analyzeModelConfig.modelName || '',
  });

  relatedDocumentNames.forEach((docName) => {
    attachSessionAsset({
      sessionId: session.id,
      sourceModule: 'analyze',
      docId: '',
      docName,
      docType: '推荐资料',
      applicableScene: finalAnalyzeData.sceneJudgement || '',
      externalAvailable: false,
    });
  });

  updateSession(session.id, {
    sourceModule: 'analyze',
    currentStage: taskPhase,
    currentGoal: goal || 'judge_task',
    assistantId: activeAssistantId,
    title:
      taskSubject
        ? `judge｜${taskSubject}`
        : taskInput
          ? `judge｜${taskInput}`
          : session.title,
  });

  return {
    sessionId: session.id,
    stepId: analyzeStep.id,
    rawInput,
    modulePolicy,
    matchedRule,
    matchedRules,
    matchedProducts,
    matchedProduct,
    relatedDocumentNames,
    ruleEngine: {
      configPath: ruleEngineResult.configPath,
      enabledRules: ruleEngineResult.enabledRules || [],
      executedRules: ruleEngineResult.executedRules || [],
    },
    analyzeModelConfig,
    modelRuntime,
    analyzeStrategy,
    analyzeExecutionStrategy,
    analyzeOutboundDecision,
    sanitizedAnalyzeInput,
    analysisRoute,
    activeAssistantId,
    promptId,
    promptVersion,
    strategy: executionContext.strategy,
    source: executionContext.source,
    fallbackReason: executionContext.fallbackReason,
    assistantContext,
    executionContext,
    analyzePrompt,
    baseResult,
    finalAnalyzeData,
  };
};
