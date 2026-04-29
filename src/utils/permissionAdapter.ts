import type { PermissionSummary } from '../types/permissions';
import { USER_PERMISSION_DEFAULTS } from '../types/permissions';
import * as permissionsApi from '../api/permissions';

export async function getPermissionSummary(): Promise<PermissionSummary> {
  try {
    const raw = await permissionsApi.getPermissionSummary();
    // Handle response wrapping
    const data = raw?.data?.data || raw?.data || raw || {};
    if (data?.userId && data?.permissions) {
      return {
        userId: data.userId,
        displayName: data.displayName || '当前用户',
        role: data.role || 'user',
        permissions: data.permissions,
      };
    }
    return USER_PERMISSION_DEFAULTS;
  } catch {
    // Any error → fallback to user view (most conservative)
    return USER_PERMISSION_DEFAULTS;
  }
}
