import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button, Card, Form, Input, Select, Space, Switch, Tag, message } from 'antd';

import EmptyBlock from '../../components/common/EmptyBlock';
import PageHeader from '../../components/common/PageHeader';
import ResultCard from '../../components/common/ResultCard';

import {
  mockSearchDocumentsResponse,
  searchDocuments,
  type SearchDocumentsResponse,
} from '../../api/agent';

const docTypeOptions = [
  { label: '规格书', value: 'spec' },
  { label: 'FAQ', value: 'faq' },
  { label: '案例资料', value: 'case' },
  { label: '项目资料', value: 'project' },
];

const industryOptions = [
  { label: 'PCB', value: 'pcb' },
  { label: '半导体', value: 'semiconductor' },
  { label: '显示面板', value: 'display' },
  { label: '其他', value: 'other' },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type SearchResultData = NonNullable<SearchDocumentsResponse['data']>;

function SearchPage() {
  const [form] = Form.useForm();
  const [resultVisible, setResultVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResultData>([]);
  const location = useLocation();
  const navigate = useNavigate();

  const handleSearch = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await wait(800);

      let response: SearchDocumentsResponse;

      try {
        response = (await searchDocuments(values)) as unknown as SearchDocumentsResponse;
        console.log('资料检索真实接口返回：', response);
      } catch (error) {
        console.warn('真实接口暂不可用，回退到 mock 数据：', error);
        response = mockSearchDocumentsResponse;
      }

      if (response.success && response.data) {
        setSearchResult(response.data);
        setResultVisible(true);
        message.success('检索完成');
      } else {
        message.error(response.message || '检索失败');
      }
    } catch {
      message.warning('请先输入检索关键词');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    form.resetFields();
    setResultVisible(false);
    setSearchResult([]);
  };

  useEffect(() => {
    const state = location.state as { keyword?: string; industryType?: string } | null;

    if (state?.keyword || state?.industryType) {
      form.setFieldsValue({
        keyword: state.keyword,
        industryType: state.industryType,
      });
    }
  }, [form, location.state]);

  return (
    <div>
      <PageHeader
        title="资料检索"
        description="按关键词与行业场景检索资料，区分可外发资料与内部参考资料。"
      />

      <Card>
        <Form form={form} layout="vertical">
          <Form.Item
            label="检索关键词"
            name="keyword"
            rules={[{ required: true, message: '请输入检索关键词' }]}
          >
            <Input placeholder="例如：双氧水体系蚀刻液、电子级双氧水" />
          </Form.Item>

          <Form.Item label="资料类型" name="docType">
            <Select placeholder="请选择资料类型" options={docTypeOptions} />
          </Form.Item>

          <Form.Item label="所属行业" name="industryType">
            <Select placeholder="请选择所属行业" options={industryOptions} />
          </Form.Item>

          <Form.Item label="只看可外发资料" name="onlyExternalAvailable" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Space>
            <Button type="primary" onClick={handleSearch} loading={loading}>
              开始检索
            </Button>
            <Button onClick={handleReset}>清空</Button>
          </Space>
        </Form>
      </Card>

      {resultVisible ? (
        <div style={{ marginTop: 24 }}>
          {searchResult.map((doc) => (
            <ResultCard
              key={doc.id}
              title={doc.docName}
              extra={
                <Space>
                  {doc.externalAvailable ? (
                    <Tag color="green">可外发</Tag>
                  ) : (
                    <Tag color="orange">仅内部参考</Tag>
                  )}
                  <Button
                    size="small"
                    onClick={() =>
                      navigate('/script', {
                        state: {
                          productDirection: form.getFieldValue('keyword') || doc.docName,
                          referenceSummary: doc.summaryText,
                        },
                      })
                    }
                  >
                    带入话术生成
                  </Button>
                </Space>
              }
            >
              <p>
                <strong>资料类型：</strong>
                {doc.docType}
              </p>
              <p>
                <strong>摘要：</strong>
                {doc.summaryText}
              </p>
              <p>
                <strong>适用场景：</strong>
                {doc.applicableScene}
              </p>
              <p>
                <strong>是否可外发：</strong>
                {doc.externalAvailable ? '是' : '否'}
              </p>
            </ResultCard>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 24 }}>
          <ResultCard title="检索结果">
            <EmptyBlock text="请输入关键词并点击开始检索。" />
          </ResultCard>
        </div>
      )}
    </div>
  );
}

export default SearchPage;
