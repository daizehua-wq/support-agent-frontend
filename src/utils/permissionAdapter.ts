import type { PermissionSummary } from '../types/permissions';
import { USER_PERMISSION_DEFAULTS } from '../types/permissions';
import * as permissionsApi from '../api/permissions';
import { asUnknownRecord, readRecord, readString } from './unknownRecord';

export async function getPermissionSummary(): Promise<PermissionSummary> {
  try {
    const raw = await permissionsApi.getPermissionSummary();
    // Handle response wrapping
    const response = asUnknownRecord(raw);
    const nestedData = asUnknownRecord(readRecord(response, 'data').data);
    const data = Object.keys(nestedData).length
      ? nestedData
      : Object.keys(readRecord(response, 'data')).length
        ? readRecord(response, 'data')
        : response;
    const permissions = readRecord(data, 'permissions');
    const role = readString(data, 'role');
    if (readString(data, 'userId') && Object.keys(permissions).length) {
      return {
        userId: readString(data, 'userId'),
        displayName: readString(data, 'displayName', '当前用户'),
        role: role === 'business_admin' || role === 'system_admin' || role === 'internal_ops' ? role : 'user',
        permissions: {
          ...USER_PERMISSION_DEFAULTS.permissions,
          ...permissions,
        },
      };
    }
    return USER_PERMISSION_DEFAULTS;
  } catch {
    // Any error → fallback to user view (most conservative)
    return USER_PERMISSION_DEFAULTS;
  }
}
