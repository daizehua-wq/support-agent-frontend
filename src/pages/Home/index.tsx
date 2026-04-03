import { Button, Card, Col, Row, Space, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';

import PageHeader from '../../components/common/PageHeader';

const quickEntries = [
  {
    key: 'analyze',
    title: '客户分析',
    description: '输入客户原话与当前阶段，快速判断需求方向、风险点和下一步动作。',
    path: '/analyze',
    buttonText: '开始客户分析',
    tag: '分析判断',
  },
  {
    key: 'search',
    title: '资料检索',
    description: '按关键词与行业场景检索资料，区分可外发资料与内部参考资料。',
    path: '/search',
    buttonText: '开始资料检索',
    tag: '资料支持',
  },
  {
    key: 'script',
    title: '话术生成',
    description: '基于客户场景与资料摘要，生成正式版、简洁版与口语版沟通话术。',
    path: '/script',
    buttonText: '开始话术生成',
    tag: '沟通辅助',
  },
];

const recommendedPath = ['1. 先做客户分析', '2. 再做资料检索', '3. 最后做话术生成'];

const versionNotes = [
  '当前版本以本地规则与本地模型为主。',
  '当前目标是验证主链路可用性。',
  '调试信息仅用于内部测试。',
];

function HomePage() {
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader
        title="销售支持 Agent"
        description="基于本地知识库与模型能力，辅助销售判断、资料检索与沟通话术生成。"
      />

      <div style={{ marginBottom: 16 }}>
        <Space wrap>
          <Tag color="blue">本地规则 + 本地模型</Tag>
          <Tag color="gold">测试版</Tag>
        </Space>
      </div>

      <Card style={{ marginBottom: 24, borderRadius: 12 }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#262626' }}>销售支持 Agent</div>
          <div style={{ fontSize: 15, color: '#595959', lineHeight: 1.8 }}>
            面向销售团队的内部测试版工作台，用于客户分析、资料检索和话术生成。
          </div>
        </Space>
      </Card>

      <Card title="功能入口" style={{ marginBottom: 24, borderRadius: 12 }}>
        <Row gutter={[16, 16]}>
          {quickEntries.map((item) => (
            <Col xs={24} md={8} key={item.key}>
              <Card style={{ height: '100%', borderRadius: 10 }} bodyStyle={{ height: '100%' }}>
                <Space direction="vertical" size={14} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 17 }}>{item.title}</strong>
                    <Tag color="blue">{item.tag}</Tag>
                  </div>
                  <div style={{ color: '#595959', fontSize: 14, lineHeight: 1.8, minHeight: 66 }}>
                    {item.description}
                  </div>
                  <Button type="primary" block onClick={() => navigate(item.path)}>
                    {item.buttonText}
                  </Button>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title="推荐测试路径" style={{ height: '100%', borderRadius: 12 }}>
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              {recommendedPath.map((item) => (
                <div key={item} style={{ fontSize: 14, color: '#262626' }}>
                  {item}
                </div>
              ))}
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="当前版本说明" style={{ height: '100%', borderRadius: 12 }}>
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              {versionNotes.map((item) => (
                <div key={item} style={{ fontSize: 14, color: '#262626' }}>
                  {item}
                </div>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default HomePage;