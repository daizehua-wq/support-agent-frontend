import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import GlobalAgentDebugBar from '../components/common/GlobalAgentDebugBar';

const { Header, Content } = Layout;

function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const items: MenuProps['items'] = [
    { key: '/home', label: '首页' },
    { key: '/workbench', label: '任务工作台' },
    { key: '/judge', label: '判断' },
    { key: '/retrieve', label: '检索' },
    { key: '/compose', label: '写作' },
    { key: '/model-center', label: '模型中心' },
    { key: '/database-manager', label: '数据库管理' },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            marginRight: 32,
            whiteSpace: 'nowrap',
            color: '#000',
          }}
        >
          通用 Agent 平台
        </div>

        <Menu
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={items}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1, minWidth: 0 }}
        />
      </Header>

      <Content style={{ padding: 24, background: '#f5f5f5' }}>
        <div
          style={{
            background: '#fff',
            minHeight: 'calc(100vh - 112px)',
            padding: 24,
            borderRadius: 8,
          }}
        >
          <GlobalAgentDebugBar />
          <Outlet />
        </div>
      </Content>
    </Layout>
  );
}

export default MainLayout;
