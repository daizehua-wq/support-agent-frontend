import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  message,
} from 'antd';

import PageHeader from '../../components/common/PageHeader';
import { getAssistantCenterAssistants, type AssistantCenterListItem } from '../../api/assistantCenter';
import {
  runTaskWorkbench,
  type TaskWorkbenchMaterialItem,
  type TaskWorkbenchOutcome,
  type TaskWorkbenchResponseData,
} from '../../api/agent';
import { getSettings } from '../../api/settings';
import { getApiErrorMessage } from '../../utils/apiError';
import { buildContinueContext, buildContinueNavigationState } from '../../utils/sessionResume';

const outcomeOptions: Array<{ label: string; value: TaskWorkbenchOutcome }> = [
  { label: '自动识别', value: 'auto' },
  { label: '帮助判断', value: 'decision_support' },
  { label: '整理资料', value: 'material_preparation' },
  { label: '写参考文件', value: 'reference_document' },
];

type WorkbenchNavigationState = {
  initialTaskInput?: string;
  assistantId?: string;
  expectedOutcome?: TaskWorkbenchOutcome;
};

type WorkbenchFormValues = {
  assistantId?: string;
  expectedOutcome: TaskWorkbenchOutcome;
  taskInput: string;
  contextNote?: string;
  expectedDeliverable?: string;
};

function MaterialCard({ item }: { item: TaskWorkbenchMaterialItem }) {
  return (
    <Card size="small" style={{ height: '100%', borderRadius: 12 }}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space wrap>
          <strong>{item.title}</strong>
          <Tag color="blue">{item.type}</Tag>
        </Space>
        <div style={{ color: '#475569', lineHeight: 1.8 }}>
          {item.contentLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      </Space>
    </Card>
  );
}

export default function WorkbenchPage() {
  const [form] = Form.useForm<WorkbenchFormValues>();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationState = (location.state as WorkbenchNavigationState | null) || null;

  const [assistants, setAssistants] = useState<AssistantCenterListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<TaskWorkbenchResponseData | null>(null);

  const assistantOptions = useMemo(
    () =>
      assistants.map((item) => ({
        label: `${item.assistantName}${item.activeFlag ? '（当前激活）' : ''}`,
        value: item.assistantId,
      })),
    [assistants],
  );

  useEffect(() => {
    form.setFieldsValue({
      expectedOutcome: navigationState?.expectedOutcome || 'auto',
      taskInput: navigationState?.initialTaskInput || '',
      assistantId: navigationState?.assistantId,
    });
  }, [form, navigationState]);

  useEffect(() => {
    const loadBootstrap = async () => {
      try {
        setLoading(true);
        const [assistantResponse, settings] = await Promise.all([
          getAssistantCenterAssistants(),
          getSettings(),
        ]);

        const nextAssistants = assistantResponse.data?.items || [];
        const activeAssistantId =
          assistantResponse.data?.activeAssistantId ||
          settings.governanceSummary?.activeAssistantId ||
          nextAssistants.find((item) => item.activeFlag)?.assistantId ||
          nextAssistants[0]?.assistantId ||
          '';

        setAssistants(nextAssistants);

        if (!form.getFieldValue('assistantId') && activeAssistantId) {
          form.setFieldValue('assistantId', activeAssistantId);
        }
      } catch (error) {
        console.error('任务工作台初始化失败：', error);
        message.error(getApiErrorMessage(error, '任务工作台初始化失败'));
      } finally {
        setLoading(false);
      }
    };

    void loadBootstrap();
  }, [form]);

  const handleSubmit = async (values: WorkbenchFormValues) => {
    try {
      setSubmitting(true);
      const response = await runTaskWorkbench({
        assistantId: values.assistantId,
        expectedOutcome: values.expectedOutcome,
        taskInput: values.taskInput.trim(),
        contextNote: values.contextNote?.trim(),
        expectedDeliverable: values.expectedDeliverable?.trim(),
      });

      setResult(response.data || null);
      message.success(response.message || '任务识别成功');
    } catch (error) {
      console.error('任务工作台运行失败：', error);
      message.error(getApiErrorMessage(error, '任务识别失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinue = () => {
    if (!result?.routeRecommendation?.path) {
      return;
    }

    const continueContext = buildContinueContext({
      ...(result.continuePayload || {}),
      ...(result.routeRecommendation.continuePayload || {}),
      sessionId: crypto.randomUUID(),
      fromModule: 'workbench',
    });

    navigate(result.routeRecommendation.path, {
      state: buildContinueNavigationState({
        continueContext,
        carryPayload: result.routeRecommendation.carryPayload || {},
      }),
    });
  };

  return (
    <div>
      <PageHeader
        title="任务工作台"
        description="先输入任务，再让平台识别意图、匹配 Prompt，并把自然语言转成可执行的判断资料或参考文稿材料包。"
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 24, borderRadius: 12 }}
        message="这个入口是平台化的第一层"
        description="你不需要先决定自己要走哪个销售模块。先说任务，平台会给出识别结果、绑定的助手 Prompt、建议资料包和后续承接链路。"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card style={{ borderRadius: 12 }} title="统一任务输入">
            <Spin spinning={loading}>
              <Form<WorkbenchFormValues>
                form={form}
                layout="vertical"
                initialValues={{
                  expectedOutcome: 'auto',
                  taskInput: '',
                }}
                onFinish={handleSubmit}
              >
                <Form.Item name="assistantId" label="使用哪个助手">
                  <Select
                    allowClear
                    placeholder="默认使用当前激活助手"
                    options={assistantOptions}
                  />
                </Form.Item>

                <Form.Item name="expectedOutcome" label="期望产出">
                  <Select options={outcomeOptions} />
                </Form.Item>

                <Form.Item
                  name="taskInput"
                  label="任务输入"
                  rules={[{ required: true, message: '请输入任务内容' }]}
                >
                  <Input.TextArea
                    rows={7}
                    placeholder="例如：请帮我判断这个方案是否可推进，并整理出给老板汇报用的要点。"
                  />
                </Form.Item>

                <Form.Item name="contextNote" label="补充上下文">
                  <Input.TextArea
                    rows={4}
                    placeholder="补充背景、已有事实、约束条件、已有资料来源等。"
                  />
                </Form.Item>

                <Form.Item name="expectedDeliverable" label="希望最后得到什么">
                  <Input.TextArea
                    rows={3}
                    placeholder="例如：一页汇报提纲 / 参考邮件 / 判断建议 / 资料清单。"
                  />
                </Form.Item>

                <Space wrap>
                  <Button type="primary" htmlType="submit" loading={submitting}>
                    识别任务并生成材料包
                  </Button>
                  <Button
                    onClick={() => {
                      form.resetFields();
                      setResult(null);
                    }}
                  >
                    清空
                  </Button>
                </Space>
              </Form>
            </Spin>
          </Card>
        </Col>

        <Col xs={24} xl={14}>
          <Card style={{ borderRadius: 12 }} title="平台识别结果">
            {!result ? (
              <div style={{ color: '#64748B', lineHeight: 1.9 }}>
                提交任务后，这里会展示：
                <br />
                1. 平台识别出的任务类型和岗位提示
                <br />
                2. 本次命中的助手与 Prompt
                <br />
                3. 可直接复用的工作资料包
                <br />
                4. 推荐继续进入的执行链路
              </div>
            ) : (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Alert
                  type="success"
                  showIcon
                  message={result.recognizedTask.intentLabel}
                  description={result.recognizedTask.summary}
                />

                <Row gutter={[12, 12]}>
                  <Col xs={24} md={12}>
                    <Card size="small" style={{ borderRadius: 12 }}>
                      <div style={{ color: '#64748B', marginBottom: 8 }}>助手</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{result.assistant.assistantName || '未返回'}</div>
                      <div style={{ color: '#475569', marginTop: 8 }}>
                        {result.assistant.description || result.assistant.assistantId || '未返回'}
                      </div>
                    </Card>
                  </Col>
                  <Col xs={24} md={12}>
                    <Card size="small" style={{ borderRadius: 12 }}>
                      <div style={{ color: '#64748B', marginBottom: 8 }}>Prompt 绑定</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>
                        {result.promptBinding.promptName || result.promptBinding.moduleLabel}
                      </div>
                      <div style={{ color: '#475569', marginTop: 8 }}>
                        {result.promptBinding.promptVersion || '未标记版本'}
                      </div>
                    </Card>
                  </Col>
                </Row>

                <Card size="small" style={{ borderRadius: 12 }} title="任务结构化结果">
                  <Space wrap style={{ marginBottom: 12 }}>
                    <Tag color="blue">{result.recognizedTask.suggestedModuleLabel}</Tag>
                    <Tag color="green">
                      置信度 {Math.round((result.recognizedTask.confidence || 0) * 100)}%
                    </Tag>
                    {(result.recognizedTask.roleHints || []).map((item) => (
                      <Tag key={item.key}>{item.label}</Tag>
                    ))}
                  </Space>

                  <div style={{ color: '#475569', lineHeight: 1.9 }}>
                    <div>
                      <strong>推荐能力：</strong>
                      {result.recognizedTask.recommendedCapabilities.join(' / ')}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <strong>关键信息：</strong>
                      {result.recognizedTask.keyFacts.join('；') || '未识别'}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <strong>待补充：</strong>
                      {result.recognizedTask.missingInformation.join('；') || '当前没有明显缺口'}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <strong>Prompt 摘要：</strong>
                      {result.promptBinding.promptPreview || '当前 Prompt 未返回摘要'}
                    </div>
                  </div>
                </Card>

                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>工作资料包</div>
                  <Row gutter={[12, 12]}>
                    {result.materialPackage.map((item) => (
                      <Col xs={24} md={12} key={item.id}>
                        <MaterialCard item={item} />
                      </Col>
                    ))}
                  </Row>
                </div>

                <Card size="small" style={{ borderRadius: 12 }} title="下一步建议">
                  <div style={{ color: '#475569', lineHeight: 1.9 }}>
                    {result.nextActions.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>

                  <Space wrap style={{ marginTop: 16 }}>
                    <Button type="primary" onClick={handleContinue}>
                      {result.routeRecommendation.label}
                    </Button>
                    <Tag color="processing">
                      推荐链路：{result.routeRecommendation.moduleLabel}
                    </Tag>
                  </Space>
                </Card>
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
