import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import GlobalAgentDebugBar from '../components/common/GlobalAgentDebugBar';

const { Header, Content } = Layout;

function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const items: MenuProps['items'] = [
    { key: '/home', label: '工作台' },
    { key: '/agent', label: '智能体' },
    { key: '/manage', label: '管理' },
  ];

  const resolveSelectedKey = () => {
    if (location.pathname.startsWith('/agent') || location.pathname.startsWith('/assistant-center')) {
      return '/agent';
    }

    if (
      location.pathname.startsWith('/manage') ||
      location.pathname.startsWith('/model-center') ||
      location.pathname.startsWith('/database-manager') ||
      location.pathname.startsWith('/apps') ||
      location.pathname.startsWith('/settings')
    ) {
      return '/manage';
    }

    return '/home';
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
