import { Card, Space, Tag, Typography, Button, message } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { MOCK_RULES, MOCK_KNOWLEDGE, MOCK_APP_PACKS, MOCK_STRATEGIES } from '../../../utils/mockSettingsModules';

function SettingsRulesPage() {

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          <SafetyCertificateOutlined style={{ marginRight: 10 }} />
          规则与知识
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 14 }}>
          管理应用级规则、知识库摘要、Application Pack 绑定和策略启用状态。
        </Typography.Paragraph>
      </div>

      {/* Rules */}
      <Card size="small" style={{ borderRadius: 22, marginBottom: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>规则列表</Typography.Text>
        {MOCK_RULES.map((rule) => (
          <div key={rule.id} className="ap-rule-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
              <div>
                <Typography.Text strong style={{ fontSize: 13 }}>{rule.name}</Typography.Text>
                <Tag color={rule.status === 'enabled' ? 'green' : 'default'} style={{ fontSize: 10, marginLeft: 6 }}>
                  {rule.status === 'enabled' ? '启用' : '停用'}
                </Tag>
              </div>
              <Space size={4}>
                <Button size="small" onClick={() => message.info('查看规则详情')}>查看</Button>
                <Button size="small" onClick={() => message.info('编辑规则功能将在后续版本开放。')}>编辑</Button>
                <Button size="small" onClick={() => message.info('切换规则状态功能将在后续版本开放。')}>
                  {rule.status === 'enabled' ? '停用' : '启用'}
                </Button>
              </Space>
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
              {rule.description}
            </Typography.Text>
            <Space size={4} style={{ marginTop: 4 }}>
              {rule.scope.map((s) => <Tag key={s} style={{ fontSize: 10 }}>{s}</Tag>)}
            </Space>
            <Typography.Text type="secondary" style={{ fontSize: 10 }}>{rule.updatedAt}</Typography.Text>
          </div>
        ))}
      </Card>

      {/* Knowledge */}
      <Card size="small" style={{ borderRadius: 22, marginBottom: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>知识库摘要</Typography.Text>
        {MOCK_KNOWLEDGE.map((ks) => (
          <div key={ks.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(203,213,225,0.36)', fontSize: 13 }}>
            <span>{ks.name}</span>
            <span>
              <Tag color={ks.status === 'connected' ? 'green' : ks.status === 'degraded' ? 'orange' : 'default'} style={{ fontSize: 10 }}>
                {ks.status}
              </Tag>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>{ks.itemCount} 条 · {ks.updatedAt}</Typography.Text>
            </span>
          </div>
        ))}
      </Card>

      {/* Application Pack Bindings */}
      <Card size="small" style={{ borderRadius: 22, marginBottom: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>Application Pack 绑定</Typography.Text>
        {MOCK_APP_PACKS.map((ap) => (
          <div key={ap.id} className="ap-rule-card">
            <Typography.Text strong style={{ fontSize: 13 }}>{ap.label}</Typography.Text>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>Assistant: {ap.assistantName}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>数据源: {ap.dataSourceName}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>规则: {ap.ruleName}</Typography.Text>
              <Tag color={ap.status === 'active' ? 'green' : 'default'} style={{ fontSize: 10 }}>{ap.status === 'active' ? '活跃' : '停用'}</Tag>
            </div>
          </div>
        ))}
      </Card>

      {/* Strategy Toggles */}
      <Card size="small" style={{ borderRadius: 22 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>策略启用状态</Typography.Text>
        {MOCK_STRATEGIES.map((s) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(203,213,225,0.36)', fontSize: 13 }}>
            <span>{s.label}</span>
            <Tag color={s.enabled ? 'green' : 'default'} style={{ fontSize: 10 }}>{s.enabled ? '启用' : '停用'}</Tag>
          </div>
        ))}
      </Card>
    </div>
  );
}

export default SettingsRulesPage;
