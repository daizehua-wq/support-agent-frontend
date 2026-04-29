import request from './request';

export async function getPermissionSummary(): Promise<any> {
  const res = await request.get<any, any>('/api/auth/me');
  return res;
}
