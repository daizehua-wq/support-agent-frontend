// ============================================================================
// Auth Service (P1-5, minimal permission / role model)
// ============================================================================

const PERMISSION_TEMPLATES = {
  user: {
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
  business_admin: {
    canViewSettingsOverview: true,
    canManageModels: false,
    canManageAssistants: true,
    canManageDataSources: true,
    canManageApps: true,
    canManageRules: true,
    canViewRuntime: false,
    canViewGovernance: false,
    canAccessAdminUi: false,
    canAccessPlatformManager: false,
  },
  system_admin: {
    canViewSettingsOverview: true,
    canManageModels: true,
    canManageAssistants: true,
    canManageDataSources: true,
    canManageApps: true,
    canManageRules: true,
    canViewRuntime: true,
    canViewGovernance: true,
    canAccessAdminUi: true,
    canAccessPlatformManager: true,
  },
  internal_ops: {
    canViewSettingsOverview: true,
    canManageModels: false,
    canManageAssistants: false,
    canManageDataSources: false,
    canManageApps: false,
    canManageRules: false,
    canViewRuntime: true,
    canViewGovernance: true,
    canAccessAdminUi: true,
    canAccessPlatformManager: true,
  },
};

const ROLE_NAMES = {
  user: '普通用户',
  business_admin: '业务管理员',
  system_admin: '系统管理员',
  internal_ops: '内部运维',
};

const VALID_ROLES = ['user', 'business_admin', 'system_admin', 'internal_ops'];

export function getUserInfo(queryRole) {
  const role = (queryRole && VALID_ROLES.includes(queryRole)) ? queryRole : 'user';

  return {
    userId: 'current-user',
    displayName: ROLE_NAMES[role] || '当前用户',
    role,
    permissions: { ...PERMISSION_TEMPLATES[role] },
  };
}
