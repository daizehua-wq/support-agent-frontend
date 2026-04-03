import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Button, Card, Form, Input, Select, Space, message } from 'antd';

import EmptyBlock from '../../components/common/EmptyBlock';
import PageHeader from '../../components/common/PageHeader';
import ResultCard from '../../components/common/ResultCard';

import {
  generateScript,
  mockGenerateScriptResponse,
  type GenerateScriptResponse,
} from '../../api/agent';

const { TextArea } = Input;

const stageOptions = [
  { label: '初步接触', value: 'initial_contact' },
  { label: '需求沟通', value: 'requirement_discussion' },
  { label: '样品推进', value: 'sample_followup' },
  { label: '报价沟通', value: 'quotation' },
  { label: '其他', value: 'other' },
];

const goalOptions = [
  { label: '首次回复', value: 'first_reply' },
  { label: '推进样品', value: 'sample_followup' },
  { label: '技术问题回复', value: 'technical_reply' },
  { label: '重新激活客户', value: 'reactivate' },
];

const toneOptions = [
  { label: '正式', value: 'formal' },
  { label: '简洁', value: 'concise' },
  { label: '口语', value: 'spoken' },
];

const exampleValues = {
  customerType: 'PCB客户',
  salesStage: 'requirement_discussion',
  communicationGoal: 'technical_reply',
  productDirection: '双氧水体系蚀刻液',
  concernPoints: '稳定性、线宽均匀性、成本控制',
  customerText: '我们比较关注稳定性和整体使用成本，能不能先看一下资料？',
  referenceSummary: '规格书中包含基础参数、适用场景和注意事项。',
  toneStyle: 'formal',
};

type ScriptResultData = NonNullable<typeof mockGenerateScriptResponse.data> & {
  llmVersion?: string;
  llmRoute?: string;
};

type GenerateScriptResponseLike =
  | GenerateScriptResponse
  | {
      data?: GenerateScriptResponse | ScriptResultData;
    };

function ScriptPage() {
  const [form] = Form.useForm();
  const [resultVisible, setResultVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scriptResult, setScriptResult] = useState<ScriptResultData | null>(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const location = useLocation();

  const handleGenerate = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      let response: GenerateScriptResponse;
      const payload = {
        customerType: values.customerType || '',
        salesStage: values.salesStage || 'other',
        communicationGoal: values.communicationGoal || 'first_reply',
        productDirection: values.productDirection || '',
        concernPoints: values.concernPoints || '',
        customerText: values.customerText || '',
        referenceSummary: values.referenceSummary || '',
        toneStyle: values.toneStyle || 'formal',
      };

      try {
        const rawResponse = (await generateScript(payload)) as GenerateScriptResponseLike;

        let normalizedData: ScriptResultData;

        if (
          rawResponse &&
          typeof rawResponse === 'object' &&
          'data' in rawResponse &&
          rawResponse.data &&
          typeof rawResponse.data === 'object' &&
          'data' in rawResponse.data
        ) {
          normalizedData = rawResponse.data.data as ScriptResultData;
        } else if (
          rawResponse &&
          typeof rawResponse === 'object' &&
          'data' in rawResponse
        ) {
          normalizedData = rawResponse.data as ScriptResultData;
        } else {
          normalizedData = rawResponse as ScriptResultData;
        }

        response = {
          success: true,
          message: '生成成功',
          data: normalizedData,
        } as GenerateScriptResponse;
      } catch (error) {
        console.error('话术生成真实接口调用失败：', error);
        message.error('真实接口调用失败，请查看浏览器控制台');
        setLoading(false);
        return;
      }

      if (response.success && response.data) {
        setScriptResult(response.data);
        setResultVisible(true);
        setShowDebugInfo(false);
        message.success('生成完成');
      } else {
        message.error(response.message || '生成失败');
      }
    } catch {
      message.warning('请先补充必填信息');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    form.resetFields();
    setResultVisible(false);
    setScriptResult(null);
    setShowDebugInfo(false);
  };

  const handleFillExample = () => {
    form.setFieldsValue(exampleValues);
  };

  useEffect(() => {
    const state = location.state as {
      customerText?: string;
      productDirection?: string;
      salesStage?: string;
      referenceSummary?: string;
    } | null;

    if (state) {
      form.setFieldsValue({
        customerText: state.customerText,
        productDirection: state.productDirection,
        salesStage: state.salesStage,
        referenceSummary: state.referenceSummary,
      });
    }
  }, [form, location.state]);

  return (
    <div>
      <PageHeader
        title="话术生成"
        description="输入客户信息，生成可直接用于沟通的正式版、简洁版与口语版话术。"
      />

      <Card style={{ borderRadius: 12 }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            communicationGoal: 'first_reply',
            toneStyle: 'formal',
            salesStage: 'other',
          }}
        >
          <Form.Item label="客户类型" name="customerType">
            <Input placeholder="例如：PCB客户、半导体客户" />
          </Form.Item>

          <Form.Item label="当前阶段" name="salesStage">
            <Select placeholder="请选择当前阶段" options={stageOptions} />
          </Form.Item>

          <Form.Item
            label="沟通目的"
            name="communicationGoal"
            rules={[{ required: true, message: '请选择沟通目的' }]}
          >
            <Select placeholder="请选择沟通目的" options={goalOptions} />
          </Form.Item>

          <Form.Item label="产品方向" name="productDirection">
            <Input placeholder="例如：双氧水体系蚀刻液" />
          </Form.Item>

          <Form.Item label="客户关注点" name="concernPoints">
            <TextArea placeholder="例如：稳定性、成本、线宽均匀性" rows={3} />
          </Form.Item>

          <Form.Item
            label="客户原话"
            name="customerText"
            rules={[{ required: true, message: '请输入客户原话' }]}
          >
            <TextArea placeholder="请输入客户原话" rows={5} />
          </Form.Item>

          <Form.Item label="参考资料摘要" name="referenceSummary">
            <TextArea placeholder="可填写资料摘要，用于辅助生成话术" rows={4} />
          </Form.Item>

          <Form.Item
            label="语气风格"
            name="toneStyle"
            rules={[{ required: true, message: '请选择语气风格' }]}
          >
            <Select placeholder="请选择语气风格" options={toneOptions} />
          </Form.Item>

          <Space wrap>
            <Button type="primary" onClick={handleGenerate} loading={loading}>
              开始生成
            </Button>
            <Button onClick={handleReset}>清空</Button>
            <Button onClick={handleFillExample}>载入示例</Button>
          </Space>
        </Form>
      </Card>

      {resultVisible ? (
        <div style={{ marginTop: 24 }}>
          <ResultCard title="正式版">
            <p>{scriptResult?.formalVersion || ''}</p>
          </ResultCard>

          <ResultCard title="简洁版">
            <p>{scriptResult?.conciseVersion || ''}</p>
          </ResultCard>

          <ResultCard title="口语版">
            <p>{scriptResult?.spokenVersion || ''}</p>
          </ResultCard>

          <ResultCard title="注意事项">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {(scriptResult?.cautionNotes || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </ResultCard>

          <div style={{ marginTop: 16 }}>
            <Button type="default" size="small" onClick={() => setShowDebugInfo(!showDebugInfo)}>
              {showDebugInfo ? '隐藏调试信息' : '查看调试信息'}
            </Button>
          </div>

          {showDebugInfo ? (
            <>
              <ResultCard title="模型路线">
                <p>{scriptResult?.llmRoute || '未返回 llmRoute'}</p>
              </ResultCard>

              <ResultCard title="LLM增强版">
                <p>{scriptResult?.llmVersion || '未返回 llmVersion'}</p>
              </ResultCard>

              <ResultCard title="调试数据">
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                  {JSON.stringify(scriptResult, null, 2)}
                </pre>
              </ResultCard>
            </>
          ) : null}
        </div>
      ) : (
        <div style={{ marginTop: 24 }}>
          <ResultCard title="生成结果">
            <EmptyBlock text="请填写信息并点击开始生成。" />
          </ResultCard>
        </div>
      )}
    </div>
  );
}

export default ScriptPage;
