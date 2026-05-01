import { Router } from 'express';
import {
  getSettingsCenterOverview,
  getSettingsCenterModels,
  getSettingsCenterAssistants,
  getSettingsCenterDataSources,
  getSettingsCenterApps,
  getSettingsCenterRules,
  getSettingsCenterRuntime,
  getSettingsCenterGovernance,
} from '../services/settingsCenterService.js';

const router = Router();

const sendSuccess = (res, payload) => res.json({ success: true, ...payload });
const sendError = (res, statusCode, message, code) => res.status(statusCode).json({ success: false, message, error: { code, message } });

router.get('/overview', (req, res) => {
  try {
    const data = getSettingsCenterOverview();
    sendSuccess(res, { message: '获取设置中心总览成功', data });
  } catch (e) {
    sendError(res, 500, '获取设置中心总览失败', 'SETTINGS_OVERVIEW_FAILED');
  }
});

router.get('/models', (req, res) => {
  try {
    const data = getSettingsCenterModels();
    sendSuccess(res, { message: '获取大模型管理聚合成功', data });
  } catch (e) {
    sendError(res, 500, '获取大模型管理聚合失败', 'SETTINGS_MODELS_FAILED');
  }
});

router.get('/assistants', (req, res) => {
  try {
    const data = getSettingsCenterAssistants();
    sendSuccess(res, { message: '获取 Assistant 聚合成功', data });
  } catch (e) {
    sendError(res, 500, '获取 Assistant 聚合失败', 'SETTINGS_ASSISTANTS_FAILED');
  }
});

router.get('/data-sources', (req, res) => {
  try {
    const data = getSettingsCenterDataSources();
    sendSuccess(res, { message: '获取数据源聚合成功', data });
  } catch (e) {
    sendError(res, 500, '获取数据源聚合失败', 'SETTINGS_DATASOURCES_FAILED');
  }
});

router.get('/apps', (req, res) => {
  try {
    const data = getSettingsCenterApps();
    sendSuccess(res, { message: '获取应用聚合成功', data });
  } catch (e) {
    sendError(res, 500, '获取应用聚合失败', 'SETTINGS_APPS_FAILED');
  }
});

router.get('/rules', (req, res) => {
  try {
    const data = getSettingsCenterRules();
    sendSuccess(res, { message: '获取规则聚合成功', data });
  } catch (e) {
    sendError(res, 500, '获取规则聚合失败', 'SETTINGS_RULES_FAILED');
  }
});

router.get('/runtime', (req, res) => {
  try {
    const data = getSettingsCenterRuntime();
    sendSuccess(res, { message: '获取运行状态聚合成功', data });
  } catch (e) {
    sendError(res, 500, '获取运行状态聚合失败', 'SETTINGS_RUNTIME_FAILED');
  }
});

router.get('/governance', (req, res) => {
  try {
    const data = getSettingsCenterGovernance();
    sendSuccess(res, { message: '获取治理历史聚合成功', data });
  } catch (e) {
    sendError(res, 500, '获取治理历史聚合失败', 'SETTINGS_GOVERNANCE_FAILED');
  }
});

export default router;
