import request from './request';

export async function getPermissionSummary(): Promise<unknown> {
  const res = await request.get<unknown, unknown>('/api/auth/me');
  return res;
}
