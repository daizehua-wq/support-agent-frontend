import { Button, Card, Col, Row } from 'antd';

import type { ModelCenterListItem } from '../../../api/modelCenter';
import { formatDateTimeToLocalTime } from '../../../utils/dateTime';
import { getProviderTag, getStatusTag } from '../helpers';
import FieldRow from './FieldRow';

type ModuleBindings = {
  analyze: string;
  search: string;
  script: string;
};

type FallbackSummary = {
  enabled: boolean;
  modelId: string | null;
  modelName: string | null;
  reason: string | null;
};

type ModelCenterOverviewSectionProps = {
  defaultModel?: ModelCenterListItem;
  moduleBindings: ModuleBindings;
  fallbackSummary: FallbackSummary;
  getModelName: (id?: string | null) => string;
  onOpenBindings: () => void;
  onOpenFallback: () => void;
};

function ModelCenterOverviewSection({
  defaultModel,
  moduleBindings,
  fallbackSummary,
  getModelName,
  onOpenBindings,
  onOpenFallback,
}: ModelCenterOverviewSectionProps) {
  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
      <Col xs={24} md={8}>
        <Card title="默认模型摘要区" style={{ borderRadius: 12 }}>
          <FieldRow label="默认模型" value={defaultModel?.name || defaultModel?.modelName || '-'} />
          <FieldRow label="Provider" value={getProviderTag(defaultModel?.provider)} />
          <FieldRow label="默认状态" value={defaultModel?.defaultFlag ? '是' : '否'} />
          <FieldRow label="可用性状态" value={getStatusTag(defaultModel?.status)} />
          <FieldRow
            label="更新时间"
            value={formatDateTimeToLocalTime(defaultModel?.updatedAt || defaultModel?.modifiedAt) || '-'}
          />
        </Card>
      </Col>

      <Col xs={24} md={8}>
        <Card title="模块绑定区" style={{ borderRadius: 12 }}>
          <FieldRow label="Analyze" value={getModelName(moduleBindings.analyze)} />
          <FieldRow label="Search" value={getModelName(moduleBindings.search)} />
          <FieldRow label="Script" value={getModelName(moduleBindings.script)} />
          <div style={{ marginTop: 12 }}>
            <Button onClick={onOpenBindings}>调整模块绑定</Button>
          </div>
        </Card>
      </Col>

      <Col xs={24} md={8}>
        <Card title="降级规则区" style={{ borderRadius: 12 }}>
          <FieldRow label="启用状态" value={fallbackSummary.enabled ? '已启用' : '未启用'} />
          <FieldRow label="顺序" value="模块绑定 → 默认模型 → 降级候选" />
          <FieldRow label="条件" value="模块绑定不可用或测试失败时触发" />
          <FieldRow
            label="目标模型"
            value={fallbackSummary.modelName || getModelName(fallbackSummary.modelId)}
          />
          <div style={{ marginTop: 12 }}>
            <Button onClick={onOpenFallback}>调整降级规则</Button>
          </div>
        </Card>
      </Col>
    </Row>
  );
}

export default ModelCenterOverviewSection;
