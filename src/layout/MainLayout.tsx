import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const { Header, Content } = Layout;

function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const items: MenuProps['items'] = [
    { key: '/home', label: '首页' },
    { key: '/analyze', label: '客户分析' },
    { key: '/search', label: '资料检索' },
    { key: '/script', label: '话术生成' },
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
          销售支持 Agent
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
          <Outlet />
        </div>
      </Content>
    </Layout>
  );
}

export default MainLayout;