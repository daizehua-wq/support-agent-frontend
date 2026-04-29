import request from './request';

export async function getSettingsCenterOverview(): Promise<any> {
  return request.get<any, any>('/api/settings-center/overview');
}

export async function getSettingsCenterModels(): Promise<any> {
  return request.get<any, any>('/api/settings-center/models');
}

export async function getSettingsCenterAssistants(): Promise<any> {
  return request.get<any, any>('/api/settings-center/assistants');
}

export async function getSettingsCenterDataSources(): Promise<any> {
  return request.get<any, any>('/api/settings-center/data-sources');
}

export async function getSettingsCenterApps(): Promise<any> {
  return request.get<any, any>('/api/settings-center/apps');
}

export async function getSettingsCenterRules(): Promise<any> {
  return request.get<any, any>('/api/settings-center/rules');
}

export async function getSettingsCenterRuntime(): Promise<any> {
  return request.get<any, any>('/api/settings-center/runtime');
}

export async function getSettingsCenterGovernance(): Promise<any> {
  return request.get<any, any>('/api/settings-center/governance');
}
