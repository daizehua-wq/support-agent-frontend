import type { SearchEvidenceItem } from '../../api/agent';

export type SearchEvidence = SearchEvidenceItem & {
  id: string;
  docName: string;
  docType: string;
  summaryText: string;
  applicableScene: string;
  externalAvailable: boolean;
  evidenceLevel: SearchEvidenceItem['level'];
  outputEligible: boolean;
  sessionEligible: boolean;
};

export type SearchOutputCarryState = {
  fromModule: 'search';
  evidenceId: string;
  sessionId: string;
  stepId?: string;
};

export const getProductDirectionFromDocName = (docName?: string): string => {
  const raw = String(docName || '').trim();

  if (!raw) {
    return '相关产品';
  }

  return raw.replace(/规格书|FAQ|说明资料|说明文件|资料/g, '').trim() || raw;
};

export const mapSearchEvidence = (item: SearchEvidenceItem): SearchEvidence => {
  const externalAvailable = item.outboundStatus === 'allowed';

  return {
    ...item,
    id: item.evidenceId,
    docName: item.title,
    docType: item.docType,
    summaryText: item.summary,
    applicableScene: item.applicableScene,
    externalAvailable,
    evidenceLevel: item.level,
    outputEligible: item.level === 'core',
    sessionEligible: true,
  };
};

export const mapSearchEvidenceList = (evidenceItems: SearchEvidenceItem[]): SearchEvidence[] => {
  return evidenceItems.map((item) => mapSearchEvidence(item));
};

export const splitEvidenceByLevel = (evidenceList: SearchEvidence[]) => {
  return {
    coreEvidenceList: evidenceList.filter((item) => item.evidenceLevel === 'core'),
    supportEvidenceList: evidenceList.filter((item) => item.evidenceLevel === 'support'),
  };
};

export const buildOutputCarryState = ({
  evidence,
  sessionId,
  stepId,
}: {
  evidence: SearchEvidence;
  sessionId: string;
  stepId?: string;
}): SearchOutputCarryState => ({
  fromModule: 'search',
  evidenceId: evidence.evidenceId,
  sessionId,
  stepId: stepId || undefined,
});
