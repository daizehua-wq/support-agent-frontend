import { createElement } from 'react';
import { Tag } from 'antd';

export function getStatusTag(status?: string) {
  if (status === 'available') return createElement(Tag, { color: 'success' }, '可用');
  if (status === 'warning') return createElement(Tag, { color: 'warning' }, '降级');
  return createElement(Tag, { color: 'error' }, '不可用');
}

export function getProviderTag(provider?: string) {
  if (provider === 'local') return createElement(Tag, { color: 'blue' }, '本地模型');
  return createElement(Tag, { color: 'purple' }, 'API 模型');
}

export function getModelItemId(item?: { id?: string; modelId?: string } | null) {
  return item?.id || item?.modelId || '';
}
