import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import SettingsSideNav from '../../components/settings/SettingsSideNav';
import PermissionLock from '../../components/settings/PermissionLock';
import * as permissionAdapter from '../../utils/permissionAdapter';
import { PERMISSION_REQUIRED } from '../../types/permissions';
import type { SettingsNavItem } from '../../types/settingsCenter';

const ALL_NAV_ITEMS: SettingsNavItem[] = [
  { key: 'overview', label: '系统总览', path: '/settings/overview', status: 'ok' },
  { key: 'models', label: '大模型管理', path: '/settings/models', status: 'ok' },
  { key: 'assistants', label: 'Assistant / Prompt', path: '/settings/assistants', status: 'ok' },
  { key: 'data-sources', label: '数据源管理', path: '/settings/data-sources', status: 'ok' },
  { key: 'apps', label: '应用与渠道', path: '/settings/apps', status: 'ok' },
  { key: 'rules', label: '规则与知识', path: '/settings/rules', status: 'ok' },
  { key: 'runtime', label: '运行状态与安全', path: '/settings/runtime', status: 'ok' },
  { key: 'governance', label: '治理历史', path: '/settings/governance', status: 'ok' },
];

const PERMISSION_LABELS: Record<string, string> = {
  overview: '设置总览',
  models: '大模型管理',
  assistants: 'Assistant / Prompt',
  'data-sources': '数据源管理',
  apps: '应用与渠道',
  rules: '规则与知识',
  runtime: '运行状态与安全',
  governance: '治理历史',
};

function SettingsLayout() {
  const location = useLocation();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [permLoading, setPermLoading] = useState(true);

  useEffect(() => {
    permissionAdapter.getPermissionSummary().then((summary) => {
      setPermissions(summary.permissions as unknown as Record<string, boolean>);
    }).finally(() => {
      setPermLoading(false);
    });
  }, []);

  const navItems = ALL_NAV_ITEMS.filter((item) => {
    const permKey = PERMISSION_REQUIRED[item.path];
    if (!permKey) return true;
    if (item.key === 'overview') return true;
    return permissions[permKey] === true;
  });

  // Route-level guard: check current pathname
  const currentPath = location.pathname;
  const requiredPermKey = PERMISSION_REQUIRED[currentPath];
  const hasAccess = !requiredPermKey || currentPath === '/settings/overview' || permissions[requiredPermKey] === true;

  const currentKey = ALL_NAV_ITEMS.find((item) => item.path === currentPath)?.key;
  const requiredLabel = currentKey ? PERMISSION_LABELS[currentKey] : '';

  if (location.pathname.startsWith('/settings/overview')) {
    return <Outlet />;
  }

  return (
    <div className="ap-settings-center">
      <SettingsSideNav items={navItems} />
      <div className="ap-settings-overview">
        {permLoading ? (
          <div style={{ display: 'grid', placeItems: 'center', minHeight: '30vh' }}>
            <Spin tip="检查权限…" />
          </div>
        ) : hasAccess ? (
          <Outlet />
        ) : (
          <PermissionLock requiredRole={requiredLabel} currentRole="当前用户" onContactAdmin={undefined} />
        )}
      </div>
    </div>
  );
}

export default SettingsLayout;
