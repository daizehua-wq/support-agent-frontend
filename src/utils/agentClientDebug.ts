import { useEffect, useState } from 'react';

import type { AgentAdapterResponse, AgentClientType } from '../api/agent';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

export const AGENT_CLIENT_TYPE_STORAGE_KEY = 'agent.debug.clientType';
export const GLOBAL_AGENT_DEBUG_BAR_ID = 'global-agent-debug-bar';
export const GLOBAL_AGENT_DEBUG_BAR_FLASH_EVENT = 'agent-debug-bar:flash';

export const agentClientTypeOptions: Array<{
  label: string;
  value: AgentClientType;
}> = [
  {
    label: 'Web JSON（默认）',
    value: 'web',
  },
  {
    label: '飞书卡片 JSON',
    value: 'lark',
  },
];

export const isAdapterPreviewMode = (clientType?: AgentClientType): boolean => {
  return String(clientType || 'web').trim().toLowerCase() === 'lark';
};

export const getAgentClientTypeLabel = (clientType?: AgentClientType): string => {
  return isAdapterPreviewMode(clientType) ? '飞书卡片' : 'Web JSON';
};

export const normalizeRememberedAgentClientType = (
  clientType?: AgentClientType | string | null,
): AgentClientType => {
  return isAdapterPreviewMode(clientType || undefined) ? 'lark' : 'web';
};

export const readRememberedAgentClientType = (): AgentClientType => {
  if (typeof window === 'undefined') {
    return 'web';
  }

  try {
    return normalizeRememberedAgentClientType(
      window.localStorage.getItem(AGENT_CLIENT_TYPE_STORAGE_KEY),
    );
  } catch {
    return 'web';
  }
};

export const persistAgentClientType = (clientType?: AgentClientType): AgentClientType => {
  const normalizedClientType = normalizeRememberedAgentClientType(clientType);

  if (typeof window === 'undefined') {
    return normalizedClientType;
  }

  try {
    window.localStorage.setItem(AGENT_CLIENT_TYPE_STORAGE_KEY, normalizedClientType);
  } catch {
    return normalizedClientType;
  }

  return normalizedClientType;
};

export const focusGlobalAgentDebugBar = () => {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  const target = document.getElementById(GLOBAL_AGENT_DEBUG_BAR_ID);

  if (!target) {
    return;
  }

  target.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });

  if (target instanceof HTMLElement) {
    target.focus({ preventScroll: true });
  }

  window.dispatchEvent(new CustomEvent(GLOBAL_AGENT_DEBUG_BAR_FLASH_EVENT));
};

export const useRememberedAgentClientType = () => {
  const [clientType, setClientType] = useState<AgentClientType>(() => {
    return readRememberedAgentClientType();
  });

  useEffect(() => {
    persistAgentClientType(clientType);
  }, [clientType]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== AGENT_CLIENT_TYPE_STORAGE_KEY) {
        return;
      }

      setClientType(readRememberedAgentClientType());
    };

    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return [clientType, setClientType] as const;
};

export const isAgentAdapterResponse = (value: unknown): value is AgentAdapterResponse => {
  return isRecord(value) && ('msg_type' in value || 'card' in value);
};

export const formatAgentAdapterResponse = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[复杂对象，暂不展开]';
  }
};
