import { Space, Tag } from 'antd';

import type { AgentAdapterResponse, AgentClientType } from '../../api/agent';
import {
  formatAgentAdapterResponse,
  getAgentClientTypeLabel,
} from '../../utils/agentClientDebug';
import { formatTechnicalLabel } from '../../utils/displayLabel';
import ResultCard from './ResultCard';

type ClientAdapterPreviewCardProps = {
  clientType: AgentClientType;
  response: AgentAdapterResponse;
  note?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const readCardTitle = (response: AgentAdapterResponse): string => {
  const card = isRecord(response.card) ? response.card : null;
  const header = isRecord(card?.header) ? card.header : null;
  const title = isRecord(header?.title) ? header.title : null;
  const content = title?.content;

  return typeof content === 'string' && content.trim() ? content : '未返回卡片标题';
};

function ClientAdapterPreviewCard({
  clientType,
  response,
  note,
}: ClientAdapterPreviewCardProps) {
  return (
    <ResultCard
      title="渠道适配响应预览"
      extra={
        <Space wrap>
          <Tag color="blue">{getAgentClientTypeLabel(clientType)}</Tag>
          <Tag color="processing">{formatTechnicalLabel(response.msg_type || 'raw-response')}</Tag>
        </Space>
      }
    >
      <p style={{ marginBottom: 8 }}>
        <strong>卡片标题：</strong>
        {readCardTitle(response)}
      </p>
      {note ? (
        <p style={{ marginBottom: 12, color: '#595959' }}>
          {note}
        </p>
      ) : null}
      <pre
        style={{
          margin: 0,
          padding: 12,
          borderRadius: 8,
          background: '#fafafa',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          overflowX: 'auto',
        }}
      >
        {formatAgentAdapterResponse(response)}
      </pre>
    </ResultCard>
  );
}

export default ClientAdapterPreviewCard;
