import { useEffect, useState } from 'react';
import { Alert, Button, Card, Input, Space, Tag, Typography, message } from 'antd';
import { fetchRules, updateRules } from '../api/admin';

function Rules() {
  const [rules, setRules] = useState('');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadRules = async () => {
    try {
      setLoading(true);
      const result = await fetchRules();
      setRules(result.rules || '{}');
      setSource(result.source || '');
      setStatus(result.status || '');
    } catch (error) {
      console.error('rules load failed:', error);
      message.error('安全规则加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      JSON.parse(rules);
    } catch (error) {
      message.error(error instanceof Error ? `JSON 格式错误：${error.message}` : 'JSON 格式错误');
      return;
    }

    try {
      setSaving(true);
      const result = await updateRules(rules);
      setRules(result.rules || rules);
      setStatus(result.status || 'active');
      message.success('规则已保存，下一次请求生效');
    } catch (error) {
      console.error('rules save failed:', error);
      message.error('安全规则保存失败');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    void loadRules();
  }, []);

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2} style={{ marginBottom: 4 }}>
          安全规则
        </Typography.Title>
        <Typography.Text type="secondary">
          编辑运行时读取的规则 JSON。保存后写入内部数据文件，下一次请求会读取新规则。
        </Typography.Text>
      </div>

      <Alert
        type="info"
        showIcon
        message="规则编辑只通过 /internal/rules 进行"
        description="请保持 JSON 结构合法。建议上线前先在测试环境验证规则命中效果。"
      />

      <Card
        loading={loading}
        title={
          <Space>
            <span>rules.json</span>
            {source ? <Tag>{source}</Tag> : null}
            {status ? <Tag color="green">{status}</Tag> : null}
          </Space>
        }
        extra={
          <Space>
            <Button onClick={() => void loadRules()}>重新加载</Button>
            <Button type="primary" loading={saving} onClick={() => void handleSave()}>
              保存规则
            </Button>
          </Space>
        }
      >
        <Input.TextArea
          value={rules}
          onChange={(event) => setRules(event.target.value)}
          rows={28}
          spellCheck={false}
          style={{
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        />
      </Card>
    </Space>
  );
}

export default Rules;
