export type UserRole = 'user' | 'business_admin' | 'system_admin' | 'internal_ops';

export interface PermissionSummary {
  userId: string;
  displayName: string;
  role: UserRole;
  permissions: UserPermissions;
}

export interface UserPermissions {
  canViewSettingsOverview: boolean;
  canManageModels: boolean;
  canManageAssistants: boolean;
  canManageDataSources: boolean;
  canManageApps: boolean;
  canManageRules: boolean;
  canViewRuntime: boolean;
  canViewGovernance: boolean;
  canAccessAdminUi: boolean;
  canAccessPlatformManager: boolean;
}

export const USER_PERMISSION_DEFAULTS: PermissionSummary = {
  userId: 'current-user',
  displayName: '当前用户',
  role: 'user',
  permissions: {
    canViewSettingsOverview: true,
    canManageModels: false,
    canManageAssistants: false,
    canManageDataSources: false,
    canManageApps: false,
    canManageRules: false,
    canViewRuntime: false,
    canViewGovernance: false,
    canAccessAdminUi: false,
    canAccessPlatformManager: false,
  },
};

export const PERMISSION_REQUIRED: Record<string, keyof UserPermissions> = {
  '/settings/overview': 'canViewSettingsOverview',
  '/settings/models': 'canManageModels',
  '/settings/assistants': 'canManageAssistants',
  '/settings/data-sources': 'canManageDataSources',
  '/settings/apps': 'canManageApps',
  '/settings/rules': 'canManageRules',
  '/settings/runtime': 'canViewRuntime',
  '/settings/governance': 'canViewGovernance',
};
