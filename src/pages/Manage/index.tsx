import {
  ApiOutlined,
  AppstoreOutlined,
  BranchesOutlined,
  ControlOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  RobotOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Row, Space, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';

const managementSections = [
  {
    key: 'agent',
    title: '智能体',
    description: '能力、提示词、策略和发布版本。',
    path: '/agent',
    icon: <RobotOutlined />,
    tag: '能力',
  },
  {
    key: 'apps',
    title: '应用',
    description: '开放 API、密钥、配额和用量。',
    path: '/apps',
    icon: <ApiOutlined />,
    tag: '网关',
  },
  {
    key: 'model',
    title: '模型',
    description: '模型资源、模块绑定和回退策略。',
    path: '/model-center',
    icon: <ExperimentOutlined />,
    tag: '调度',
  },
  {
    key: 'database',
    title: '数据',
    description: '数据库、连接、健康状态和轻绑定。',
    path: '/database-manager',
    icon: <DatabaseOutlined />,
    tag: '存储',
  },
  {
    key: 'settings',
    title: '系统',
    description: '运行参数、发布策略和底座配置。',
    path: '/settings',
    icon: <SettingOutlined />,
    tag: '设置',
  },
  {
    key: 'workflows',
    title: '任务链路',
    description: '分析、检索和写作的高级入口。',
    path: '/workbench',
    icon: <BranchesOutlined />,
    tag: '流程',
  },
];

function ManagePage() {
  const navigate = useNavigate();

  return (
    <div className="ap-manage">
      <div className="ap-manage__header">
        <div>
          <div className="ap-manage__eyebrow">
            <ControlOutlined />
            管理
          </div>
          <h1>平台能力</h1>
        </div>
        <Button type="primary" shape="round" icon={<AppstoreOutlined />} onClick={() => navigate('/home')}>
          回到工作台
        </Button>
      </div>

      <Row gutter={[18, 18]}>
        {managementSections.map((item) => (
          <Col xs={24} md={12} xl={8} key={item.key}>
            <Card className="ap-manage-card" bordered={false} onClick={() => navigate(item.path)}>
              <div className="ap-manage-card__icon">{item.icon}</div>
              <div className="ap-manage-card__content">
                <Space size={8} align="center">
                  <h2>{item.title}</h2>
                  <Tag>{item.tag}</Tag>
                </Space>
                <p>{item.description}</p>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}

export default ManagePage;
