import httpClient from './httpClient.js';
import { normalizeIncomingMessage } from './messageNormalizer.js';

const activeChannels = new Map();
const recentMessageResults = new Map();
let inFlightMessages = 0;

const RECENT_MESSAGE_TTL_MS = 5 * 60 * 1000;
const MAX_IN_FLIGHT_MESSAGES = Math.max(
  1,
  Number(process.env.P4_CHANNEL_MAX_IN_FLIGHT || 50) || 50,
);

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeText = (value = '') => String(value || '').trim();

const unwrapData = (payload = {}) => {
  if (payload?.data && isPlainObject(payload.data) && 'data' in payload.data) {
    return payload.data.data;
  }

  if (payload?.data !== undefined) {
    return payload.data;
  }

  return payload;
};

const createAdapter = (channel = {}) => {
  const channelId = String(channel.id);
  const channelType = normalizeText(channel.channelType || channel.channel_type);
  const channelName = normalizeText(channel.channelName || channel.channel_name);
  const config = isPlainObject(channel.config) ? channel.config : {};

  return {
    id: channelId,
    channelId,
    channelType,
    channelName,
    appId: normalizeText(channel.appId || channel.app_id),
    config,
    status: channel.status || 'active',
    async sendMessage(recipient = '', content = '') {
      return {
        success: true,
        channel_id: channelId,
        channel_type: channelType,
        recipient,
        content,
        mode: 'mock-adapter',
      };
    },
  };
};

const cleanupRecentMessageResults = () => {
  const now = Date.now();

  for (const [key, value] of recentMessageResults.entries()) {
    if (!value?.expiresAt || value.expiresAt <= now) {
      recentMessageResults.delete(key);
    }
  }
};

setInterval(cleanupRecentMessageResults, 60 * 1000).unref?.();

const getRecentMessageKey = (channelId = '', normalizedMessage = {}) => {
  const messageId = normalizeText(normalizedMessage.messageId);
  if (!messageId) {
    return '';
  }

  return `${channelId}:${messageId}`;
};

const readRecentResult = (key = '') => {
  cleanupRecentMessageResults();
  if (!key) {
    return null;
  }

  return recentMessageResults.get(key)?.result || null;
};

const writeRecentResult = (key = '', result = {}) => {
  if (!key) {
    return;
  }

  cleanupRecentMessageResults();
  recentMessageResults.set(key, {
    result,
    expiresAt: Date.now() + RECENT_MESSAGE_TTL_MS,
  });
};

export const loadChannels = async () => {
  const response = await httpClient.get('/internal/channels');
  const channels = unwrapData(response);
  const nextChannels = new Map();

  (Array.isArray(channels) ? channels : []).forEach((channel) => {
    if (!channel || channel.status === 'disabled') {
      return;
    }

    const adapter = createAdapter(channel);
    nextChannels.set(adapter.channelId, adapter);
  });

  activeChannels.clear();
  nextChannels.forEach((adapter, id) => activeChannels.set(id, adapter));

  console.log(`[api-gateway] channels loaded: ${activeChannels.size}`);

  return {
    success: true,
    channels_loaded: activeChannels.size,
    channelsLoaded: activeChannels.size,
  };
};

export const reload = () => loadChannels();

export const getLoadedChannels = () =>
  Array.from(activeChannels.values()).map((adapter) => ({
    id: adapter.channelId,
    channel_id: adapter.channelId,
    channel_type: adapter.channelType,
    channelType: adapter.channelType,
    channel_name: adapter.channelName,
    channelName: adapter.channelName,
    app_id: adapter.appId,
    appId: adapter.appId,
    status: adapter.status,
  }));

export const getChannelRuntimeSummary = () => ({
  loadedChannels: activeChannels.size,
  inFlightMessages,
  maxInFlightMessages: MAX_IN_FLIGHT_MESSAGES,
  recentMessageCacheSize: recentMessageResults.size,
});

export const sendMessage = async (channelId = '', recipient = '', content = '') => {
  const adapter = activeChannels.get(String(channelId));
  if (!adapter) {
    throw new Error(`channel ${channelId} is not loaded`);
  }

  return adapter.sendMessage(recipient, content);
};

export const handleIncomingMessage = async (channelId = '', payload = {}) => {
  const adapter = activeChannels.get(String(channelId));
  if (!adapter) {
    throw new Error(`channel ${channelId} is not loaded`);
  }

  const normalizedMessage = normalizeIncomingMessage(payload, {
    channelType: adapter.channelType,
  });

  if (normalizedMessage?.challenge) {
    return {
      success: true,
      challenge: normalizedMessage.challenge,
    };
  }

  if (normalizedMessage.ignored) {
    return {
      success: true,
      ignored: true,
      reason: normalizedMessage.reason || 'empty-message',
    };
  }

  if (inFlightMessages >= MAX_IN_FLIGHT_MESSAGES) {
    const error = new Error('gateway channel worker is overloaded');
    error.status = 503;
    error.code = 'p4-channel-overloaded';
    throw error;
  }

  const recentKey = getRecentMessageKey(adapter.channelId, normalizedMessage);
  const recentResult = readRecentResult(recentKey);
  if (recentResult) {
    return {
      ...recentResult,
      duplicate: true,
    };
  }

  inFlightMessages += 1;

  try {
    const chatResponse = await httpClient.post('/internal/chat', {
      app_id: adapter.appId,
      message: normalizedMessage.text,
      channel_id: adapter.channelId,
      channel_type: adapter.channelType,
      source: 'channel-webhook',
      sender: normalizedMessage.sender,
      conversation_id: normalizedMessage.conversationId,
      message_id: normalizedMessage.messageId,
      normalized_platform: normalizedMessage.platform,
    });
    const chatData = unwrapData(chatResponse);
    const result = {
      success: true,
      channel_id: adapter.channelId,
      channel_type: adapter.channelType,
      app_id: adapter.appId,
      reply: chatData?.reply || '',
      session_id: chatData?.session_id || chatData?.sessionId || '',
      trace_id: chatData?.trace_id || chatData?.traceId || '',
      normalized_message: {
        platform: normalizedMessage.platform,
        sender: normalizedMessage.sender,
        conversation_id: normalizedMessage.conversationId,
        message_id: normalizedMessage.messageId,
      },
    };

    writeRecentResult(recentKey, result);
    return result;
  } finally {
    inFlightMessages = Math.max(0, inFlightMessages - 1);
  }
};

export default {
  loadChannels,
  reload,
  getLoadedChannels,
  getChannelRuntimeSummary,
  sendMessage,
  handleIncomingMessage,
};
