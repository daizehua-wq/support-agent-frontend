import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  InputNumber,
  Row,
  Space,
  Tag,
  Typography,
} from 'antd';

import type { ExternalDataSourceItem } from '../../../api/databaseManager';
import {
  getCredentialStatusText,
  getExternalAuthTypeLabel,
  getExternalSourceTypeLabel,
  getHealthStatusTag,
  getOutboundPolicyLabel,
} from '../helpers';
import FieldRow from './FieldRow';

type ExternalSourceManagerPanelProps = {
  sources: ExternalDataSourceItem[];
  selectedId: string;
  onSelect: (sourceId: string) => void;
  onOpenCreate: () => void;
  onOpenEdit: () => void;
  onDelete: () => void;
  onHealthCheck: () => void;
  onRunQuery: (payload: {
    query?: string;
    page?: number;
    pageSize?: number;
    path?: string;
  }) => Promise<void>;
  onRunFetch: (payload: {
    resourceUrl?: string;
    resourcePath?: string;
    path?: string;
  }) => Promise<void>;
  onRunDownload: (payload: {
    resourceUrl?: string;
    resourcePath?: string;
    path?: string;
    fileName?: string;
  }) => Promise<void>;
  checking: boolean;
  deleting: boolean;
  runtimeAction: '' | 'query' | 'fetch' | 'download';
  runtimeError: string;
  runtimeResult: {
    action: 'query' | 'fetch' | 'download';
    executedAt: string;
    payload: Record<string, unknown>;
  } | null;
};

const prettyJson = (value: Record<string, unknown>) => JSON.stringify(value, null, 2);

const resolveResourceTargetPayload = (value: string, fallbackPath = '') => {
  const normalized = value.trim();
  if (!normalized) {
    return {};
  }

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return {
      resourceUrl: normalized,
    };
  }

  return {
    resourcePath: normalized,
    ...(fallbackPath ? { path: fallbackPath } : {}),
  };
};

type ExternalSourceRuntimeTesterProps = {
  selectedSource: ExternalDataSourceItem;
  onRunQuery: ExternalSourceManagerPanelProps['onRunQuery'];
  onRunFetch: ExternalSourceManagerPanelProps['onRunFetch'];
  onRunDownload: ExternalSourceManagerPanelProps['onRunDownload'];
  runtimeAction: ExternalSourceManagerPanelProps['runtimeAction'];
  runtimeError: string;
  runtimeResult: ExternalSourceManagerPanelProps['runtimeResult'];
};

function ExternalSourceRuntimeTester({
  selectedSource,
  onRunQuery,
  onRunFetch,
  onRunDownload,
  runtimeAction,
  runtimeError,
  runtimeResult,
}: ExternalSourceRuntimeTesterProps) {
  const [queryText, setQueryText] = useState('公开信息');
  const [queryPageSize, setQueryPageSize] = useState(5);
  const [queryPath, setQueryPath] = useState(selectedSource.apiPath || '');
  const [fetchTarget, setFetchTarget] = useState('');
  const [downloadTarget, setDownloadTarget] = useState('');
  const [downloadFileName, setDownloadFileName] = useState('');
  const capabilitySet = useMemo(
    () => new Set(selectedSource.capabilities || []),
    [selectedSource.capabilities],
  );
  const canQuery = !selectedSource.capabilities?.length || capabilitySet.has('search');
  const canFetch = !selectedSource.capabilities?.length || capabilitySet.has('fetch-detail');
  const canDownload = !selectedSource.capabilities?.length || capabilitySet.has('download');

  return (
    <Card size="small" title="运行联调" style={{ borderRadius: 12 }}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="仅允许发送公开查询词、公开资源路径或公开 URL。平台会阻断 localEvidence / attachments 等本地数据外发。"
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={8}>
          <Card size="small" title="试查询" style={{ borderRadius: 10 }}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Input.TextArea
                rows={4}
                value={queryText}
                onChange={(event) => setQueryText(event.target.value)}
                placeholder="输入供应商公开查询词"
              />
              <Input
                value={queryPath}
                onChange={(event) => setQueryPath(event.target.value)}
                placeholder={selectedSource.apiPath || '可选：覆盖默认 API Path'}
              />
              <Typography.Text type="secondary">Page Size</Typography.Text>
              <InputNumber
                min={1}
                max={50}
                value={queryPageSize}
                onChange={(value) => setQueryPageSize(Number(value || 5))}
                style={{ width: '100%' }}
              />
              <Button
                type="primary"
                loading={runtimeAction === 'query'}
                disabled={!canQuery}
                onClick={() =>
                  onRunQuery({
                    query: queryText.trim(),
                    page: 1,
                    pageSize: queryPageSize,
                    path: queryPath.trim() || selectedSource.apiPath,
                  })
                }
              >
                试查询
              </Button>
              {!canQuery ? (
                <Typography.Text type="secondary">
                  当前接入位未声明 `search` 能力。
                </Typography.Text>
              ) : null}
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={8}>
          <Card size="small" title="试抓取" style={{ borderRadius: 10 }}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Input.TextArea
                rows={4}
                value={fetchTarget}
                onChange={(event) => setFetchTarget(event.target.value)}
                placeholder="输入公开详情 URL，或相对资源路径"
              />
              <Button
                loading={runtimeAction === 'fetch'}
                disabled={!canFetch}
                onClick={() =>
                  onRunFetch(resolveResourceTargetPayload(fetchTarget, selectedSource.apiPath))
                }
              >
                试抓取
              </Button>
              {!canFetch ? (
                <Typography.Text type="secondary">
                  当前接入位未声明 `fetch-detail` 能力。
                </Typography.Text>
              ) : null}
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={8}>
          <Card size="small" title="试下载" style={{ borderRadius: 10 }}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Input.TextArea
                rows={4}
                value={downloadTarget}
                onChange={(event) => setDownloadTarget(event.target.value)}
                placeholder="输入公开下载 URL，或相对资源路径"
              />
              <Input
                value={downloadFileName}
                onChange={(event) => setDownloadFileName(event.target.value)}
                placeholder="可选：落盘文件名，如 report.pdf"
              />
              <Button
                loading={runtimeAction === 'download'}
                disabled={!canDownload}
                onClick={() =>
                  onRunDownload({
                    ...resolveResourceTargetPayload(downloadTarget, selectedSource.apiPath),
                    ...(downloadFileName.trim()
                      ? { fileName: downloadFileName.trim() }
                      : {}),
                  })
                }
              >
                试下载
              </Button>
              {!canDownload ? (
                <Typography.Text type="secondary">
                  当前接入位未声明 `download` 能力。
                </Typography.Text>
              ) : null}
            </Space>
          </Card>
        </Col>
      </Row>

      {runtimeError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 16 }}
          message="最近一次运行失败"
          description={runtimeError}
        />
      ) : null}

      {runtimeResult ? (
        <Card
          size="small"
          title="最近一次运行结果"
          style={{ marginTop: 16, borderRadius: 10 }}
          extra={
            <Space size={8}>
              <Tag color="processing">{runtimeResult.action}</Tag>
              <Typography.Text type="secondary">{runtimeResult.executedAt}</Typography.Text>
            </Space>
          }
        >
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            {prettyJson(runtimeResult.payload)}
          </pre>
        </Card>
      ) : null}
    </Card>
  );
}

function ExternalSourceManagerPanel({
  sources,
  selectedId,
  onSelect,
  onOpenCreate,
  onOpenEdit,
  onDelete,
  onHealthCheck,
  onRunQuery,
  onRunFetch,
  onRunDownload,
  checking,
  deleting,
  runtimeAction,
  runtimeError,
  runtimeResult,
}: ExternalSourceManagerPanelProps) {
  const selectedSource =
    sources.find((item) => item.id === selectedId) || sources[0] || null;

  return (
    <Card
      title="外部数据源接入位"
      extra={
        <Button type="primary" onClick={onOpenCreate}>
          新增接入位
        </Button>
      }
      style={{ borderRadius: 12 }}
    >
      <div
        style={{
          marginBottom: 12,
          padding: 12,
          borderRadius: 10,
          background: '#F7FAFC',
          border: '1px solid #EAF0F6',
          color: '#374151',
          fontSize: 13,
        }}
      >
        这里既管理商业数据库、搜索 API、开放数据源的接入配置，也支持直接走 Python Runtime 试查询、试抓取、试下载。
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {sources.length > 0 ? (
              sources.map((item) => {
                const active = item.id === (selectedSource?.id || '');

                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: 14,
                      borderRadius: 12,
                      border: active ? '1px solid #1677FF' : '1px solid #E5E7EB',
                      background: active ? '#EFF6FF' : '#FFFFFF',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                        gap: 8,
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#111827' }}>{item.name}</div>
                      {item.enabled ? <Tag color="blue">启用</Tag> : <Tag>停用</Tag>}
                    </div>
                    <div style={{ color: '#6B7280', marginBottom: 8 }}>{item.providerName}</div>
                    <Space size={[8, 8]} wrap>
                      <Tag>{getExternalSourceTypeLabel(item.sourceType)}</Tag>
                      {getHealthStatusTag(item.healthStatus)}
                    </Space>
                  </button>
                );
              })
            ) : (
              <Empty description="暂无外部数据源接入位" />
            )}
          </Space>
        </Col>

        <Col xs={24} lg={16}>
          {selectedSource ? (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card
                size="small"
                title="接入详情"
                extra={
                  <Space wrap>
                    <Button onClick={onOpenEdit}>编辑配置</Button>
                    <Button loading={checking} onClick={onHealthCheck}>
                      检测接入位
                    </Button>
                    <Button danger loading={deleting} onClick={onDelete}>
                      删除接入位
                    </Button>
                  </Space>
                }
                style={{ borderRadius: 12 }}
              >
                <FieldRow label="名称" value={selectedSource.name} />
                <FieldRow label="供应商" value={selectedSource.providerName} />
                <FieldRow
                  label="数据源类型"
                  value={getExternalSourceTypeLabel(selectedSource.sourceType)}
                />
                <FieldRow
                  label="认证方式"
                  value={getExternalAuthTypeLabel(selectedSource.authType)}
                />
                <FieldRow label="Base URL" value={selectedSource.baseUrl || '-'} />
                <FieldRow label="API Path" value={selectedSource.apiPath || '-'} />
                <FieldRow label="API Key" value={getCredentialStatusText(selectedSource.hasApiKey)} />
                <FieldRow
                  label="用户名"
                  value={getCredentialStatusText(selectedSource.hasUsername)}
                />
                <FieldRow
                  label="密码"
                  value={getCredentialStatusText(selectedSource.hasPassword)}
                />
                <FieldRow
                  label="能力"
                  value={
                    selectedSource.capabilities && selectedSource.capabilities.length > 0
                      ? selectedSource.capabilities.join(' / ')
                      : '未配置'
                  }
                />
                <FieldRow
                  label="允许域名"
                  value={
                    selectedSource.allowedDomains && selectedSource.allowedDomains.length > 0
                      ? selectedSource.allowedDomains.join(' / ')
                      : '未配置'
                  }
                />
                <FieldRow
                  label="仅公开数据"
                  value={selectedSource.publicDataOnly ? '是' : '否'}
                />
                <FieldRow
                  label="本地数据外发策略"
                  value={getOutboundPolicyLabel(selectedSource.localDataOutboundPolicy)}
                />
                <FieldRow label="最近检测" value={selectedSource.lastCheckedAt || '-'} />
                <FieldRow label="状态" value={getHealthStatusTag(selectedSource.healthStatus)} />
                <FieldRow label="说明" value={selectedSource.healthMessage || selectedSource.notes || '-'} />
              </Card>

              <ExternalSourceRuntimeTester
                key={selectedSource.id}
                selectedSource={selectedSource}
                onRunQuery={onRunQuery}
                onRunFetch={onRunFetch}
                onRunDownload={onRunDownload}
                runtimeAction={runtimeAction}
                runtimeError={runtimeError}
                runtimeResult={runtimeResult}
              />

              <Card size="small" title="API 契约" style={{ borderRadius: 12 }}>
                <FieldRow
                  label="配置读取"
                  value={selectedSource.apiContract?.configEndpoint || '-'}
                />
                <FieldRow
                  label="健康检测"
                  value={selectedSource.apiContract?.healthCheckEndpoint || '-'}
                />
                <FieldRow
                  label="Runtime Query"
                  value={
                    selectedSource.apiContract?.queryEndpoint ||
                    selectedSource.apiContract?.futureQueryEndpoint ||
                    '-'
                  }
                />
                <FieldRow
                  label="Runtime Fetch"
                  value={
                    selectedSource.apiContract?.fetchEndpoint ||
                    selectedSource.apiContract?.futureFetchEndpoint ||
                    '-'
                  }
                />
                <FieldRow
                  label="Runtime Download"
                  value={
                    selectedSource.apiContract?.downloadEndpoint ||
                    selectedSource.apiContract?.futureDownloadEndpoint ||
                    '-'
                  }
                />
                <FieldRow
                  label="边界说明"
                  value={selectedSource.apiContract?.integrationBoundary || '-'}
                />
              </Card>
            </Space>
          ) : (
            <Empty description="请选择一个外部数据源接入位" />
          )}
        </Col>
      </Row>
    </Card>
  );
}

export default ExternalSourceManagerPanel;
