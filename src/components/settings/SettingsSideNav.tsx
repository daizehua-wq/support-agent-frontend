import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppstoreOutlined,
  AuditOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  LockOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { SettingsNavItem } from '../../types/settingsCenter';

type SettingsSideNavProps = {
  items: SettingsNavItem[];
};

const ICON_MAP: Record<string, React.ReactNode> = {
  overview: <DashboardOutlined />,
  models: <RobotOutlined />,
  assistants: <SettingOutlined />,
  'data-sources': <DatabaseOutlined />,
  apps: <AppstoreOutlined />,
  rules: <SafetyCertificateOutlined />,
  runtime: <DashboardOutlined />,
  governance: <AuditOutlined />,
};

const STATUS_DOT: Record<string, React.ReactNode> = {
  ok: null,
  locked: <LockOutlined style={{ color: '#94a3b8', fontSize: 10, marginLeft: 4 }} />,
  warning: <span style={{ width: 7, height: 7, borderRadius: 999, background: '#f59e0b', display: 'inline-block', marginLeft: 4 }} />,
  error: <span style={{ width: 7, height: 7, borderRadius: 999, background: '#ef4444', display: 'inline-block', marginLeft: 4 }} />,
  blue: <span style={{ width: 7, height: 7, borderRadius: 999, background: '#2563eb', display: 'inline-block', marginLeft: 4 }} />,
};

function SettingsSideNav({ items }: SettingsSideNavProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems: MenuProps['items'] = items.map((item) => ({
    key: item.path,
    icon: ICON_MAP[item.key] || <SettingOutlined />,
    label: (
      <span>
        {item.label}
        {STATUS_DOT[item.status]}
      </span>
    ),
  }));

  const selectedKey = items.find((i) => location.pathname.startsWith(i.path))?.path || items[0]?.path || '';

  return (
    <div className="ap-settings-sidenav">
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
      />
    </div>
  );
}

export default SettingsSideNav;
