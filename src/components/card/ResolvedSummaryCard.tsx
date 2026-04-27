import React from 'react';
import { Card, Col, Row, Tag } from 'antd';
import { formatTechnicalLabel, formatTechnicalValue } from '../../utils/displayLabel';

type ResolvedSummaryCardProps = {
  title: string;
  assistantId?: string;
  promptId?: string;
  promptVersion?: string;
  strategyId?: string;
  source?: unknown;
  fallback?: unknown;
  versionLabel?: string;
  databaseRelationSource?: string;
};

function safeDisplayText(value: unknown) {
  return formatTechnicalValue(value);
}

function getSourceTag(source?: unknown) {
  if (source === undefined || source === null || source === '') {
    return <Tag>未返回</Tag>;
  }

  if (typeof source !== 'string') {
    return <Tag color="default">{safeDisplayText(source)}</Tag>;
  }

  const sourceMap: Record<string, { text: string; color: string }> = {
    mounted: { text: '挂载来源', color: 'blue' },
    default: { text: '默认来源', color: 'default' },
    override: { text: '显式覆盖', color: 'gold' },
    fallback: { text: '回退生效', color: 'orange' },
    'default-model': { text: '默认模型', color: 'default' },
    'module-binding': { text: '模块绑定', color: 'blue' },
  };

  const current = sourceMap[source] || { text: formatTechnicalLabel(source), color: 'default' };
  return <Tag color={current.color}>{current.text}</Tag>;
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) {
  return (
    <Card size="small" style={{ borderRadius: 12 }}>
      <div style={{ color: '#6B7280', fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ color: '#111827', fontSize: 14, fontWeight: 600, wordBreak: 'break-all' }}>
        {value ?? '-'}
      </div>
    </Card>
  );
}

export default function ResolvedSummaryCard({
  title,
  assistantId,
  promptId,
  promptVersion,
  strategyId,
  source,
  fallback,
  versionLabel,
  databaseRelationSource,
}: ResolvedSummaryCardProps) {
  return (
    <Card title={title} style={{ borderRadius: 12 }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <SummaryItem label="Assistant ID" value={assistantId || '未返回'} />
        </Col>

        <Col xs={24} md={8}>
          <SummaryItem label="Prompt ID" value={promptId || '未返回'} />
        </Col>

        <Col xs={24} md={8}>
          <SummaryItem label="Prompt 版本" value={promptVersion || '未返回'} />
        </Col>

        <Col xs={24} md={8}>
          <SummaryItem label="策略" value={formatTechnicalLabel(strategyId)} />
        </Col>

        <Col xs={24} md={8}>
          <SummaryItem label="来源说明" value={getSourceTag(source)} />
        </Col>

        <Col xs={24} md={8}>
          <SummaryItem label="本次运行版" value={versionLabel || '未返回'} />
        </Col>

        {databaseRelationSource ? (
          <Col xs={24} md={8}>
            <SummaryItem label="数据库关系来源" value={databaseRelationSource} />
          </Col>
        ) : null}
      </Row>

      {fallback ? (
        <Card
          size="small"
          style={{
            marginTop: 16,
            borderRadius: 12,
            background: '#FFF7E6',
            border: '1px solid #F8D9A0',
          }}
        >
          <div style={{ color: '#8A5A00', lineHeight: 1.8 }}>
            <strong>降级处理：</strong>
            {safeDisplayText(fallback)}
          </div>
        </Card>
      ) : null}
    </Card>
  );
}
