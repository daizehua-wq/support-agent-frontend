import request from './request';

export async function getSettingsCenterOverview(): Promise<unknown> {
  return request.get<unknown, unknown>('/api/settings-center/overview');
}

export async function getSettingsCenterModels(): Promise<unknown> {
  return request.get<unknown, unknown>('/api/settings-center/models');
}

export async function getSettingsCenterAssistants(): Promise<unknown> {
  return request.get<unknown, unknown>('/api/settings-center/assistants');
}

export async function getSettingsCenterDataSources(): Promise<unknown> {
  return request.get<unknown, unknown>('/api/settings-center/data-sources');
}

export async function getSettingsCenterApps(): Promise<unknown> {
  return request.get<unknown, unknown>('/api/settings-center/apps');
}

export async function getSettingsCenterRules(): Promise<unknown> {
  return request.get<unknown, unknown>('/api/settings-center/rules');
}

export async function getSettingsCenterRuntime(): Promise<unknown> {
  return request.get<unknown, unknown>('/api/settings-center/runtime');
}

export async function getSettingsCenterGovernance(): Promise<unknown> {
  return request.get<unknown, unknown>('/api/settings-center/governance');
}
