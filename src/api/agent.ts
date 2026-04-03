import request from './request';

export type AnalyzeCustomerRequest = {
  customerName?: string;
  industryType?: 'pcb' | 'semiconductor' | 'display' | 'other';
  salesStage?:
    | 'initial_contact'
    | 'requirement_discussion'
    | 'sample_followup'
    | 'quotation'
    | 'other';
  productDirection?: string;
  customerText: string;
  remark?: string;
};

export type AnalyzeCustomerResponse = {
  success: boolean;
  message: string;
  data?: {
    summary: string;
    sceneJudgement: string;
    recommendedProducts: string[];
    followupQuestions: string[];
    riskNotes: string[];
    nextActions: string[];
  };
};

export const mockAnalyzeCustomerResponse: AnalyzeCustomerResponse = {
  success: true,
  message: '分析成功',
  data: {
    summary:
      '客户当前在评估双氧水体系蚀刻液，核心关注点是稳定性、线宽均匀性和整体成本控制。',
    sceneJudgement:
      '该需求可初步判断为 PCB 蚀刻相关场景，当前处于需求沟通阶段。',
    recommendedProducts: ['双氧水体系蚀刻液', '稳定性优化方案资料'],
    followupQuestions: [
      '当前使用的蚀刻体系是什么？',
      '客户更关注成本、稳定性还是线宽控制？',
      '是否有明确的样品测试计划？',
    ],
    riskNotes: ['目前信息仍偏初步，暂不适合承诺具体性能改善结果。'],
    nextActions: ['先发送基础资料', '确认测试需求', '判断是否进入样品沟通'],
  },
};

export const analyzeCustomer = (data: AnalyzeCustomerRequest) => {
  return request.post<AnalyzeCustomerResponse>('/api/agent/analyze-customer', data);
};

export type SearchDocumentsRequest = {
  keyword: string;
  docType?: 'spec' | 'faq' | 'case' | 'project';
  industryType?: 'pcb' | 'semiconductor' | 'display' | 'other';
  onlyExternalAvailable?: boolean;
};

export type SearchDocumentsResponse = {
  success: boolean;
  message: string;
  data?: Array<{
    id: string;
    docName: string;
    docType: string;
    summaryText: string;
    applicableScene: string;
    externalAvailable: boolean;
  }>;
};

export const mockSearchDocumentsResponse: SearchDocumentsResponse = {
  success: true,
  message: '检索成功',
  data: [
    {
      id: 'doc-1',
      docName: '双氧水体系蚀刻液规格书',
      docType: '规格书',
      summaryText: '包含产品基础参数、适用场景和使用注意事项。',
      applicableScene: 'PCB 蚀刻场景',
      externalAvailable: true,
    },
    {
      id: 'doc-2',
      docName: '稳定性优化方案 FAQ',
      docType: 'FAQ',
      summaryText: '汇总客户常见问题及标准答复口径。',
      applicableScene: '客户前期沟通阶段',
      externalAvailable: false,
    },
  ],
};

export const searchDocuments = (data: SearchDocumentsRequest) => {
  return request.post<SearchDocumentsResponse>('/api/agent/search-documents', data);
};

export type GenerateScriptRequest = {
  customerType?: string;
  salesStage?:
    | 'initial_contact'
    | 'requirement_discussion'
    | 'sample_followup'
    | 'quotation'
    | 'other';
  communicationGoal?: 'first_reply' | 'sample_followup' | 'technical_reply' | 'reactivate';
  productDirection?: string;
  concernPoints?: string;
  customerText: string;
  referenceSummary?: string;
  toneStyle?: 'formal' | 'concise' | 'spoken';
};

export type GenerateScriptResponse = {
  success: boolean;
  message: string;
  data?: {
    formalVersion: string;
    conciseVersion: string;
    spokenVersion: string;
    cautionNotes: string[];
    llmVersion?: string;
    llmRoute?: string;
  };
};

export const mockGenerateScriptResponse: GenerateScriptResponse = {
  success: true,
  message: '生成成功',
  data: {
    formalVersion:
      '您好，关于您关注的双氧水体系蚀刻液稳定性和整体使用成本问题，我们这边可以先提供一版基础资料供您评估，内容会包含产品适用场景、关键参数及使用注意事项。如您方便，也欢迎您进一步说明当前工艺条件，我们可以更有针对性地协助判断。',
    conciseVersion:
      '您好，您关注的稳定性和成本问题，我们可以先发一版基础资料给您参考。若您方便，也可以补充一下当前工艺条件，我们再进一步判断。',
    spokenVersion:
      '您好，这块我们可以先把基础资料发您看一下，里面会有产品参数和适用场景。您要是方便，也可以跟我说下现在的工艺情况，我们再一起细看。',
    cautionNotes: [
      '当前阶段不建议直接承诺具体性能提升结果。',
      '涉及成本改善时，建议结合客户实际工艺再进一步确认。',
    ],
    llmVersion: '',
    llmRoute: '',
  },
};

export const generateScript = (data: GenerateScriptRequest) => {
  return request.post<GenerateScriptResponse>('/api/agent/generate-script', data);
};