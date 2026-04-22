import { Button, Card, Col, Row, Space } from 'antd';

import DatabaseRelationSummaryCard from '../../../components/card/DatabaseRelationSummaryCard';
import {
  getAvailabilityTag,
  getCredentialStatusText,
  getDatabaseTypeLabel,
  getHealthTag,
  type DatabaseItem,
} from '../helpers';
import FieldRow from './FieldRow';

type DatabaseManagerDetailPanelProps = {
  selectedDatabase: DatabaseItem;
  emptyDatabaseId: string;
  checking: boolean;
  deletingMode: '' | 'config-only' | 'drop-remote';
  onOpenEdit: () => void;
  onDelete: (mode: 'config-only' | 'drop-remote') => void;
  onHealthCheck: () => void;
  onOpenBindings: () => void;
};

function DatabaseManagerDetailPanel({
  selectedDatabase,
  emptyDatabaseId,
  checking,
  deletingMode,
  onOpenEdit,
  onDelete,
  onHealthCheck,
  onOpenBindings,
}: DatabaseManagerDetailPanelProps) {
  const disabled = selectedDatabase.id === emptyDatabaseId;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        title="数据库本体信息区"
        extra={
          <Space wrap>
            <Button disabled={disabled} onClick={onOpenEdit}>
              编辑连接
            </Button>
            <Button
              disabled={disabled}
              loading={deletingMode === 'config-only'}
              onClick={() => onDelete('config-only')}
            >
              移除配置
            </Button>
            <Button
              danger
              disabled={disabled}
              loading={deletingMode === 'drop-remote'}
              onClick={() => onDelete('drop-remote')}
            >
              删除远端库
            </Button>
          </Space>
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
          本区承接数据库本体信息与连接配置治理：默认先管理平台内的连接配置；远端物理删库被单独视为高风险动作，需要显式触发。
        </div>
        <FieldRow label="数据库名称" value={selectedDatabase.name} />
        <FieldRow label="数据库 ID" value={selectedDatabase.id} />
        <FieldRow label="类型" value={getDatabaseTypeLabel(selectedDatabase.type)} />
        <FieldRow label="环境" value={selectedDatabase.environment} />
        <FieldRow label="Host" value={selectedDatabase.host || '-'} />
        <FieldRow label="Port" value={selectedDatabase.port || '-'} />
        <FieldRow label="用户名" value={selectedDatabase.username || '-'} />
        <FieldRow label="管理员用户名" value={selectedDatabase.adminUsername || '-'} />
        <FieldRow label="连接密码" value={getCredentialStatusText(selectedDatabase.hasPassword)} />
        <FieldRow
          label="管理员密码"
          value={getCredentialStatusText(selectedDatabase.hasAdminPassword)}
        />
        <FieldRow label="数据库文件" value={selectedDatabase.databaseFile || '-'} />
        <FieldRow label="说明" value={selectedDatabase.description} />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card
            title="健康检查区"
            extra={
              <Button disabled={disabled} loading={checking} onClick={onHealthCheck}>
                立即检测
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
              本区承接数据库健康检查动作与结果回写，用于判断当前是否可用以及最近检测状态。
            </div>
            <FieldRow label="可用状态" value={getAvailabilityTag(selectedDatabase.available)} />
            <FieldRow label="健康状态" value={getHealthTag(selectedDatabase.healthStatus)} />
            <FieldRow label="最近检测时间" value={selectedDatabase.lastCheckedAt} />
            <FieldRow label="健康说明" value={selectedDatabase.healthMessage || '-'} />
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <DatabaseRelationSummaryCard
            title="轻绑定摘要区"
            defaultDatabase={selectedDatabase.defaultAssociatedDatabase}
            visibleDatabases={selectedDatabase.visibleDatabases}
            relationSource={selectedDatabase.relationSource}
            healthStatus={selectedDatabase.healthStatus}
          />
          <div style={{ marginTop: 12 }}>
            <Button disabled={disabled} onClick={onOpenBindings}>
              调整轻绑定关系
            </Button>
          </div>
        </Col>
      </Row>

      <Card title="页面边界与预留位区" style={{ borderRadius: 12 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card size="small" title="轻绑定说明" style={{ borderRadius: 12, background: '#FAFAFA' }}>
              <div style={{ color: '#595959', lineHeight: 1.8 }}>
                当前只表达默认关联数据库、可见数据库和关系来源，不扩成权限树或角色后台。
              </div>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card
              size="small"
              title="未来权限预留"
              style={{ borderRadius: 12, background: '#FAFAFA' }}
            >
              <div style={{ color: '#595959', lineHeight: 1.8 }}>
                未来若接帐号体系 / 数据权限体系，这里只作为结构预留位，不在本轮实现完整闭环。
              </div>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card
              size="small"
              title="页面边界说明"
              style={{ borderRadius: 12, background: '#FAFAFA' }}
            >
              <div style={{ color: '#595959', lineHeight: 1.8 }}>
                这页只管数据库有哪些、能不能用、当前和谁轻绑定，不承接 Prompt 管理、模型治理和权限配置主流程。
              </div>
            </Card>
          </Col>
        </Row>
      </Card>
    </Space>
  );
}

export default DatabaseManagerDetailPanel;
