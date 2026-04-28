import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { getDb } from './database.js';
import { createRule } from './models/knowledgeRule.js';
import { createResource } from './models/knowledgeResource.js';
import { createTemplate } from './models/generationTemplate.js';
import { createNote } from './models/guidanceNote.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mockServerRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(mockServerRoot, '..');

const normalizeText = (value = '') => String(value || '').trim();

const readJsonCandidate = (paths = [], fallbackValue = null) => {
  for (const filePath of paths) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.warn(`[knowledge:migrate] failed to read ${filePath}:`, error.message);
    }
  }

  return fallbackValue;
};

const buildId = (prefix = 'knowledge', payload = {}) => {
  const hash = createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
  return `${prefix}_${hash}`;
};

const countRows = (tableName = '') => {
  return Number(getDb().prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get()?.count || 0);
};

const firstScope = (item = {}) => {
  if (Array.isArray(item.scope) && item.scope.length > 0) {
    return item.scope[0];
  }

  if (Array.isArray(item.industryTypes) && item.industryTypes.length > 0) {
    return item.industryTypes[0];
  }

  return item.domainType || item.domain_type || 'general';
};

const toRuleRows = (rulesPayload = {}) => {
  const rows = [];

  for (const rule of rulesPayload.analyzeCustomerRules || []) {
    rows.push({
      id: buildId('krule', { stage: 'analyze', rule }),
      domainType: firstScope(rule),
      topic: rule.targetCategory || rule.templateGroup || '',
      workflowStage: 'analyze',
      keywords: rule.keywords || [],
      scenario: rule.sceneType || rule.name || '',
      suggestions: {
        sourceType: 'legacy.analyzeCustomerRules',
        priority: rule.priority || 0,
        legacyRule: rule,
      },
      riskNotes: rule.riskNotes || [],
    });
  }

  for (const rule of rulesPayload.riskRules || []) {
    rows.push({
      id: buildId('krule', { stage: 'risk', rule }),
      domainType: firstScope(rule),
      topic: rule.name || '',
      workflowStage: 'risk',
      keywords: rule.keywords || [],
      scenario: rule.name || '',
      suggestions: {
        sourceType: 'legacy.riskRules',
        legacyRule: rule,
      },
      riskNotes: rule.riskNote || '',
    });
  }

  for (const rule of rulesPayload.searchRules || []) {
    rows.push({
      id: buildId('krule', { stage: 'search', rule }),
      domainType: firstScope(rule),
      topic: rule.targetCategory || '',
      workflowStage: 'search',
      keywords: rule.keywords || [],
      scenario: rule.name || '',
      suggestions: {
        sourceType: 'legacy.searchRules',
        priority: rule.priority || 0,
        legacyRule: rule,
      },
      riskNotes: '',
    });
  }

  for (const rule of rulesPayload.scriptRules || rulesPayload.scriptToneRules || []) {
    rows.push({
      id: buildId('krule', { stage: 'script', rule }),
      domainType: firstScope(rule),
      topic: rule.ruleType || rule.toneStyle || rule.scene || '',
      workflowStage: 'script',
      keywords: rule.keywords || [],
      scenario: rule.scene || rule.toneStyle || rule.name || '',
      suggestions: {
        sourceType: 'legacy.scriptRules',
        description: rule.description || '',
        legacyRule: rule,
      },
      riskNotes: '',
    });
  }

  return rows;
};

const toResourceRows = (resourcesPayload = []) => {
  return (Array.isArray(resourcesPayload) ? resourcesPayload : []).flatMap((product) => {
    const domainType = firstScope(product);
    const sharedPayload = {
      scenes: product.applicableScenes || [],
      keywords: product.keywords || [],
      industryTypes: product.industryTypes || [],
      scope: product.scope || [],
      legacyProduct: product,
    };
    const productRow = {
      id: product.id || buildId('kres', { product }),
      domainType,
      title: product.productName || product.title || '未命名资源',
      summary: product.summary || '',
      applicableScenarios: sharedPayload,
      isShareable: Boolean(product.externalAvailable),
      contentType: product.category || product.contentType || 'product',
      link: `legacy://product/${product.id || buildId('product', product)}`,
    };

    const documentRows = (product.relatedDocuments || []).map((document, index) => ({
      id: buildId('kresdoc', { productId: product.id, index, document }),
      domainType,
      title: document.docName || document.title || `${productRow.title}资料`,
      summary: document.summaryText || document.summary || product.summary || '',
      applicableScenarios: {
        ...sharedPayload,
        productId: product.id || '',
        productName: product.productName || '',
        legacyDocument: document,
      },
      isShareable: Boolean(product.externalAvailable && document.externalAvailable),
      contentType: document.docType || 'document',
      link: `legacy://product/${product.id || ''}/doc/${index + 1}`,
    }));

    return [productRow, ...documentRows];
  });
};

const toTemplateRows = (templatesPayload = []) => {
  return (Array.isArray(templatesPayload) ? templatesPayload : []).map((template) => ({
    id: template.id || buildId('gtpl', { template }),
    scene: template.scene || 'general',
    outputTarget: template.toneStyle || template.outputTarget || '',
    templateContent: template.template || template.templateContent || template.template_content || '',
    variables: {
      toneStyle: template.toneStyle || '',
      keywords: template.keywords || [],
      legacyTemplate: template,
    },
  }));
};

const toNoteRows = (notesPayload = []) => {
  return (Array.isArray(notesPayload) ? notesPayload : []).flatMap((note) => {
    const keywords = Array.isArray(note.keywords) ? note.keywords.join('、') : '';
    const scene = note.sceneType || note.scene || 'general';
    const rows = [];

    if (note.riskNote) {
      rows.push({
        id: buildId('gnote', { type: 'warning', note }),
        scene,
        noteType: 'warning',
        content: `${note.question || ''} ${keywords} ${note.riskNote}`.trim(),
      });
    }

    if (note.answer) {
      rows.push({
        id: buildId('gnote', { type: 'suggestion', note }),
        scene,
        noteType: 'suggestion',
        content: `${note.question || ''} ${keywords} ${note.answer}`.trim(),
      });
    }

    return rows;
  });
};

const prodKnowledge = {
  rules: [
    {
      id: 'prod_rule_pcb_etching_h2o2',
      domainType: 'pcb',
      topic: 'h2o2',
      workflowStage: 'analyze',
      keywords: ['双氧水', '蚀刻液', '线宽'],
      scenario: 'PCB 双氧水体系蚀刻沟通',
      suggestions: {
        priority: 20,
        legacyRule: {
          name: 'prod_h2o2_scene',
          keywords: ['双氧水', '蚀刻液', '线宽'],
          sceneType: 'h2o2',
          targetCategory: 'h2o2',
          templateGroup: 'technical_reply',
          scope: ['pcb'],
          priority: 20,
        },
      },
      riskNotes: ['涉及性能改善时，需以测试验证结果为准。'],
    },
  ],
  resources: [
    {
      id: 'prod_resource_pcb_etching_h2o2',
      domainType: 'pcb',
      title: 'PCB 双氧水体系蚀刻方案资料',
      summary: '覆盖稳定性、线宽均匀性、成本控制和导入验证建议。',
      applicableScenarios: ['PCB 蚀刻场景', '技术交流'],
      isShareable: true,
      contentType: 'solution',
      link: 'internal://knowledge/pcb-h2o2',
    },
  ],
  templates: [
    {
      id: 'prod_template_technical_reply_formal',
      scene: 'technical_reply',
      outputTarget: 'formal',
      templateContent:
        '您好，关于【任务主题】的技术问题，我们建议先结合当前工艺条件、评价指标和样品测试结果进行确认，再输出更稳妥的结论。',
      variables: {
        toneStyle: 'formal',
      },
    },
  ],
  notes: [
    {
      id: 'prod_note_validation_required',
      scene: 'technical_reply',
      noteType: 'warning',
      content: '涉及性能、良率、成本改善时，需避免直接承诺结果，建议以客户测试验证数据为准。',
    },
  ],
};

const migrateTable = (tableName = '', rows = [], createItem) => {
  if (countRows(tableName) > 0) {
    return 0;
  }

  for (const row of rows) {
    createItem(row);
  }

  return rows.length;
};

export const migrate = async () => {
  const useProdKnowledge = String(process.env.USE_PROD_KNOWLEDGE || '').toLowerCase() === 'true';
  const legacyRules = readJsonCandidate(
    [
      path.join(mockServerRoot, 'config/rules.json'),
      path.join(projectRoot, 'data/rules.json'),
    ],
    {},
  );
  const legacyResources = readJsonCandidate(
    [
      path.join(mockServerRoot, 'data/resources.json'),
      path.join(projectRoot, 'data/products.json'),
    ],
    [],
  );
  const legacyTemplates = readJsonCandidate(
    [
      path.join(mockServerRoot, 'config/generation_templates.json'),
      path.join(projectRoot, 'data/script_templates.json'),
    ],
    [],
  );
  const legacyNotes = readJsonCandidate(
    [
      path.join(mockServerRoot, 'config/guidance_notes.json'),
      path.join(projectRoot, 'data/faqs.json'),
    ],
    [],
  );

  const rows = useProdKnowledge
    ? prodKnowledge
    : {
        rules: toRuleRows(legacyRules),
        resources: toResourceRows(legacyResources),
        templates: toTemplateRows(legacyTemplates),
        notes: toNoteRows(legacyNotes),
      };

  const imported = {
    knowledgeRules: migrateTable('knowledge_rules', rows.rules, createRule),
    knowledgeResources: migrateTable('knowledge_resources', rows.resources, createResource),
    generationTemplates: migrateTable('generation_templates', rows.templates, createTemplate),
    guidanceNotes: migrateTable('guidance_notes', rows.notes, createNote),
  };

  console.log('[knowledge:migrate] complete:', {
    mode: useProdKnowledge ? 'prod-placeholder' : 'legacy-json',
    imported,
  });

  return imported;
};
