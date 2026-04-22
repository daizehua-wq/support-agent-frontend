import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  List,
  Row,
  Select,
  Space,
  Tag,
} from 'antd';
import type { FormInstance } from 'antd';

import type {
  GovernanceAuditFieldChange,
  SettingsGovernanceAuditEntry,
  SettingsGovernanceHistoryData,
  SettingsGovernanceOverviewData,
  SettingsGovernanceVersionSummary,
} from '../../../api/settings';

type SettingsGovernanceSectionProps = {
  governanceForm: FormInstance;
  overview: SettingsGovernanceOverviewData | null;
  history: SettingsGovernanceHistoryData | null;
  refreshing: boolean;
  publishing: boolean;
  rollingBack: boolean;
  onRefresh: () => void;
  onPublish: () => void;
  onRollback: () => void;
};

const roleOptions = [
  { label: 'platform-owner', value: 'platform-owner' },
  { label: 'release-manager', value: 'release-manager' },
  { label: 'config-editor', value: 'config-editor' },
  { label: 'auditor', value: 'auditor' },
  { label: 'viewer', value: 'viewer' },
];

const versionStatusColorMap = {
  draft: 'default',
  published: 'green',
  superseded: 'gold',
  archived: 'default',
} as const;

const actionColorMap = {
  'settings.save': 'blue',
  'settings.publish': 'green',
  'settings.rollback': 'orange',
} as const;

const resolveVersionStatusTag = (status = '') => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const color =
    versionStatusColorMap[normalizedStatus as keyof typeof versionStatusColorMap] || 'default';
  return <Tag color={color}>{normalizedStatus || 'unknown'}</Tag>;
};

const resolveActionTag = (action = '') => {
  const normalizedAction = String(action || '').trim().toLowerCase();
  const color = actionColorMap[normalizedAction as keyof typeof actionColorMap] || 'default';
  return <Tag color={color}>{normalizedAction || 'unknown'}</Tag>;
};

const buildVersionLabel = (version: SettingsGovernanceVersionSummary) => {
  const versionId = version.versionId || `v${version.versionNumber || '-'}`;
  const releaseLabel = version.releaseId ? ` / ${version.releaseId}` : '';
  const changedFieldCount = Number(version.summary?.changedFieldCount || 0) || 0;
  return `${versionId}${releaseLabel} / 变更字段 ${changedFieldCount}`;
};

const normalizeVersionList = (history: SettingsGovernanceHistoryData | null) => {
  return (history?.versions || []).slice();
};

const normalizeAuditList = (history: SettingsGovernanceHistoryData | null) => {
  return (history?.audits || []).slice();
};

type DiffDrawerRecordType = 'version' | 'audit';

type DiffDrawerPayload = {
  type: DiffDrawerRecordType;
  sourceId: string;
  createdAt?: string;
  actorId?: string;
  role?: string;
  action?: string;
  summary?: string;
  fromVersionId?: string;
  toVersionId?: string;
  releaseId?: string;
  changeTicket?: string;
  traceId?: string;
  changedFieldCount?: number;
  changedFields: GovernanceAuditFieldChange[];
};

const formatDiffValue = (value?: string) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return '（空）';
  }
  return String(value);
};

function SettingsGovernanceSection({
  governanceForm,
  overview,
  history,
  refreshing,
  publishing,
  rollingBack,
  onRefresh,
  onPublish,
  onRollback,
}: SettingsGovernanceSectionProps) {
  const [diffDrawerPayload, setDiffDrawerPayload] = useState<DiffDrawerPayload | null>(null);

  const versions = normalizeVersionList(history);
  const audits = normalizeAuditList(history);
  const releaseVersionOptions = versions.map((item) => ({
    label: buildVersionLabel(item),
    value: item.versionId,
  }));
  const drawerChangedFields = useMemo(
    () => diffDrawerPayload?.changedFields || [],
    [diffDrawerPayload],
  );

  const activeVersionId = overview?.tenant?.pointers?.activeVersionId || '未返回';
  const publishedVersionId = overview?.tenant?.pointers?.publishedVersionId || '未返回';
  const previousPublishedVersionId =
    overview?.tenant?.pointers?.previousPublishedVersionId || '未返回';

  const openVersionDiffDrawer = (item: SettingsGovernanceVersionSummary) => {
    const changedFields = item.summary?.changedFields || [];
    const fallbackVersionId = item.versionId || `v${item.versionNumber || '-'}`;
    setDiffDrawerPayload({
      type: 'version',
      sourceId: fallbackVersionId,
      createdAt: item.createdAt || undefined,
      actorId: item.createdBy?.actorId,
      role: item.createdBy?.role,
      action: item.sourceAction,
      summary: item.summary?.reason || '配置版本变更',
      fromVersionId: item.parentVersionId,
      toVersionId: fallbackVersionId,
      releaseId: item.releaseId,
      changeTicket: item.changeTicket,
      traceId: item.traceId,
      changedFieldCount: Number(item.summary?.changedFieldCount || changedFields.length || 0),
      changedFields,
    });
  };

  const openAuditDiffDrawer = (item: SettingsGovernanceAuditEntry) => {
    const changedFields = item.changedFields || [];
    setDiffDrawerPayload({
      type: 'audit',
      sourceId: item.id || 'audit-unknown',
      createdAt: item.createdAt || undefined,
      actorId: item.actorId,
      role: item.role,
      action: item.action,
      summary: item.summary || '配置治理审计事件',
      fromVersionId: item.fromVersionId,
      toVersionId: item.toVersionId,
      changeTicket: item.changeTicket,
      traceId: item.traceId,
      changedFieldCount: Number(item.changedFieldCount || changedFields.length || 0),
      changedFields,
    });
  };

  return (
    <Card title="配置治理发布 / 回滚 / 历史" style={{ marginBottom: 24, borderRadius: 12 }}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="治理链路说明"
          description="此区用于配置发布、回滚和历史追溯。每次配置变更都会形成版本记录，并写入审计日志。"
        />

        <Form
          form={governanceForm}
          layout="vertical"
          initialValues={{
            tenantId: 'default',
            role: 'platform-owner',
            actorId: 'settings-page-operator',
            changeTicket: '',
            releaseVersionId: '',
            rollbackTargetVersionId: '',
          }}
        >
          <Row gutter={[16, 0]}>
            <Col xs={24} md={6}>
              <Form.Item
                label="租户 ID"
                name="tenantId"
                rules={[{ required: true, message: '请输入租户 ID' }]}
              >
                <Input placeholder="default" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item
                label="角色"
                name="role"
                rules={[{ required: true, message: '请选择角色' }]}
              >
                <Select options={roleOptions} placeholder="请选择角色" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item
                label="操作人"
                name="actorId"
                rules={[{ required: true, message: '请输入操作人 ID' }]}
              >
                <Input placeholder="settings-page-operator" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="变更工单号" name="changeTicket">
                <Input placeholder="CHG-20260416-001" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item label="发布目标版本" name="releaseVersionId">
                <Select
                  allowClear
                  options={releaseVersionOptions}
                  placeholder="不选则发布当前 active 版本"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="回滚目标版本" name="rollbackTargetVersionId">
                <Select
                  allowClear
                  options={releaseVersionOptions}
                  placeholder="不选则回滚到上一已发布版本"
                />
              </Form.Item>
            </Col>
          </Row>

          <Space wrap>
            <Button loading={refreshing} onClick={onRefresh}>
              刷新治理状态
            </Button>
            <Button type="primary" loading={publishing} onClick={onPublish}>
              发布版本
            </Button>
            <Button danger loading={rollingBack} onClick={onRollback}>
              回滚
            </Button>
          </Space>
        </Form>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card size="small" title="当前 Active 版本" style={{ borderRadius: 12, background: '#fafafa' }}>
              <div style={{ color: '#595959', lineHeight: 1.8 }}>{activeVersionId}</div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" title="当前 Published 版本" style={{ borderRadius: 12, background: '#fafafa' }}>
              <div style={{ color: '#595959', lineHeight: 1.8 }}>{publishedVersionId}</div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" title="上一 Published 版本" style={{ borderRadius: 12, background: '#fafafa' }}>
              <div style={{ color: '#595959', lineHeight: 1.8 }}>{previousPublishedVersionId}</div>
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Card size="small" title="版本历史" style={{ borderRadius: 12 }}>
              <List
                dataSource={versions}
                locale={{ emptyText: '当前租户暂无配置版本记录' }}
                renderItem={(item: SettingsGovernanceVersionSummary) => (
                  <List.Item
                    key={item.versionId}
                    style={{ cursor: 'pointer' }}
                    onClick={() => openVersionDiffDrawer(item)}
                    extra={
                      <Button
                        type="link"
                        size="small"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openVersionDiffDrawer(item);
                        }}
                      >
                        查看 diff
                      </Button>
                    }
                  >
                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                      <Space wrap>
                        {resolveVersionStatusTag(item.versionStatus)}
                        <Tag>{item.sourceAction || 'save'}</Tag>
                        {item.releaseId ? <Tag color="green">{item.releaseId}</Tag> : null}
                      </Space>
                      <div style={{ color: '#111827', fontWeight: 600 }}>
                        {item.versionId || '未返回版本 ID'}
                      </div>
                      <div style={{ color: '#64748B', fontSize: 12 }}>
                        {item.createdAt || '未返回时间'} / {item.createdBy?.actorId || 'unknown-actor'} /{' '}
                        {item.createdBy?.role || 'unknown-role'}
                      </div>
                      <div style={{ color: '#64748B', fontSize: 12 }}>
                        变更字段数：{item.summary?.changedFieldCount || 0}
                      </div>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card size="small" title="审计日志" style={{ borderRadius: 12 }}>
              <List
                dataSource={audits}
                locale={{ emptyText: '当前租户暂无审计记录' }}
                renderItem={(item: SettingsGovernanceAuditEntry) => (
                  <List.Item
                    key={item.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => openAuditDiffDrawer(item)}
                    extra={
                      <Button
                        type="link"
                        size="small"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openAuditDiffDrawer(item);
                        }}
                      >
                        查看 diff
                      </Button>
                    }
                  >
                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                      <Space wrap>
                        {resolveActionTag(item.action)}
                        <Tag>{item.actorId || 'unknown-actor'}</Tag>
                        <Tag>{item.role || 'unknown-role'}</Tag>
                      </Space>
                      <div style={{ color: '#111827', fontWeight: 600 }}>
                        {item.summary || '配置治理变更'}
                      </div>
                      <div style={{ color: '#64748B', fontSize: 12 }}>
                        {item.createdAt || '未返回时间'} / from: {item.fromVersionId || '-'} / to:{' '}
                        {item.toVersionId || '-'}
                      </div>
                      <div style={{ color: '#64748B', fontSize: 12 }}>
                        变更字段数：{item.changedFieldCount || 0}
                      </div>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>
          </Col>
        </Row>
      </Space>

      <Drawer
        title={
          diffDrawerPayload
            ? `${diffDrawerPayload.type === 'version' ? '版本' : '审计'}差异详情 · ${
                diffDrawerPayload.sourceId
              }`
            : '差异详情'
        }
        placement="right"
        width={720}
        open={Boolean(diffDrawerPayload)}
        onClose={() => setDiffDrawerPayload(null)}
        destroyOnClose
      >
        {diffDrawerPayload ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Descriptions
              column={1}
              size="small"
              bordered
              items={[
                {
                  key: 'type',
                  label: '记录类型',
                  children: diffDrawerPayload.type === 'version' ? '版本历史' : '审计日志',
                },
                {
                  key: 'action',
                  label: '动作',
                  children: diffDrawerPayload.action || '-',
                },
                {
                  key: 'summary',
                  label: '摘要',
                  children: diffDrawerPayload.summary || '-',
                },
                {
                  key: 'createdAt',
                  label: '时间',
                  children: diffDrawerPayload.createdAt || '-',
                },
                {
                  key: 'actor',
                  label: '操作人',
                  children: diffDrawerPayload.actorId || '-',
                },
                {
                  key: 'role',
                  label: '角色',
                  children: diffDrawerPayload.role || '-',
                },
                {
                  key: 'fromVersion',
                  label: 'fromVersion',
                  children: diffDrawerPayload.fromVersionId || '-',
                },
                {
                  key: 'toVersion',
                  label: 'toVersion',
                  children: diffDrawerPayload.toVersionId || '-',
                },
                {
                  key: 'releaseId',
                  label: 'releaseId',
                  children: diffDrawerPayload.releaseId || '-',
                },
                {
                  key: 'changeTicket',
                  label: 'changeTicket',
                  children: diffDrawerPayload.changeTicket || '-',
                },
                {
                  key: 'traceId',
                  label: 'traceId',
                  children: diffDrawerPayload.traceId || '-',
                },
                {
                  key: 'changedFieldCount',
                  label: '变更字段数',
                  children: diffDrawerPayload.changedFieldCount || 0,
                },
              ]}
            />

            <Card size="small" title="字段级 Diff" style={{ borderRadius: 12 }}>
              {drawerChangedFields.length > 0 ? (
                <List
                  dataSource={drawerChangedFields}
                  renderItem={(field, index) => (
                    <List.Item key={`${field.field || 'field'}-${index}`}>
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        <Tag color="blue">{field.field || `field-${index + 1}`}</Tag>
                        <Row gutter={[12, 12]}>
                          <Col xs={24} md={12}>
                            <Card size="small" title="Before" style={{ borderRadius: 8, height: '100%' }}>
                              <code style={{ whiteSpace: 'pre-wrap', color: '#334155' }}>
                                {formatDiffValue(field.before)}
                              </code>
                            </Card>
                          </Col>
                          <Col xs={24} md={12}>
                            <Card size="small" title="After" style={{ borderRadius: 8, height: '100%' }}>
                              <code style={{ whiteSpace: 'pre-wrap', color: '#0f766e' }}>
                                {formatDiffValue(field.after)}
                              </code>
                            </Card>
                          </Col>
                        </Row>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Alert
                  type="warning"
                  showIcon
                  message="当前记录未返回字段级 diff"
                  description="该条目可能仅保留了变更计数或摘要，可先查看同一批次的版本/审计记录。"
                />
              )}
            </Card>
          </Space>
        ) : null}
      </Drawer>
    </Card>
  );
}

export default SettingsGovernanceSection;
