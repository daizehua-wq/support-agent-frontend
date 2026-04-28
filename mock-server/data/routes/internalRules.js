import express from 'express';
import { readJsonFile, writeJsonFile } from '../../services/jsonDataService.js';
import { nowLocalIso } from '../../utils/localTime.js';

const router = express.Router();
const RULES_FILE = 'rules.json';

const parseRulesPayload = (payload = {}) => {
  const rawRules =
    typeof payload === 'string'
      ? payload
      : typeof payload.rules === 'string'
        ? payload.rules
        : JSON.stringify(payload.rules ?? payload, null, 2);

  try {
    return JSON.parse(rawRules);
  } catch (error) {
    const parseError = new Error(`invalid rules json: ${error.message}`);
    parseError.statusCode = 400;
    throw parseError;
  }
};

router.get('/internal/rules', (req, res) => {
  const rules = readJsonFile(RULES_FILE, {
    analyzeCustomerRules: [],
    riskRules: [],
    searchRules: [],
    scriptRules: [],
  });

  return res.json({
    success: true,
    data: {
      rules: JSON.stringify(rules, null, 2),
      parsed: rules,
      source: `data/${RULES_FILE}`,
      status: 'active',
    },
  });
});

router.put('/internal/rules', (req, res) => {
  const nextRules = parseRulesPayload(req.body || {});
  const filePath = writeJsonFile(RULES_FILE, nextRules);

  process.emit('internal-rules:updated', {
    filePath,
    updatedAt: nowLocalIso(),
  });

  return res.json({
    success: true,
    message: 'rules updated',
    data: {
      rules: JSON.stringify(nextRules, null, 2),
      parsed: nextRules,
      source: `data/${RULES_FILE}`,
      status: 'active',
      reloaded: true,
      updatedAt: nowLocalIso(),
    },
  });
});

export default router;
