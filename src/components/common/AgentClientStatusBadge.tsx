import { Space, Tag } from 'antd';

import type { AgentClientType } from '../../api/agent';
import {
  focusGlobalAgentDebugBar,
  getAgentClientTypeLabel,
  isAdapterPreviewMode,
} from '../../utils/agentClientDebug';

type AgentClientStatusBadgeProps = {
  clientType: AgentClientType;
};

function AgentClientStatusBadge({ clientType }: AgentClientStatusBadgeProps) {
  const adapterPreviewMode = isAdapterPreviewMode(clientType);

  return (
    <button
      type="button"
      onClick={focusGlobalAgentDebugBar}
      title="点击跳到顶部调试条"
      aria-label={`当前响应渠道：${getAgentClientTypeLabel(clientType)}，点击跳到顶部调试条`}
      style={{
        appearance: 'none',
        font: 'inherit',
        padding: '12px 14px',
        borderRadius: 12,
        border: `1px solid ${adapterPreviewMode ? '#91caff' : '#b7eb8f'}`,
        background: adapterPreviewMode ? '#e6f4ff' : '#f6ffed',
        minWidth: 220,
        maxWidth: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      <div
        style={{
          marginBottom: 6,
          fontSize: 12,
          color: '#595959',
          lineHeight: 1.4,
        }}
      >
        当前响应渠道
      </div>
      <Space wrap size={[8, 8]}>
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#1f1f1f',
          }}
        >
          {getAgentClientTypeLabel(clientType)}
        </span>
        <Tag color={adapterPreviewMode ? 'blue' : 'green'}>
          {adapterPreviewMode ? '适配预览中' : '默认通道'}
        </Tag>
      </Space>
    </button>
  );
}

export default AgentClientStatusBadge;
