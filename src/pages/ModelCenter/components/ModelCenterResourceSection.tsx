import { Button, Card, Col, Empty, Form, Input, List, Popconfirm, Row, Space } from 'antd';
import type { FormInstance } from 'antd';

import type { ModelCenterDetail, ModelCenterListItem } from '../../../api/modelCenter';
import { getModelItemId, getProviderTag, getStatusTag } from '../helpers';
import FieldRow from './FieldRow';

type LatestTestFeedback = {
  status: string;
  message: string;
  modelName: string;
  testedAt: string;
} | null;

type ModelCenterResourceSectionProps = {
  modelList: ModelCenterListItem[];
  listLoading: boolean;
  selectedModelId: string;
  selectedModel: ModelCenterListItem | ModelCenterDetail | undefined | null;
  selectedModelDetail: ModelCenterDetail | null;
  detailLoading: boolean;
  editForm: FormInstance;
  saving: boolean;
  deleting: boolean;
  settingDefault: boolean;
  latestTestFeedback: LatestTestFeedback;
  onSelectModel: (modelId: string) => void;
  onSave: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
};

function ModelCenterResourceSection({
  modelList,
  listLoading,
  selectedModelId,
  selectedModel,
  selectedModelDetail,
  detailLoading,
  editForm,
  saving,
  deleting,
  settingDefault,
  latestTestFeedback,
  onSelectModel,
  onSave,
  onSetDefault,
  onDelete,
}: ModelCenterResourceSectionProps) {
  return (
    <>
      <Card title="资源管理层" style={{ marginBottom: 24, borderRadius: 12 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={8}>
            <Card size="small" title="模型列表" style={{ borderRadius: 12, background: '#FAFAFA' }}>
              <List
                dataSource={modelList}
                loading={listLoading}
                renderItem={(item) => (
                  <List.Item
                    onClick={() => onSelectModel(getModelItemId(item))}
                    style={{
                      cursor: 'pointer',
                      padding: '12px 8px',
                      borderRadius: 10,
                      marginBottom: 8,
                      background:
                        getModelItemId(item) === selectedModelId ? 'rgba(37,99,235,0.08)' : '#FFFFFF',
                      border:
                        getModelItemId(item) === selectedModelId
                          ? '1px solid #2563EB'
                          : '1px solid #E2E8F0',
                    }}
                  >
                    <div style={{ width: '100%' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 6,
                        }}
                      >
                        <strong style={{ color: '#1E293B' }}>{item.name || item.modelName}</strong>
                        {getStatusTag(item.status)}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>{getModelItemId(item)}</div>
                      <div style={{ marginTop: 6 }}>{getProviderTag(item.provider)}</div>
                    </div>
                  </List.Item>
                )}
              />
            </Card>
          </Col>

          <Col xs={24} lg={16}>
            <Card size="small" title="模型详情摘要" loading={detailLoading} style={{ borderRadius: 12 }}>
              {selectedModelDetail ? (
                <>
                  <FieldRow label="模型 ID" value={getModelItemId(selectedModelDetail)} />
                  <FieldRow label="当前状态" value={getStatusTag(String(selectedModelDetail.status || ''))} />
                  <FieldRow label="当前版本" value={String(selectedModelDetail.version || '-')} />
                  <FieldRow label="默认模型" value={selectedModelDetail.defaultFlag ? '是' : '否'} />
                  <Form form={editForm} layout="vertical" style={{ marginTop: 12 }}>
                    <Form.Item
                      label="展示名称"
                      name="name"
                      rules={[{ required: true, message: '请输入展示名称' }]}
                    >
                      <Input placeholder="请输入展示名称" />
                    </Form.Item>
                    <Form.Item
                      label="Provider"
                      name="provider"
                      rules={[{ required: true, message: '请输入 Provider' }]}
                    >
                      <Input placeholder="如 local / api" />
                    </Form.Item>
                    <Form.Item
                      label="模型名称"
                      name="modelName"
                      rules={[{ required: true, message: '请输入模型名称' }]}
                    >
                      <Input placeholder="请输入模型名称" />
                    </Form.Item>
                    <Form.Item label="Base URL" name="baseUrl">
                      <Input placeholder="请输入 Base URL" />
                    </Form.Item>
                    <Form.Item label="说明" name="description">
                      <Input.TextArea rows={3} placeholder="请输入模型说明" />
                    </Form.Item>
                  </Form>
                  <Space>
                    <Button type="primary" loading={saving} onClick={onSave}>
                      保存模型
                    </Button>
                    <Button
                      loading={settingDefault}
                      disabled={!!selectedModelDetail.defaultFlag}
                      onClick={onSetDefault}
                    >
                      设为默认模型
                    </Button>
                    <Popconfirm
                      title="确认删除当前模型吗？"
                      okText="确认"
                      cancelText="取消"
                      onConfirm={onDelete}
                    >
                      <Button danger loading={deleting}>
                        删除模型
                      </Button>
                    </Popconfirm>
                  </Space>
                </>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无模型详情" />
              )}
            </Card>
          </Col>
        </Row>
      </Card>

      <Card title="测试结果次级区" style={{ borderRadius: 12 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card size="small" title="最近测试结果" style={{ borderRadius: 12, background: '#FAFAFA' }}>
              <FieldRow label="测试状态" value={latestTestFeedback?.status || '-'} />
              <FieldRow
                label="目标模型"
                value={
                  latestTestFeedback?.modelName ||
                  (selectedModel ? selectedModel.name || selectedModel.modelName : '-')
                }
              />
              <FieldRow label="时间" value={latestTestFeedback?.testedAt || '-'} />
            </Card>
          </Col>

          <Col xs={24} md={16}>
            <Card size="small" title="测试反馈说明" style={{ borderRadius: 12, background: '#FAFAFA' }}>
              <div style={{ color: '#595959', lineHeight: 1.8 }}>
                {latestTestFeedback?.message || '暂无测试反馈说明'}
              </div>
            </Card>
          </Col>
        </Row>
      </Card>
    </>
  );
}

export default ModelCenterResourceSection;
