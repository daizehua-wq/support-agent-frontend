import { useEffect, useState } from 'react';
import { Button, Card, Space, Spin, Tag, Typography, message } from 'antd';
import SettingsModuleShell from '../../../components/settings/SettingsModuleShell';
import * as settingsAdapter from '../../../utils/settingsCenterAdapter';
import { MOCK_RULES, MOCK_KNOWLEDGE, MOCK_STRATEGIES } from '../../../utils/mockSettingsModules';

function SettingsRulesPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [knowledgeSources, setKnowledgeSources] = useState<any[]>([]);
  const [strategyStates, setStrategyStates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true); setError(false);
    settingsAdapter.getRules().then((d) => {
      setRules(d.rules || MOCK_RULES);
      setKnowledgeSources(d.knowledgeSources || MOCK_KNOWLEDGE);
      setStrategyStates(d.strategyStates || MOCK_STRATEGIES);
    }).catch(() => setError(true)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) return <SettingsModuleShell title="规则与知识" description=""><div style={{textAlign:'center',padding:40}}><Spin /></div></SettingsModuleShell>;
  if (error) return <SettingsModuleShell title="规则与知识" description=""><div style={{textAlign:'center',padding:40}}><Typography.Text type="secondary">设置数据加载失败</Typography.Text><br/><Button style={{marginTop:12}} onClick={load}>重新加载</Button></div></SettingsModuleShell>;
  return (
    <SettingsModuleShell
      title="规则与知识"
      description="管理应用级规则、知识库摘要、Application Pack 绑定和策略启用状态。"
    >
      <Card size="small" style={{ borderRadius: 22, marginBottom: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>规则列表</Typography.Text>
        {rules.map((rule: any) => (
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
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>{rule.description}</Typography.Text>
            <Space size={4} style={{ marginTop: 2 }}>
              {rule.scope.map((s: string) => <Tag key={s} style={{ fontSize: 10 }}>{s}</Tag>)}
            </Space>
          </div>
        ))}
      </Card>

      <Card size="small" style={{ borderRadius: 22, marginBottom: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>知识库摘要</Typography.Text>
        {knowledgeSources.map((ks: any) => (
          <div key={ks.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(203,213,225,0.36)', fontSize: 13 }}>
            <span>{ks.name}</span>
            <span>
              <Tag color={ks.status === 'connected' ? 'green' : ks.status === 'degraded' ? 'orange' : 'default'} style={{ fontSize: 10 }}>{ks.status}</Tag>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>{ks.itemCount} 条</Typography.Text>
            </span>
          </div>
        ))}
      </Card>

      <Card size="small" style={{ borderRadius: 22 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>策略启用状态</Typography.Text>
        {strategyStates.map((s: any) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(203,213,225,0.36)', fontSize: 13 }}>
            <span>{s.label}</span>
            <Tag color={s.enabled ? 'green' : 'default'} style={{ fontSize: 10 }}>{s.enabled ? '启用' : '停用'}</Tag>
          </div>
        ))}
      </Card>
    </SettingsModuleShell>
  );
}

export default SettingsRulesPage;
