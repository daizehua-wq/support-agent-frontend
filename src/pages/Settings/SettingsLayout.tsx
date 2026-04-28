import { Outlet, useLocation } from 'react-router-dom';
import SettingsSideNav from '../../components/settings/SettingsSideNav';
import type { SettingsNavItem } from '../../types/settingsCenter';

const NAV_ITEMS: SettingsNavItem[] = [
  { key: 'overview', label: '系统总览', path: '/settings/overview', status: 'ok' },
  { key: 'models', label: '大模型管理', path: '/settings/models', status: 'ok' },
  { key: 'assistants', label: 'Assistant / Prompt', path: '/settings/assistants', status: 'ok' },
  { key: 'data-sources', label: '数据源管理', path: '/settings/data-sources', status: 'ok' },
  { key: 'apps', label: '应用与渠道', path: '/settings/apps', status: 'ok' },
  { key: 'rules', label: '规则与知识', path: '/settings/rules', status: 'ok' },
  { key: 'runtime', label: '运行状态与安全', path: '/settings/runtime', status: 'ok' },
  { key: 'governance', label: '治理历史', path: '/settings/governance', status: 'ok' },
];

function SettingsLayout() {
  const location = useLocation();

  if (location.pathname.startsWith('/settings/overview')) {
    return <Outlet />;
  }

  return (
    <div className="ap-settings-center">
      <SettingsSideNav items={NAV_ITEMS} />
      <div className="ap-settings-overview">
        <Outlet />
      </div>
    </div>
  );
}

export default SettingsLayout;
