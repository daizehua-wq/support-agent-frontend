import { useEffect, useRef, useState } from 'react';
import { Button, Card, Select, Space, Tag } from 'antd';
import { useLocation } from 'react-router-dom';

import type { AgentClientType } from '../../api/agent';
import {
  GLOBAL_AGENT_DEBUG_BAR_ID,
  GLOBAL_AGENT_DEBUG_BAR_FLASH_EVENT,
  agentClientTypeOptions,
  getAgentClientTypeLabel,
  isAdapterPreviewMode,
  useRememberedAgentClientType,
} from '../../utils/agentClientDebug';

const routeLabelMap: Record<string, string> = {
  '/judge': '任务判断',
  '/analyze': '任务判断',
  '/retrieve': '资料检索',
  '/search': '资料检索',
  '/compose': '参考写作',
  '/script': '参考写作',
};

const readDebugRouteLabel = (pathname: string): string => {
  return routeLabelMap[pathname] || '';
};

function GlobalAgentDebugBar() {
  const location = useLocation();
  const routeLabel = readDebugRouteLabel(location.pathname);
  const [clientType, setClientType] = useRememberedAgentClientType();
  const [flashActive, setFlashActive] = useState(false);
  const flashTimeoutRef = useRef<number | null>(null);
  const adapterPreviewMode = isAdapterPreviewMode(clientType);
  const flashClassName = flashActive
    ? adapterPreviewMode
      ? 'agent-debug-bar agent-debug-bar--flash-lark'
      : 'agent-debug-bar agent-debug-bar--flash-web'
    : 'agent-debug-bar';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const triggerFlash = () => {
      setFlashActive(true);

      if (flashTimeoutRef.current !== null) {
        window.clearTimeout(flashTimeoutRef.current);
      }

      flashTimeoutRef.current = window.setTimeout(() => {
        setFlashActive(false);
        flashTimeoutRef.current = null;
      }, 1200);
    };

    window.addEventListener(GLOBAL_AGENT_DEBUG_BAR_FLASH_EVENT, triggerFlash);

    return () => {
      window.removeEventListener(GLOBAL_AGENT_DEBUG_BAR_FLASH_EVENT, triggerFlash);

      if (flashTimeoutRef.current !== null) {
        window.clearTimeout(flashTimeoutRef.current);
      }
    };
  }, []);

  if (!routeLabel) {
    return null;
  }

  return (
    <div
      id={GLOBAL_AGENT_DEBUG_BAR_ID}
      tabIndex={-1}
      className={flashClassName}
      style={{
        marginBottom: 24,
        outline: 'none',
        scrollMarginTop: 24,
      }}
    >
      <Card
        size="small"
        style={{
          borderRadius: 12,
          borderColor: flashActive
            ? adapterPreviewMode
              ? '#1677ff'
              : '#52c41a'
            : adapterPreviewMode
              ? '#adc6ff'
              : '#b7eb8f',
          background: flashActive
            ? adapterPreviewMode
              ? '#e6f4ff'
              : '#f6ffed'
            : adapterPreviewMode
              ? '#f0f5ff'
              : '#f6ffed',
          transition:
            'border-color 0.35s ease, background 0.35s ease',
        }}
        styles={{ body: { padding: 16 } }}
      >
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: '1 1 420px' }}>
            <Space wrap size={[8, 8]} style={{ marginBottom: 8 }}>
              <Tag color={adapterPreviewMode ? 'blue' : 'green'}>
                当前渠道：{getAgentClientTypeLabel(clientType)}
              </Tag>
              <Tag color="gold">全局记忆已开启</Tag>
              <Tag>当前页：{routeLabel}</Tag>
            </Space>
            <div style={{ color: '#595959', lineHeight: 1.7 }}>
              这个调试开关会在 Analyze / Search / Script 三页共享，并自动记住到本地。
              切到飞书卡片后，页面会直接展示适配器转换后的原始 JSON 预览。
            </div>
          </div>

          <Space wrap>
            <Select
              value={clientType}
              options={agentClientTypeOptions}
              onChange={(value) => setClientType(value as AgentClientType)}
              style={{ minWidth: 220 }}
            />
            <Button
              onClick={() => setClientType('web')}
              disabled={clientType === 'web'}
            >
              恢复默认 Web
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  );
}

export default GlobalAgentDebugBar;
