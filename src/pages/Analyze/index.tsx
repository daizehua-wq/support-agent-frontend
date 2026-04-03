import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, Form, Input, Select, Space, message } from 'antd';

import PageHeader from '../../components/common/PageHeader';
import ResultCard from '../../components/common/ResultCard';
import {
  analyzeCustomer,
  type AnalyzeCustomerResponse,
} from '../../api/agent';

const { TextArea } = Input;

const industryOptions = [
  { label: 'PCB', value: 'pcb' },
  { label: '半导体', value: 'semiconductor' },
  { label: '显示面板', value: 'display' },
  { label: '其他', value: 'other' },
];

const stageOptions = [
  { label: '初步接触', value: 'initial_contact' },
  { label: '需求沟通', value: 'requirement_discussion' },
  { label: '样品推进', value: 'sample_followup' },
  { label: '报价沟通', value: 'quotation' },
  { label: '其他', value: 'other' },
];

const exampleValues = {
  customerName: '某PCB客户',
  industryType: 'pcb',
  salesStage: 'requirement_discussion',
  productDirection: '双氧水体系蚀刻液',
  customerText:
    '我们在评估双氧水体系蚀刻液，重点关注稳定性、线宽均匀性和整体成本控制。',
  remark: '客户倾向先了解资料，再决定是否安排样品测试。',
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type AnalyzeResultData = NonNullable<AnalyzeCustomerResponse['data']>;

function AnalyzePage() {
  const [form] = Form.useForm();
  const [resultVisible, setResultVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResultData | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      setLoading(true);
      await wait(800);

      const response = (await analyzeCustomer(values)) as unknown as AnalyzeCustomerResponse;

      if (response.success && response.data) {
        setAnalyzeResult(response.data);
        setResultVisible(true);
        message.success('分析完成');
      } else {
        message.error(response.message || '分析失败');
      }
    } catch {
      message.error('分析失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    form.resetFields();
    setResultVisible(false);
    setAnalyzeResult(null);
  };

  const handleFillExample = () => {
    form.setFieldsValue(exampleValues);
  };

  return (
    <div>
      <PageHeader
        title="客户分析"
        description="输入客户信息，快速形成需求判断、风险提示和下一步建议。"
      />

      <Card style={{ borderRadius: 12 }}>
        <Form form={form} layout="vertical">
          <Form.Item label="客户名称" name="customerName">
            <Input placeholder="请输入客户名称（可选）" />
          </Form.Item>

          <Form.Item label="所属行业" name="industryType">
            <Select placeholder="请选择所属行业" options={industryOptions} />
          </Form.Item>

          <Form.Item label="当前阶段" name="salesStage">
            <Select placeholder="请选择当前阶段" options={stageOptions} />
          </Form.Item>

          <Form.Item label="产品方向" name="productDirection">
            <Input placeholder="例如：双氧水体系蚀刻液" />
          </Form.Item>

          <Form.Item
            label="客户原话"
            name="customerText"
            rules={[{ required: true, message: '请输入客户原话' }]}
          >
            <TextArea
              placeholder="请输入客户原话"
              rows={6}
              showCount
              maxLength={1000}
            />
          </Form.Item>

          <Form.Item label="备注信息" name="remark">
            <TextArea placeholder="可填写背景、客户偏好或内部备注" rows={4} />
          </Form.Item>

          <Space wrap>
            <Button type="primary" onClick={handleSubmit} loading={loading}>
              开始分析
            </Button>
            <Button onClick={handleReset}>清空</Button>
            <Button onClick={handleFillExample}>载入示例</Button>
          </Space>
        </Form>
      </Card>

      {resultVisible ? (
        <div style={{ marginTop: 24 }}>
          <ResultCard title="需求摘要">
            <p>{analyzeResult?.summary || ''}</p>
          </ResultCard>

          <ResultCard title="场景判断">
            <p>{analyzeResult?.sceneJudgement || ''}</p>
          </ResultCard>

          <ResultCard title="推荐产品">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {(analyzeResult?.recommendedProducts || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </ResultCard>

          <ResultCard title="追问问题">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {(analyzeResult?.followupQuestions || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </ResultCard>

          <ResultCard title="风险提示">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {(analyzeResult?.riskNotes || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </ResultCard>

          <ResultCard title="下一步建议">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {(analyzeResult?.nextActions || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <div style={{ marginTop: 16 }}>
              <Space>
                <Button
                  size="small"
                  onClick={() =>
                    navigate('/search', {
                      state: {
                        keyword: form.getFieldValue('productDirection') || '双氧水体系蚀刻液',
                        industryType: form.getFieldValue('industryType'),
                      },
                    })
                  }
                >
                  带入资料检索
                </Button>

                <Button
                  size="small"
                  type="primary"
                  onClick={() =>
                    navigate('/script', {
                      state: {
                        customerText: form.getFieldValue('customerText'),
                        productDirection: form.getFieldValue('productDirection'),
                        salesStage: form.getFieldValue('salesStage'),
                        referenceSummary: analyzeResult?.summary || '',
                      },
                    })
                  }
                >
                  带入话术生成
                </Button>
              </Space>
            </div>
          </ResultCard>
        </div>
      ) : (
        <div style={{ marginTop: 24 }}>
          <ResultCard title="分析结果">
            <p style={{ margin: 0, color: '#8c8c8c' }}>请填写信息并点击开始分析。</p>
          </ResultCard>
        </div>
      )}
    </div>
  );
}

export default AnalyzePage;