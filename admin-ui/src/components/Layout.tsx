import { Layout, Menu, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const { Content, Sider } = Layout;

const menuItems: MenuProps['items'] = [
  { key: '/dashboard', label: '仪表盘' },
  { key: '/connections', label: '外部连接' },
  { key: '/channels', label: '渠道管理' },
  { key: '/conversations', label: '对话记录' },
  { key: '/rules', label: '安全规则' },
  { key: '/knowledge', label: '知识库管理' },
  { key: '/knowledge-gaps', label: '知识缺口' },
  { key: '/evolution', label: '优化建议' },
  { key: '/apps', label: '应用管理' },
];

function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Layout style={{ minHeight: '100vh', background: '#eef2f7' }}>
      <Sider width={232} style={{ background: '#111827' }}>
        <div style={{ padding: 24, color: '#fff' }}>
          <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
            Agent Admin
          </Typography.Title>
          <Typography.Text style={{ color: '#9ca3af' }}>内部管理后台</Typography.Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ background: '#111827', borderInlineEnd: 0 }}
        />
      </Sider>
      <Layout>
        <Content style={{ padding: 24 }}>
          <div
            style={{
              minHeight: 'calc(100vh - 48px)',
              borderRadius: 18,
              background: '#fff',
              padding: 24,
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.08)',
            }}
          >
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

export default AdminLayout;
