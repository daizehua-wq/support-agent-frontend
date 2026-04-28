import express from 'express';
import {
  createRule,
  deleteRule,
  listRules,
  matchRules,
  updateRule,
} from '../models/knowledgeRule.js';
import {
  createResource,
  deleteResource,
  listResources,
  searchResources,
  updateResource,
} from '../models/knowledgeResource.js';
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  updateTemplate,
} from '../models/generationTemplate.js';
import {
  createNote,
  deleteNote,
  listNotes,
  updateNote,
} from '../models/guidanceNote.js';

const router = express.Router();

const sendOk = (res, data, message = '') => {
  return res.json({
    success: true,
    message,
    data,
  });
};

const sendNotFound = (res, message = 'not found') => {
  return res.status(404).json({
    success: false,
    message,
  });
};

const normalizeText = (value = '') => String(value || '').trim();

const isAutoDeletableTestData = (id = '') => {
  return normalizeText(id).startsWith('TEST_');
};

const sendDeleteForbidden = (res, id = '') => {
  return res.status(403).json({
    success: false,
    message: `only TEST_ prefixed knowledge data can be auto-deleted: ${normalizeText(id)}`,
  });
};

const routeHandler = (handler) => {
  return (req, res) => {
    try {
      return handler(req, res);
    } catch (error) {
      console.error('[internalKnowledge] request failed:', error.message);
      return res.status(400).json({
        success: false,
        message: error.message || 'knowledge request failed',
      });
    }
  };
};

router.get('/internal/knowledge/rules/match', routeHandler((req, res) => {
  return sendOk(res, matchRules(req.query || {}));
}));

router.get('/internal/knowledge/rules', routeHandler((req, res) => {
  return sendOk(res, listRules(req.query || {}));
}));

router.post('/internal/knowledge/rules', routeHandler((req, res) => {
  return sendOk(res, createRule(req.body || {}), 'knowledge rule created');
}));

router.put('/internal/knowledge/rules/:id', routeHandler((req, res) => {
  const rule = updateRule(req.params.id, req.body || {});
  return rule ? sendOk(res, rule, 'knowledge rule updated') : sendNotFound(res, 'rule not found');
}));

router.delete('/internal/knowledge/rules/:id', routeHandler((req, res) => {
  if (!isAutoDeletableTestData(req.params.id)) {
    return sendDeleteForbidden(res, req.params.id);
  }

  const deleted = deleteRule(req.params.id);
  return deleted
    ? sendOk(res, { id: req.params.id, deleted: true }, 'knowledge rule deleted')
    : sendNotFound(res, 'rule not found');
}));

router.get('/internal/knowledge/resources/search', routeHandler((req, res) => {
  return sendOk(res, searchResources(req.query || {}));
}));

router.get('/internal/knowledge/resources', routeHandler((req, res) => {
  return sendOk(res, listResources(req.query || {}));
}));

router.post('/internal/knowledge/resources', routeHandler((req, res) => {
  return sendOk(res, createResource(req.body || {}), 'knowledge resource created');
}));

router.put('/internal/knowledge/resources/:id', routeHandler((req, res) => {
  const resource = updateResource(req.params.id, req.body || {});
  return resource
    ? sendOk(res, resource, 'knowledge resource updated')
    : sendNotFound(res, 'resource not found');
}));

router.delete('/internal/knowledge/resources/:id', routeHandler((req, res) => {
  if (!isAutoDeletableTestData(req.params.id)) {
    return sendDeleteForbidden(res, req.params.id);
  }

  const deleted = deleteResource(req.params.id);
  return deleted
    ? sendOk(res, { id: req.params.id, deleted: true }, 'knowledge resource deleted')
    : sendNotFound(res, 'resource not found');
}));

router.get('/internal/knowledge/templates', routeHandler((req, res) => {
  return sendOk(res, listTemplates(req.query || {}));
}));

router.post('/internal/knowledge/templates', routeHandler((req, res) => {
  return sendOk(res, createTemplate(req.body || {}), 'generation template created');
}));

router.put('/internal/knowledge/templates/:id', routeHandler((req, res) => {
  const template = updateTemplate(req.params.id, req.body || {});
  return template
    ? sendOk(res, template, 'generation template updated')
    : sendNotFound(res, 'template not found');
}));

router.delete('/internal/knowledge/templates/:id', routeHandler((req, res) => {
  if (!isAutoDeletableTestData(req.params.id)) {
    return sendDeleteForbidden(res, req.params.id);
  }

  const deleted = deleteTemplate(req.params.id);
  return deleted
    ? sendOk(res, { id: req.params.id, deleted: true }, 'generation template deleted')
    : sendNotFound(res, 'template not found');
}));

router.get('/internal/knowledge/notes', routeHandler((req, res) => {
  return sendOk(res, listNotes(req.query || {}));
}));

router.post('/internal/knowledge/notes', routeHandler((req, res) => {
  return sendOk(res, createNote(req.body || {}), 'guidance note created');
}));

router.put('/internal/knowledge/notes/:id', routeHandler((req, res) => {
  const note = updateNote(req.params.id, req.body || {});
  return note
    ? sendOk(res, note, 'guidance note updated')
    : sendNotFound(res, 'note not found');
}));

router.delete('/internal/knowledge/notes/:id', routeHandler((req, res) => {
  if (!isAutoDeletableTestData(req.params.id)) {
    return sendDeleteForbidden(res, req.params.id);
  }

  const deleted = deleteNote(req.params.id);
  return deleted
    ? sendOk(res, { id: req.params.id, deleted: true }, 'guidance note deleted')
    : sendNotFound(res, 'note not found');
}));

export default router;
