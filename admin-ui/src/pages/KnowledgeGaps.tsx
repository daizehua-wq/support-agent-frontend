import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import {
  createKnowledgeRule,
  fetchKnowledgeGaps,
  type KnowledgeGap,
} from '../api/admin';

type FilterForm = {
  start?: string;
  end?: string;
};

type RuleForm = {
  domainType: string;
  topic?: string;
  workflowStage?: string;
  keywords?: string;
  scenario?: string;
  suggestions?: string;
  riskNotes?: string;
};

const getGapQuery = (record?: KnowledgeGap) => record?.userQuery || record?.user_query || '';

const getMatchedRuleCount = (record?: KnowledgeGap) =>
  Number(record?.matchedRuleCount ?? record?.matched_rule_count ?? 0);

const parseKeywords = (value = '') =>
  value
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const parseJsonLike = (value = ''): unknown => {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
};

const buildKeywordsFromGap = (query = '') => {
  return query
    .replace(/[，。！？、,.!?]/g, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 8)
    .join('，');
};

function KnowledgeGaps() {
  const navigate = useNavigate();
  const [filterForm] = Form.useForm<FilterForm>();
  const [ruleForm] = Form.useForm<RuleForm>();
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [targetGap, setTargetGap] = useState<KnowledgeGap | null>(null);

  const loadGaps = useCallback(async () => {
    const filters = filterForm.getFieldsValue();

    try {
      setLoading(true);
      setGaps(
        await fetchKnowledgeGaps({
          start: filters.start,
          end: filters.end,
          limit: 100,
        }),
      );
    } catch (error) {
      console.error('knowledge gaps load failed:', error);
      message.error('知识缺口加载失败');
    } finally {
      setLoading(false);
    }
  }, [filterForm]);

  const openRuleModal = (record: KnowledgeGap) => {
    const query = getGapQuery(record);
    setTargetGap(record);
    ruleForm.setFieldsValue({
      domainType: 'general',
      topic: 'knowledge_gap',
      workflowStage: 'analyze',
      keywords: buildKeywordsFromGap(query),
      scenario: '知识缺口补齐',
      suggestions: JSON.stringify(
        {
          summaryTemplate: `针对“${query.slice(0, 60)}”补充判断建议。`,
          followupQuestions: ['需要补充哪些业务字段？', '需要接入哪个外部或内部数据源？'],
          nextActions: ['补充规则命中条件', '完善证据来源', '验证前端分析链路'],
        },
        null,
        2,
      ),
      riskNotes: JSON.stringify(['该规则来自知识缺口转化，生效前建议人工复核。'], null, 2),
    });
  };

  const saveRule = async () => {
    const values = await ruleForm.validateFields();

    setSaving(true);
    try {
      await createKnowledgeRule({
        domainType: values.domainType,
        topic: values.topic,
        workflowStage: values.workflowStage,
        keywords: parseKeywords(values.keywords || ''),
        scenario: values.scenario,
        suggestions: parseJsonLike(values.suggestions || ''),
        riskNotes: parseJsonLike(values.riskNotes || ''),
      });
      setTargetGap(null);
      message.success('知识规则已创建');
      navigate('/knowledge');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<KnowledgeGap> = [
    {
      title: '用户查询',
      key: 'userQuery',
      render: (_, record) => getGapQuery(record),
    },
    {
      title: '匹配规则数',
      key: 'matchedRuleCount',
      width: 120,
      render: (_, record) => getMatchedRuleCount(record),
    },
    {
      title: '时间',
      key: 'createdAt',
      width: 180,
      render: (_, record) => record.createdAt || record.created_at || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 128,
      render: (_, record) => (
        <Button type="link" onClick={() => openRuleModal(record)}>
          转为规则
        </Button>
      ),
    },
  ];

  useEffect(() => {
    void loadGaps();
  }, [loadGaps]);

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2} style={{ marginBottom: 4 }}>
          知识缺口
        </Typography.Title>
        <Typography.Text type="secondary">
          汇总用户提出但知识规则未覆盖的问题，作为 P5 后续自动装配和规则补齐的输入。
        </Typography.Text>
      </div>

      <Card>
        <Form form={filterForm} layout="inline" onFinish={() => void loadGaps()}>
          <Form.Item label="开始日期" name="start">
            <Input placeholder="YYYY-MM-DD" allowClear />
          </Form.Item>
          <Form.Item label="结束日期" name="end">
            <Input placeholder="YYYY-MM-DD" allowClear />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                查询
              </Button>
              <Button
                onClick={() => {
                  filterForm.resetFields();
                  void loadGaps();
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={gaps}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: '暂无知识缺口记录' }}
        />
      </Card>

      <Modal
        title="转为知识规则"
        open={Boolean(targetGap)}
        onOk={() => void saveRule()}
        onCancel={() => setTargetGap(null)}
        confirmLoading={saving}
        width={720}
      >
        <Form form={ruleForm} layout="vertical">
          <Form.Item label="领域" name="domainType" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="主题" name="topic">
            <Input />
          </Form.Item>
          <Form.Item label="工作流阶段" name="workflowStage">
            <Input />
          </Form.Item>
          <Form.Item label="关键词" name="keywords">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="场景" name="scenario">
            <Input />
          </Form.Item>
          <Form.Item label="建议 JSON / 文本" name="suggestions">
            <Input.TextArea rows={7} />
          </Form.Item>
          <Form.Item label="风险提示 JSON / 文本" name="riskNotes">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

export default KnowledgeGaps;
