import { createHash, randomUUID } from 'crypto';
import { addDaysLocalIso, nowLocalIso, toLocalIso } from '../utils/localTime.js';

const normalizeText = (value = '') => String(value || '').trim();

const normalizeLower = (value = '') => normalizeText(value).toLowerCase();

const clampScore = (value = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(Math.min(1, Math.max(0, parsed)).toFixed(2));
};

const SOURCE_PRIORITY = Object.freeze({
  internal_data: { priority: 'P0', score: 1, trustLevel: 'high' },
  paid_authoritative_data: { priority: 'P1', score: 0.92, trustLevel: 'high' },
  official_web: { priority: 'P2', score: 0.78, trustLevel: 'high' },
  media_web: { priority: 'P3', score: 0.62, trustLevel: 'medium' },
  general_web: { priority: 'P4', score: 0.46, trustLevel: 'low' },
  social_or_forum: { priority: 'P5', score: 0.28, trustLevel: 'low' },
  unknown: { priority: 'P5', score: 0.22, trustLevel: 'low' },
});

const PRIORITY_WEIGHT = Object.freeze({
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
  P5: 5,
});

const SOURCE_TYPE_CATEGORY_MAP = Object.freeze({
  internal_data: 'internal_data',
  internal_database: 'internal_data',
  local_document: 'internal_data',
  'local-document': 'internal_data',
  enterprise_database: 'internal_data',
  'enterprise-database': 'internal_data',
  paid_api: 'paid_authoritative_data',
  paid_authoritative_data: 'paid_authoritative_data',
  paid_database: 'paid_authoritative_data',
  'paid-database': 'paid_authoritative_data',
  official_site: 'official_web',
  official_web: 'official_web',
  web_search: 'general_web',
  'web-search': 'general_web',
  external_search: 'general_web',
  'external-search': 'general_web',
  media_web: 'media_web',
  general_web: 'general_web',
  social_or_forum: 'social_or_forum',
});

const safeDate = (value = '') => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

export const contentHash = (value = '') =>
  createHash('sha256').update(String(value || ''), 'utf-8').digest('hex');

const tokenize = (value = '') => {
  const normalized = normalizeLower(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return [];
  }

  const splitTerms = normalized.split(' ').filter((term) => term.length >= 2);
  if (splitTerms.length > 0) {
    return splitTerms;
  }

  return normalized.length >= 2 ? [normalized] : [];
};

const jaccardSimilarity = (left = '', right = '') => {
  const leftTerms = new Set(tokenize(left));
  const rightTerms = new Set(tokenize(right));

  if (leftTerms.size === 0 || rightTerms.size === 0) {
    return 0;
  }

  let intersection = 0;
  leftTerms.forEach((term) => {
    if (rightTerms.has(term)) {
      intersection += 1;
    }
  });

  return intersection / new Set([...leftTerms, ...rightTerms]).size;
};

const inferCategory = (source = {}) => {
  const declaredCategory = normalizeText(source.category);
  if (SOURCE_PRIORITY[declaredCategory]) {
    return declaredCategory;
  }

  const sourceType = normalizeLower(source.sourceType || source.source_type);
  const mappedCategory = SOURCE_TYPE_CATEGORY_MAP[sourceType];
  if (mappedCategory) {
    return mappedCategory;
  }

  const url = normalizeLower(source.url);
  const sourceName = normalizeLower(source.sourceName || source.source_name || source.provider);

  if (url.includes('.gov') || sourceName.includes('政府') || sourceName.includes('官方')) {
    return 'official_web';
  }

  if (sourceName.includes('新闻') || sourceName.includes('媒体') || sourceName.includes('news')) {
    return 'media_web';
  }

  return 'unknown';
};

const inferFreshnessScore = (source = {}, now = new Date()) => {
  const date = safeDate(source.updatedAt || source.updated_at || source.publishedAt || source.published_at);
  if (!date) {
    return 0.62;
  }

  const ageDays = Math.max(0, (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));

  if (ageDays <= 30) return 0.95;
  if (ageDays <= 90) return 0.86;
  if (ageDays <= 365) return 0.72;
  if (ageDays <= 730) return 0.52;
  return 0.34;
};

const inferRelevanceScore = (source = {}, query = '') => {
  const normalizedQuery = normalizeLower(query);
  const haystack = normalizeLower(
    [source.title, source.summary, source.content, source.sourceName, source.provider]
      .filter(Boolean)
      .join(' '),
  );

  if (!normalizedQuery) {
    return 0.72;
  }

  if (haystack.includes(normalizedQuery)) {
    return 0.94;
  }

  const terms = tokenize(normalizedQuery);
  if (terms.length === 0) {
    return 0.68;
  }

  const hitCount = terms.filter((term) => haystack.includes(term)).length;
  return clampScore(0.48 + (hitCount / terms.length) * 0.42);
};

const inferStructureScore = (category = '', source = {}) => {
  if (category === 'internal_data' || category === 'paid_authoritative_data') {
    return source.structured === false ? 0.08 : 0.12;
  }

  if (category === 'official_web') return 0.08;
  if (category === 'media_web') return 0.05;
  if (category === 'general_web') return 0.03;
  return 0.01;
};

const buildSourceContent = (source = {}) =>
  normalizeText(source.content) ||
  [source.title, source.summary, source.url || source.provider]
    .map(normalizeText)
    .filter(Boolean)
    .join('\n\n');

const buildInternalSource = (item = {}, index = 0) => ({
  rawId: item.evidenceId || item.sourceRef || `internal_${index + 1}`,
  sourceType: 'internal_data',
  sourceName: '内部资料',
  provider: item.connectorId || item.connectorType || 'internal',
  category: 'internal_data',
  title: item.title || `内部资料 ${index + 1}`,
  summary: item.summary || '',
  content: item.summary || item.title || '',
  url: '',
  sourceRef: item.sourceRef || item.evidenceId || '',
  docType: item.docType || '',
  applicableScene: item.applicableScene || '',
  externalAvailable: item.outboundStatus === 'allowed',
  canUseInExternalOutput: item.outboundStatus === 'allowed',
  retrievedAt: nowLocalIso(),
  originalEvidence: item,
});

export const normalizeGovernanceSources = ({
  internalEvidenceItems = [],
  externalSources = [],
} = {}) => [
  ...(Array.isArray(internalEvidenceItems) ? internalEvidenceItems : []).map(buildInternalSource),
  ...(Array.isArray(externalSources) ? externalSources : []).map((source, index) => ({
    ...source,
    rawId: source.rawId || source.id || `external_${index + 1}`,
  })),
];

const resolveDuplicate = (governedItems = [], candidate = {}) => {
  const candidateUrl = normalizeLower(candidate.url);
  const candidateTitleSummary = `${candidate.title || ''} ${candidate.summary || ''}`;

  return governedItems.find((item) => {
    if (candidateUrl && normalizeLower(item.url) === candidateUrl) {
      return true;
    }

    if (item.contentHash && item.contentHash === candidate.contentHash) {
      return true;
    }

    const itemTitleSummary = `${item.title || ''} ${item.summary || ''}`;
    return jaccardSimilarity(itemTitleSummary, candidateTitleSummary) >= 0.82;
  });
};

const hasConflict = (left = {}, right = {}) => {
  const leftKey = normalizeLower(left.claimKey);
  const rightKey = normalizeLower(right.claimKey);
  const leftValue = normalizeLower(left.claimValue);
  const rightValue = normalizeLower(right.claimValue);

  return Boolean(leftKey && rightKey && leftKey === rightKey && leftValue && rightValue && leftValue !== rightValue);
};

const chooseHigherPriorityEvidence = (left = {}, right = {}) => {
  const leftWeight = PRIORITY_WEIGHT[left.priority] ?? 9;
  const rightWeight = PRIORITY_WEIGHT[right.priority] ?? 9;
  if (leftWeight !== rightWeight) {
    return leftWeight < rightWeight ? left : right;
  }

  return Number(left.finalScore || 0) >= Number(right.finalScore || 0) ? left : right;
};

export const buildGovernedEvidenceItems = ({
  internalEvidenceItems = [],
  externalSources = [],
  query = '',
  sessionId = '',
  appId = '',
  taskId = '',
  now = new Date(),
  validDays = 30,
} = {}) => {
  const sources = normalizeGovernanceSources({ internalEvidenceItems, externalSources });
  const retrievedAt = toLocalIso(now);
  const validUntil = addDaysLocalIso(validDays, now);
  const prelimItems = sources.map((source, index) => {
    const category = inferCategory(source);
    const priorityConfig = SOURCE_PRIORITY[category] || SOURCE_PRIORITY.unknown;
    const body = buildSourceContent(source);
    const hash = contentHash(body);
    const relevanceScore = inferRelevanceScore(source, query);
    const freshnessScore = inferFreshnessScore(source, now);
    const structureScore = inferStructureScore(category, source);
    const lowTrustPenalty = priorityConfig.trustLevel === 'low' ? 0.18 : 0;
    const expiredPenalty = freshnessScore < 0.4 ? 0.12 : 0;
    const finalScore = clampScore(
      priorityConfig.score * 0.45 +
        relevanceScore * 0.25 +
        freshnessScore * 0.15 +
        structureScore -
        lowTrustPenalty -
        expiredPenalty,
    );
    const evidenceId = `ev_${hash.slice(0, 12)}_${index + 1}`;
    const fileId = `file_${hash.slice(0, 16)}`;
    const trustLevel = source.trustLevel || priorityConfig.trustLevel;
    const isLowTrust = trustLevel === 'low';

    return {
      evidenceId,
      fileId,
      rawId: source.rawId || source.id || evidenceId,
      sourceType: source.sourceType || 'unknown',
      sourceName: source.sourceName || source.source_name || source.provider || 'unknown',
      provider: source.provider || source.sourceName || 'unknown',
      category,
      title: normalizeText(source.title) || `资料 ${index + 1}`,
      summary: normalizeText(source.summary) || normalizeText(source.content).slice(0, 180),
      content: body,
      url: normalizeText(source.url),
      localFilePath: '',
      contentHash: hash,
      retrievedAt: source.retrievedAt || source.retrieved_at || retrievedAt,
      publishedAt: source.publishedAt || source.published_at || null,
      updatedAt: source.updatedAt || source.updated_at || null,
      trustLevel,
      priority: priorityConfig.priority,
      sourcePriority: priorityConfig.score,
      relevanceScore,
      freshnessScore,
      finalScore,
      isDuplicate: false,
      duplicateOf: null,
      externalAvailable: source.externalAvailable !== false,
      canUseAsFact: !isLowTrust && ['P0', 'P1', 'P2'].includes(priorityConfig.priority),
      canUseAsBackground: true,
      canUseInExternalOutput: source.canUseInExternalOutput === true || source.externalAvailable === true,
      requiresCitation: true,
      status: 'active',
      validUntil,
      refreshPolicy: source.refreshPolicy || 'manual',
      lastVerifiedAt: source.lastVerifiedAt || retrievedAt,
      reuseCount: 0,
      claimKey: source.claimKey || '',
      claimValue: source.claimValue || '',
      applicableScene: source.applicableScene || '',
      docType: source.docType || '',
      sourceRef: source.sourceRef || '',
      originalSource: source,
      taskId,
      sessionId,
      appId,
    };
  });

  const sortedPrelimItems = [...prelimItems].sort((left, right) => {
    const priorityDiff =
      (PRIORITY_WEIGHT[left.priority] ?? 9) - (PRIORITY_WEIGHT[right.priority] ?? 9);
    if (priorityDiff !== 0) return priorityDiff;
    return Number(right.finalScore || 0) - Number(left.finalScore || 0);
  });

  const canonicalItems = [];
  sortedPrelimItems.forEach((item) => {
    const duplicate = resolveDuplicate(canonicalItems, item);
    if (duplicate) {
      item.isDuplicate = true;
      item.duplicateOf = duplicate.evidenceId;
      item.canUseAsFact = false;
      item.finalScore = clampScore(Number(item.finalScore || 0) - 0.2);
    } else {
      canonicalItems.push(item);
    }
  });

  const conflicts = [];
  for (let leftIndex = 0; leftIndex < sortedPrelimItems.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sortedPrelimItems.length; rightIndex += 1) {
      const left = sortedPrelimItems[leftIndex];
      const right = sortedPrelimItems[rightIndex];

      if (!hasConflict(left, right)) {
        continue;
      }

      const winner = chooseHigherPriorityEvidence(left, right);
      const loser = winner.evidenceId === left.evidenceId ? right : left;
      const internalInvolved =
        left.category === 'internal_data' || right.category === 'internal_data';

      loser.canUseAsFact = false;
      loser.finalScore = clampScore(Number(loser.finalScore || 0) - 0.18);

      conflicts.push({
        conflictId: `conflict_${randomUUID().slice(0, 12)}`,
        evidenceIdA: left.evidenceId,
        evidenceIdB: right.evidenceId,
        conflictType: internalInvolved ? 'internal_external_conflict' : 'source_claim_conflict',
        description: `${left.title} 与 ${right.title} 在「${left.claimKey}」上的说法不一致。`,
        suggestedResolution: internalInvolved
          ? '内部数据与外部数据冲突，不自动覆盖，需人工确认。'
          : `默认优先参考 ${winner.title}，较低优先级资料进入冲突提醒。`,
        needHumanConfirmation: true,
        lowerPriorityEvidenceId: loser.evidenceId,
        higherPriorityEvidenceId: winner.evidenceId,
      });
    }
  }

  const conflictEvidenceIds = new Set(
    conflicts.flatMap((conflict) => [
      conflict.evidenceIdA,
      conflict.evidenceIdB,
      conflict.lowerPriorityEvidenceId,
    ]),
  );

  const evidenceItems = sortedPrelimItems
    .map((item) => {
      let useType = 'background';
      let reason = '可作为背景资料';

      if (item.isDuplicate) {
        useType = 'doNotUse';
        reason = `重复资料，已合并到 ${item.duplicateOf}`;
      } else if (conflictEvidenceIds.has(item.evidenceId) && !item.canUseAsFact) {
        useType = 'conflict';
        reason = '与其他资料存在冲突，需人工确认';
      } else if (item.canUseAsFact) {
        useType = 'fact';
        reason = '来源优先级和可信度满足事实引用条件';
      } else if (item.trustLevel === 'low' || item.category === 'unknown') {
        useType = item.category === 'general_web' ? 'background' : 'doNotUse';
        reason =
          item.category === 'general_web'
            ? '普通网页资料，仅作为背景，不直接进入事实'
            : '低可信或未知来源，不建议直接使用';
      }

      return {
        ...item,
        useType,
        useReason: reason,
      };
    })
    .sort((left, right) => Number(right.finalScore || 0) - Number(left.finalScore || 0));

  return {
    evidenceItems,
    conflicts,
  };
};

export const buildEvidenceJson = (item = {}) => ({
  evidenceId: item.evidenceId,
  sourceType: item.sourceType,
  sourceName: item.sourceName,
  provider: item.provider,
  category: item.category,
  title: item.title,
  summary: item.summary,
  url: item.url || null,
  localFilePath: item.localFilePath,
  contentHash: item.contentHash,
  retrievedAt: item.retrievedAt,
  publishedAt: item.publishedAt || null,
  updatedAt: item.updatedAt || null,
  trustLevel: item.trustLevel,
  priority: item.priority,
  sourcePriority: item.sourcePriority,
  relevanceScore: item.relevanceScore,
  freshnessScore: item.freshnessScore,
  finalScore: item.finalScore,
  isDuplicate: item.isDuplicate,
  duplicateOf: item.duplicateOf,
  externalAvailable: item.externalAvailable,
  canUseAsFact: item.canUseAsFact,
  canUseAsBackground: item.canUseAsBackground,
  canUseInExternalOutput: item.canUseInExternalOutput,
  requiresCitation: item.requiresCitation,
  status: item.status,
  validUntil: item.validUntil,
  refreshPolicy: item.refreshPolicy,
  lastVerifiedAt: item.lastVerifiedAt,
  reuseCount: item.reuseCount,
  useType: item.useType,
  useReason: item.useReason,
});

export const buildEvidenceMarkdown = (item = {}) => [
  `# 资料：${item.title}`,
  '',
  `来源类型：${item.sourceType}`,
  `来源名称：${item.sourceName}`,
  `可信度：${item.trustLevel}`,
  `优先级：${item.priority}`,
  `检索时间：${item.retrievedAt}`,
  `是否可外发：${item.canUseInExternalOutput ? '是' : '否'}`,
  `有效期：${item.validUntil}`,
  '',
  '## 摘要',
  '',
  item.summary || '无摘要。',
  '',
  '## 可用于写作的事实',
  '',
  item.canUseAsFact ? `- ${item.summary || item.title}` : '- 不建议作为事实直接使用。',
  '',
  '## 背景说明',
  '',
  item.canUseAsBackground ? `- ${item.content || item.summary || item.title}` : '- 无。',
  '',
  '## 风险提醒',
  '',
  item.useType === 'conflict' || item.useType === 'doNotUse'
    ? `- ${item.useReason}`
    : '- 暂无额外风险提醒。',
  '',
  '## 来源',
  '',
  item.url || item.provider || item.localFilePath || '未返回',
].join('\n');

export const upsertEvidenceItem = (db, item = {}) => {
  const now = nowLocalIso();

  db.prepare(
    `
    INSERT INTO evidence_items (
      evidence_id, file_id, source_type, provider, category, title, summary,
      local_file_path, url, content_hash, trust_level, priority, source_priority,
      relevance_score, freshness_score, final_score, is_duplicate, duplicate_of,
      external_available, can_use_as_fact, can_use_as_background,
      can_use_in_external_output, requires_citation, status, valid_until,
      refresh_policy, last_verified_at, reuse_count, created_at, updated_at,
      retrieved_at, task_id, session_id, app_id
    )
    VALUES (
      @evidenceId, @fileId, @sourceType, @provider, @category, @title, @summary,
      @localFilePath, @url, @contentHash, @trustLevel, @priority, @sourcePriority,
      @relevanceScore, @freshnessScore, @finalScore, @isDuplicate, @duplicateOf,
      @externalAvailable, @canUseAsFact, @canUseAsBackground,
      @canUseInExternalOutput, @requiresCitation, @status, @validUntil,
      @refreshPolicy, @lastVerifiedAt, @reuseCount, @createdAt, @updatedAt,
      @retrievedAt, @taskId, @sessionId, @appId
    )
    ON CONFLICT(evidence_id) DO UPDATE SET
      file_id = excluded.file_id,
      source_type = excluded.source_type,
      provider = excluded.provider,
      category = excluded.category,
      title = excluded.title,
      summary = excluded.summary,
      local_file_path = excluded.local_file_path,
      url = excluded.url,
      content_hash = excluded.content_hash,
      trust_level = excluded.trust_level,
      priority = excluded.priority,
      source_priority = excluded.source_priority,
      relevance_score = excluded.relevance_score,
      freshness_score = excluded.freshness_score,
      final_score = excluded.final_score,
      is_duplicate = excluded.is_duplicate,
      duplicate_of = excluded.duplicate_of,
      external_available = excluded.external_available,
      can_use_as_fact = excluded.can_use_as_fact,
      can_use_as_background = excluded.can_use_as_background,
      can_use_in_external_output = excluded.can_use_in_external_output,
      requires_citation = excluded.requires_citation,
      status = excluded.status,
      valid_until = excluded.valid_until,
      refresh_policy = excluded.refresh_policy,
      last_verified_at = excluded.last_verified_at,
      reuse_count = excluded.reuse_count,
      updated_at = excluded.updated_at,
      retrieved_at = excluded.retrieved_at,
      task_id = excluded.task_id,
      session_id = excluded.session_id,
      app_id = excluded.app_id
    `,
  ).run({
    ...item,
    isDuplicate: item.isDuplicate ? 1 : 0,
    duplicateOf: item.duplicateOf || null,
    externalAvailable: item.externalAvailable ? 1 : 0,
    canUseAsFact: item.canUseAsFact ? 1 : 0,
    canUseAsBackground: item.canUseAsBackground ? 1 : 0,
    canUseInExternalOutput: item.canUseInExternalOutput ? 1 : 0,
    requiresCitation: item.requiresCitation ? 1 : 0,
    createdAt: item.createdAt || now,
    updatedAt: now,
  });
};
