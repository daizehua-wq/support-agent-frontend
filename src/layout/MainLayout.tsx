import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import GlobalAgentDebugBar from '../components/common/GlobalAgentDebugBar';

const { Header, Content } = Layout;

function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const items: MenuProps['items'] = [
    { key: '/', label: '首页' },
    { key: '/workbench', label: '工作台' },
    { key: '/tasks', label: '历史任务' },
    { key: '/settings/overview', label: '设置管理中心' },
  ];

  const resolveSelectedKey = () => {
    if (location.pathname === '/') {
      return '/';
    }

    if (location.pathname.startsWith('/workbench')) {
      return '/workbench';
    }

    if (location.pathname.startsWith('/tasks')) {
      return '/tasks';
    }

    if (location.pathname.startsWith('/settings')) {
      return '/settings/overview';
    }

    return '/';
  };

  return (
    <Layout className="ap-shell">
      <Header
        className="ap-shell__header"
      >
        <div
          className="ap-shell__brand"
        >
          <span className="ap-shell__brand-mark" />
          AP 2.0
        </div>

        <Menu
          mode="horizontal"
          selectedKeys={[resolveSelectedKey()]}
          items={items}
          onClick={({ key }) => navigate(key)}
          className="ap-shell__menu"
        />
      </Header>

      <Content className="ap-shell__content">
        <div className="ap-shell__surface">
          <GlobalAgentDebugBar />
          <Outlet />
        </div>
      </Content>
    </Layout>
  );
}

export default MainLayout;
