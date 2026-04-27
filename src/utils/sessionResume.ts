import type { ExecutionContext } from '../api/settings';
import type {
  SessionDetailRecord,
  SessionEvidenceRecord,
  SessionStepRecord,
} from '../api/agent';

export type ResumeMode = 'carry' | 'session';

export type ResumeNavigationState = {
  resumeMode?: ResumeMode;
  sessionId?: string;
  fromModule?: string;
  stepId?: string;
  evidenceId?: string;
};

export type ContinueContext = ResumeNavigationState & {
  assistantId?: string;
  executionContext?: ExecutionContext | Record<string, unknown> | null;
  executionContextSummary?: Record<string, unknown> | null;
};

export type ContinueNavigationState = {
  continueContext?: ContinueContext;
  carryPayload?: Record<string, unknown>;
};

export type TaskSeed = {
  taskObject?: string;
  audience?: string;
  industryType?: string;
  taskPhase?: string;
  taskSubject?: string;
  taskInput?: string;
  context?: string;
  goal?: string;
  focusPoints?: string;
  toneStyle?: string;
  docType?: string;
  onlyExternalAvailable?: boolean;
  enableExternalSupplement?: boolean;
  sourceScopes?: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const isResumeMode = (value: unknown): value is ResumeMode => {
  return value === 'carry' || value === 'session';
};

const isMeaningfulValue = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return Boolean(value.trim());
  }

  if (typeof value === 'boolean') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (isRecord(value)) {
    return Object.keys(value).length > 0;
  }

  return value !== undefined && value !== null;
};

export const readString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim() ? value : undefined;
};

const readRecord = (value: unknown): Record<string, unknown> | null => {
  return isRecord(value) ? value : null;
};

const readResumeMode = (value: unknown): ResumeMode | undefined => {
  return isResumeMode(value) ? value : undefined;
};

export const readBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return undefined;
};

export const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
};

const getVariablesRecord = (
  payload?: Record<string, unknown> | null,
): Record<string, unknown> => {
  return isRecord(payload?.variables) ? payload.variables : {};
};

const unwrapCarryPayloadRecord = (value: unknown): Record<string, unknown> | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (isRecord(value.carryPayload)) {
    return value.carryPayload;
  }

  return value;
};

const unwrapContinueRecord = (value: unknown): Record<string, unknown> | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (isRecord(value.continueContext)) {
    return value.continueContext;
  }

  if (isRecord(value.continuePayload)) {
    return value.continuePayload;
  }

  return value;
};

const readNavigationCarryPayload = (value: unknown): Record<string, unknown> | null => {
  if (!isRecord(value) || !isRecord(value.carryPayload)) {
    return null;
  }

  return value.carryPayload;
};

const hasContinueContextValue = (value?: ContinueContext | null): boolean => {
  if (!value) {
    return false;
  }

  return Object.entries(value).some(
    ([key, item]) => key !== 'resumeMode' && isMeaningfulValue(item),
  );
};

const inferResumeMode = ({
  continueContext,
  carryPayload,
}: {
  continueContext?: ContinueContext | null;
  carryPayload?: Record<string, unknown> | null;
}): ResumeMode | undefined => {
  const explicitMode = readResumeMode(continueContext?.resumeMode);

  if (explicitMode === 'session') {
    return continueContext?.sessionId ? 'session' : undefined;
  }

  if (continueContext?.sessionId) {
    return 'session';
  }

  if (explicitMode === 'carry') {
    return 'carry';
  }

  if (isRecord(carryPayload) && Object.keys(carryPayload).length > 0) {
    return 'carry';
  }

  if (hasContinueContextValue(continueContext)) {
    return 'carry';
  }

  return undefined;
};

const readStringByAliases = (
  payload: Record<string, unknown> | null | undefined,
  aliases: string[],
): string | undefined => {
  const variables = getVariablesRecord(payload);

  for (const source of [payload, variables]) {
    if (!source) {
      continue;
    }

    for (const alias of aliases) {
      const value = readString(source[alias]);
      if (value) {
        return value;
      }
    }
  }

  return undefined;
};

const readBooleanByAliases = (
  payload: Record<string, unknown> | null | undefined,
  aliases: string[],
): boolean | undefined => {
  const variables = getVariablesRecord(payload);

  for (const source of [payload, variables]) {
    if (!source) {
      continue;
    }

    for (const alias of aliases) {
      const value = readBoolean(source[alias]);
      if (value !== undefined) {
        return value;
      }
    }
  }

  return undefined;
};

const readStringArrayByAliases = (
  payload: Record<string, unknown> | null | undefined,
  aliases: string[],
): string[] | undefined => {
  const variables = getVariablesRecord(payload);

  for (const source of [payload, variables]) {
    if (!source) {
      continue;
    }

    for (const alias of aliases) {
      const value = source[alias];
      if (Array.isArray(value)) {
        const items = value
          .map((item) => readString(item))
          .filter((item): item is string => Boolean(item));

        if (items.length > 0) {
          return items;
        }
      }
    }
  }

  return undefined;
};

export const buildTaskSeedFromPayload = (value: unknown): TaskSeed => {
  const payload = unwrapCarryPayloadRecord(value);

  if (!payload) {
    return {};
  }

  return {
    taskObject: readStringByAliases(payload, ['taskObject', 'customerName']),
    audience: readStringByAliases(payload, ['audience', 'customerType']),
    industryType: readStringByAliases(payload, ['industryType', 'domainType']),
    taskPhase: readStringByAliases(payload, ['taskPhase', 'salesStage', 'stage', 'currentStage']),
    taskSubject: readStringByAliases(payload, [
      'taskSubject',
      'productDirection',
      'subject',
      'topic',
    ]),
    taskInput: readStringByAliases(payload, ['taskInput', 'customerText', 'keyword', 'taskContent']),
    context: readStringByAliases(payload, [
      'context',
      'referenceSummary',
      'remark',
      'taskContext',
      'contextNote',
    ]),
    goal: readStringByAliases(payload, ['goal', 'communicationGoal', 'currentGoal']),
    focusPoints: readStringByAliases(payload, ['focusPoints', 'concernPoints']),
    toneStyle: readStringByAliases(payload, ['toneStyle']),
    docType: readStringByAliases(payload, ['docType']),
    onlyExternalAvailable: readBooleanByAliases(payload, ['onlyExternalAvailable']),
    enableExternalSupplement: readBooleanByAliases(payload, ['enableExternalSupplement']),
    sourceScopes: readStringArrayByAliases(payload, ['sourceScopes']),
  };
};

export const readExecutionContextSummary = (
  value: unknown,
): Record<string, unknown> | null => {
  const executionContext = readRecord(value);

  if (!executionContext) {
    return null;
  }

  return readRecord(executionContext.summary);
};

export const readExecutionContextAssistantId = (value: unknown): string | undefined => {
  const executionContext = readRecord(value);
  const summary = readExecutionContextSummary(executionContext);
  const resolvedAssistant = readRecord(executionContext?.resolvedAssistant);

  return (
    readString(executionContext?.assistantId) ||
    readString(resolvedAssistant?.assistantId) ||
    readString(summary?.assistantId)
  );
};

export const readExecutionContextPromptId = (value: unknown): string | undefined => {
  const executionContext = readRecord(value);
  const summary = readExecutionContextSummary(executionContext);
  const resolvedPrompt = readRecord(executionContext?.resolvedPrompt);

  return (
    readString(executionContext?.promptId) ||
    readString(resolvedPrompt?.promptId) ||
    readString(summary?.promptId)
  );
};

export const readExecutionContextPromptVersion = (value: unknown): string | undefined => {
  const executionContext = readRecord(value);
  const summary = readExecutionContextSummary(executionContext);
  const resolvedPrompt = readRecord(executionContext?.resolvedPrompt);

  return (
    readString(executionContext?.promptVersion) ||
    readString(resolvedPrompt?.promptVersion) ||
    readString(summary?.promptVersion)
  );
};

export const readExecutionContextStrategyId = (value: unknown): string | undefined => {
  const executionContext = readRecord(value);
  const summary = readExecutionContextSummary(executionContext);

  return (
    readString(executionContext?.strategyId) ||
    readString(summary?.strategyId) ||
    readString(executionContext?.scriptStrategy) ||
    readString(executionContext?.searchStrategy) ||
    readString(executionContext?.analyzeStrategy)
  );
};

export const mergeTaskSeeds = (...seeds: Array<TaskSeed | null | undefined>): TaskSeed => {
  const pickFirst = <T>(selector: (seed: TaskSeed) => T | undefined): T | undefined => {
    for (const seed of seeds) {
      if (!seed) {
        continue;
      }

      const candidate = selector(seed);
      if (isMeaningfulValue(candidate)) {
        return candidate;
      }
    }

    return undefined;
  };

  return {
    taskObject: pickFirst((seed) => seed.taskObject),
    audience: pickFirst((seed) => seed.audience),
    industryType: pickFirst((seed) => seed.industryType),
    taskPhase: pickFirst((seed) => seed.taskPhase),
    taskSubject: pickFirst((seed) => seed.taskSubject),
    taskInput: pickFirst((seed) => seed.taskInput),
    context: pickFirst((seed) => seed.context),
    goal: pickFirst((seed) => seed.goal),
    focusPoints: pickFirst((seed) => seed.focusPoints),
    toneStyle: pickFirst((seed) => seed.toneStyle),
    docType: pickFirst((seed) => seed.docType),
    onlyExternalAvailable: pickFirst((seed) => seed.onlyExternalAvailable),
    enableExternalSupplement: pickFirst((seed) => seed.enableExternalSupplement),
  };
};

export const parseContinueContext = (value: unknown): ContinueContext | null => {
  const payload = unwrapContinueRecord(value);

  if (!payload) {
    return null;
  }

  const executionContext = isRecord(payload.executionContext)
    ? ((payload.executionContext as ExecutionContext | Record<string, unknown>) ?? null)
    : null;
  const executionContextSummary = isRecord(payload.executionContextSummary)
    ? payload.executionContextSummary
    : isRecord((executionContext as Record<string, unknown> | null)?.summary)
      ? (((executionContext as Record<string, unknown>).summary as Record<string, unknown>) ?? null)
      : null;

  const normalized: ContinueContext = {
    resumeMode: readResumeMode(payload.resumeMode),
    sessionId: readString(payload.sessionId),
    fromModule: readString(payload.fromModule),
    stepId: readString(payload.stepId),
    evidenceId: readString(payload.evidenceId),
    assistantId:
      readString(payload.assistantId) ||
      readExecutionContextAssistantId(executionContext) ||
      readString(executionContextSummary?.assistantId),
    executionContext,
    executionContextSummary,
  };

  const inferredResumeMode = inferResumeMode({
    continueContext: normalized,
    carryPayload: readNavigationCarryPayload(value),
  });

  if (inferredResumeMode) {
    normalized.resumeMode = inferredResumeMode;
  }

  return hasContinueContextValue(normalized) || normalized.resumeMode ? normalized : null;
};

export const buildContinueContext = (
  value?: ContinueContext | null,
): ContinueContext => {
  return parseContinueContext(value) || {};
};

export const mergeContinueContexts = (
  ...contexts: Array<ContinueContext | null | undefined>
): ContinueContext => {
  const parsedContexts = contexts
    .map((item) => parseContinueContext(item))
    .filter((item): item is ContinueContext => Boolean(item));

  return buildContinueContext({
    sessionId: parsedContexts.find((item) => item.sessionId)?.sessionId,
    fromModule: parsedContexts.find((item) => item.fromModule)?.fromModule,
    stepId: parsedContexts.find((item) => item.stepId)?.stepId,
    evidenceId: parsedContexts.find((item) => item.evidenceId)?.evidenceId,
    assistantId: parsedContexts.find((item) => item.assistantId)?.assistantId,
    executionContext: parsedContexts.find((item) => item.executionContext)?.executionContext || null,
    executionContextSummary:
      parsedContexts.find((item) => item.executionContextSummary)?.executionContextSummary ||
      null,
  });
};

export const buildContinueNavigationState = ({
  continueContext,
  carryPayload,
}: {
  continueContext?: ContinueContext | null;
  carryPayload?: Record<string, unknown> | null;
}): ContinueNavigationState => {
  const state: ContinueNavigationState = {};
  const normalizedContinueContext = buildContinueContext(continueContext);
  const normalizedCarryPayload =
    isRecord(carryPayload) && Object.keys(carryPayload).length > 0 ? { ...carryPayload } : null;
  const resumeMode = inferResumeMode({
    continueContext: normalizedContinueContext,
    carryPayload: normalizedCarryPayload,
  });

  if (resumeMode) {
    normalizedContinueContext.resumeMode = resumeMode;
  }

  if (hasContinueContextValue(normalizedContinueContext) || resumeMode) {
    state.continueContext = normalizedContinueContext;
  }

  if (normalizedCarryPayload) {
    state.carryPayload = normalizedCarryPayload;
  }

  return state;
};

export const hasPersistedSession = (value?: ContinueContext | null): boolean => {
  return inferResumeMode({ continueContext: value }) === 'session' && Boolean(value?.sessionId);
};

export const getStepInputPayload = (step?: SessionStepRecord | null): Record<string, unknown> => {
  return isRecord(step?.inputPayload) ? step.inputPayload : {};
};

export const getStepOutputPayload = (step?: SessionStepRecord | null): Record<string, unknown> => {
  return isRecord(step?.outputPayload) ? step.outputPayload : {};
};

export const readStringFromPayload = (
  payload: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined => {
  return readString(payload?.[key]);
};

export const readBooleanFromPayload = (
  payload: Record<string, unknown> | null | undefined,
  key: string,
): boolean | undefined => {
  return readBoolean(payload?.[key]);
};

export const findStepById = (
  detail?: SessionDetailRecord | null,
  stepId?: string,
): SessionStepRecord | null => {
  if (!detail || !stepId) {
    return null;
  }

  return detail.steps.find((item) => item.id === stepId) || null;
};

export const findLatestStepByType = (
  detail?: SessionDetailRecord | null,
  stepType?: string,
): SessionStepRecord | null => {
  if (!detail || !stepType) {
    return null;
  }

  return detail.steps
    .slice()
    .reverse()
    .find((item) => item.stepType === stepType) || null;
};

export const findPreferredStep = ({
  detail,
  stepId = '',
  preferredTypes = [],
}: {
  detail?: SessionDetailRecord | null;
  stepId?: string;
  preferredTypes?: string[];
}): SessionStepRecord | null => {
  const explicitStep = findStepById(detail, stepId);

  if (explicitStep) {
    return explicitStep;
  }

  for (const stepType of preferredTypes) {
    const matched = findLatestStepByType(detail, stepType);

    if (matched) {
      return matched;
    }
  }

  return detail?.latestStep || null;
};

export const findEvidenceById = (
  detail?: SessionDetailRecord | null,
  evidenceId?: string,
): SessionEvidenceRecord | null => {
  if (!detail || !evidenceId) {
    return null;
  }

  return detail.evidences.find((item) => item.evidenceId === evidenceId) || null;
};

export const getStepEvidenceId = (step?: SessionStepRecord | null): string => {
  const inputPayload = getStepInputPayload(step);
  const outputPayload = getStepOutputPayload(step);

  return (
    readString(inputPayload.evidenceId) ||
    readString(outputPayload.evidenceId) ||
    readString(outputPayload.primaryEvidenceId) ||
    readString(inputPayload.primaryEvidenceId) ||
    readStringArray(outputPayload.primaryEvidenceIds)[0] ||
    readStringArray(inputPayload.primaryEvidenceIds)[0] ||
    ''
  );
};

export const findPreferredEvidence = ({
  detail,
  evidenceId = '',
  step = null,
}: {
  detail?: SessionDetailRecord | null;
  evidenceId?: string;
  step?: SessionStepRecord | null;
}): SessionEvidenceRecord | null => {
  const explicitEvidence = findEvidenceById(detail, evidenceId);

  if (explicitEvidence) {
    return explicitEvidence;
  }

  const stepEvidence = findEvidenceById(detail, getStepEvidenceId(step));

  if (stepEvidence) {
    return stepEvidence;
  }

  return detail?.evidences.find((item) => item.isPrimaryEvidence) || detail?.evidences[0] || null;
};

export const getStepExecutionContext = (
  step?: SessionStepRecord | null,
): Record<string, unknown> | null => {
  const inputPayload = getStepInputPayload(step);
  const outputPayload = getStepOutputPayload(step);

  const candidate =
    inputPayload.executionContext ||
    inputPayload.executionContextSummary ||
    outputPayload.executionContext ||
    outputPayload.executionContextSummary;

  return isRecord(candidate) ? candidate : null;
};

export const getStepAssistantId = (step?: SessionStepRecord | null): string => {
  const inputPayload = getStepInputPayload(step);
  const outputPayload = getStepOutputPayload(step);

  return (
    readString(inputPayload.assistantId) ||
    readString(outputPayload.assistantId) ||
    readExecutionContextAssistantId(getStepExecutionContext(step)) ||
    ''
  );
};

export const getAnalyzeOutputRecord = (
  step?: SessionStepRecord | null,
): Record<string, unknown> | null => {
  const outputPayload = getStepOutputPayload(step);
  const candidate = outputPayload.finalAnalyzeData;

  return isRecord(candidate) ? candidate : null;
};

export const getSessionExecutionContext = (
  detail?: SessionDetailRecord | null,
): Record<string, unknown> | null => {
  const candidate = detail?.session?.executionContextSummary;

  return isRecord(candidate) ? candidate : null;
};
