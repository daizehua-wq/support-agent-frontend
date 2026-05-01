import { listSessions, getSessionDetail } from './sessionService.js';

// ============================================================================
// Legacy Session → Task Archive Adapter (P1-4, read-only mapping)
// ============================================================================

function inferTaskType(session) {
  const stepTypes = (session.steps || []).map((s) => s.stepType);
  if (stepTypes.includes('script') || stepTypes.includes('compose')) return 'output_generation';
  if (stepTypes.includes('search') || stepTypes.includes('retrieve')) return 'evidence_search';
  if (stepTypes.includes('analyze') || stepTypes.includes('judge')) return 'customer_analysis';
  return 'full_workflow';
}

function inferStatus(session) {
  const steps = session.steps || [];
  const hasFailed = steps.some((s) => s.outputPayload?.status === 'failed');
  if (hasFailed) return 'failed';
  const hasOutput = steps.some((s) => s.stepType === 'script' || s.stepType === 'compose');
  if (hasOutput) return 'completed';
  const hasIncomplete = steps.some((s) => !s.outputPayload || s.outputPayload.status !== 'completed');
  if (hasIncomplete && steps.length > 0) return 'continuable';
  return 'draft';
}

function inferRecentStep(session) {
  const steps = session.steps || [];
  if (steps.length === 0) return '未开始';
  const last = steps[steps.length - 1];
  if (last.stepType === 'script' || last.stepType === 'compose') return 'Output 生成完成';
  if (last.stepType === 'search' || last.stepType === 'retrieve') return 'Evidence 完成';
  if (last.stepType === 'analyze' || last.stepType === 'judge') return 'Analysis 完成';
  return '执行中';
}

function normalizeTimestamp(dateStr) {
  if (!dateStr) return new Date().toISOString();
  // Handle both ISO and ISO-without-Z
  return dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
}

function mapSessionToTaskArchiveItem(session) {
  const steps = session.steps || [];
  const hasOutput = steps.some((s) => s.stepType === 'script' || s.stepType === 'compose');
  const status = inferStatus(session);

  return {
    taskId: session.id,
    taskTitle: session.title || session.taskObject || '旧版 Session 任务',
    taskType: inferTaskType(session),
    status,
    recentStep: inferRecentStep(session),
    assistantName: session.executionContextSummary?.assistantName || session.assistantId || '—',
    updatedAt: normalizeTimestamp(session.updatedAt || session.createdAt),
    taskGoal: session.taskInput || session.taskObject || '',
    planVersions: [{ versionId: `${session.id}-plan-legacy-v1`, label: 'v1', kind: 'task_plan', reason: '旧版 Session 计划', createdAt: normalizeTimestamp(session.createdAt), status: 'archived', summary: session.taskObject || '旧版任务' }],
    evidencePackVersions: steps.some((s) => s.stepType === 'search') ? [{ versionId: `${session.id}-evidence-legacy-v1`, label: 'v1', kind: 'evidence_pack', reason: '旧版证据包', createdAt: normalizeTimestamp(session.updatedAt || session.createdAt), status: 'archived', summary: '旧版 Session 证据' }] : [],
    outputVersions: hasOutput ? [{ versionId: `${session.id}-output-legacy-v1`, label: 'v1', kind: 'output', reason: '旧版 Output', createdAt: normalizeTimestamp(session.updatedAt || session.createdAt), status: status === 'completed' ? 'active' : 'archived', summary: '旧版 Session 输出' }] : [],
    analysisSummary: steps.find((s) => s.stepType === 'analyze')?.summary || '',
    evidenceSummary: steps.find((s) => s.stepType === 'search')?.summary || '',
    risks: [],
    executionContext: {
      assistantName: session.executionContextSummary?.assistantName || session.assistantId || '旧版 Assistant',
      modelName: session.executionContextSummary?.modelName || 'legacy-model',
      dataSources: (session.executionContextSummary?.dataSources || []).map((ds) => ({ name: ds.name || '', status: ds.status || 'unknown' })),
      taskPlanner: { status: 'ready', source: 'embedded_model' },
    },
    hasOutput,
    source: 'legacy_session',
  };
}

function mapSessionToTaskArchiveDetail(session) {
  const item = mapSessionToTaskArchiveItem(session);
  const steps = session.steps || [];
  const hasOutput = item.hasOutput;

  return {
    ...item,
    taskPlan: {
      taskId: session.id,
      taskTitle: item.taskTitle,
      taskType: item.taskType,
      userGoal: item.taskGoal,
      understanding: `旧版 Session 任务：${item.taskGoal}`,
      status: 'waiting_confirmation',
      steps: [
        { stepId: `${session.id}-a`, order: 1, type: 'analysis', title: '分析客户场景', required: true, status: 'pending' },
        { stepId: `${session.id}-e`, order: 2, type: 'evidence', title: '检索资料与证据', required: true, status: 'pending' },
        { stepId: `${session.id}-o`, order: 3, type: 'output', title: '生成输出', required: true, status: 'pending' },
        { stepId: `${session.id}-s`, order: 4, type: 'save', title: '保存历史任务', required: true, status: 'pending' },
      ],
      executionContext: item.executionContext,
      riskHints: [],
    },
    execution: {
      taskId: session.id,
      status: item.status === 'completed' ? 'done' : item.status === 'failed' ? 'failed' : 'running',
      steps: steps.map((s) => ({
        stepId: s.id,
        type: s.stepType === 'analyze' ? 'analysis' : s.stepType === 'search' ? 'evidence' : s.stepType === 'script' ? 'output' : s.stepType,
        title: s.stepType === 'analyze' ? '分析客户场景' : s.stepType === 'search' ? '检索资料与证据' : s.stepType === 'script' ? '生成输出' : s.stepType,
        status: s.outputPayload?.status === 'failed' ? 'failed' : 'done',
        summary: s.summary || s.stepSummary,
        details: s.outputPayload?.details || [],
        startedAt: normalizeTimestamp(s.createdAt),
      })),
      currentStepId: undefined,
      completedAt: normalizeTimestamp(session.updatedAt),
    },
    analysisSummary: steps.find((s) => s.stepType === 'analyze')?.summary || item.analysisSummary,
    evidenceSummary: steps.find((s) => s.stepType === 'search')?.summary || item.evidenceSummary,
    outputSummary: hasOutput ? (steps.find((s) => s.stepType === 'script')?.summary || '旧版 Session 输出内容') : '',
    riskSummary: '',
    currentPlanVersionId: `${session.id}-plan-legacy-v1`,
    currentEvidencePackVersionId: item.evidencePackVersions.length > 0 ? `${session.id}-evidence-legacy-v1` : null,
    currentOutputVersionId: hasOutput ? `${session.id}-output-legacy-v1` : null,
    source: 'legacy_session',
    createdAt: normalizeTimestamp(session.createdAt),
    updatedAt: normalizeTimestamp(session.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function listLegacySessionTasks() {
  try {
    const sessions = listSessions() || [];
    return sessions.map(mapSessionToTaskArchiveItem);
  } catch {
    return [];
  }
}

export function getLegacySessionTaskDetail(sessionId) {
  try {
    const session = getSessionDetail(sessionId);
    if (!session) return null;
    return mapSessionToTaskArchiveDetail(session);
  } catch {
    return null;
  }
}

export function isLegacySession(sessionId) {
  try {
    return !!getSessionDetail(sessionId);
  } catch {
    return false;
  }
}
