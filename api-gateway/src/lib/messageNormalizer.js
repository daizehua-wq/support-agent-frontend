const normalizeText = (value = '') => String(value || '').trim();

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const safeJsonParse = (value = '') => {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const readFirstString = (values = []) => {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) {
      return text;
    }
  }

  return '';
};

const extractTextFromMaybeJson = (value = '') => {
  if (typeof value !== 'string') {
    return '';
  }

  const parsed = safeJsonParse(value);
  if (isPlainObject(parsed)) {
    return readFirstString([
      parsed.text,
      parsed.content,
      parsed.title,
      parsed.markdown,
      parsed.msg,
    ]);
  }

  return normalizeText(value);
};

const normalizeFeishu = (payload = {}) => {
  const event = isPlainObject(payload.event) ? payload.event : {};
  const message = isPlainObject(event.message) ? event.message : {};
  const sender = isPlainObject(event.sender) ? event.sender : {};
  const senderId = isPlainObject(sender.sender_id) ? sender.sender_id : {};

  return {
    platform: 'feishu',
    text: readFirstString([
      extractTextFromMaybeJson(message.content),
      message.text,
      payload.content,
      payload.text,
    ]),
    sender: readFirstString([senderId.open_id, senderId.user_id, senderId.union_id]),
    conversationId: readFirstString([message.chat_id, event.chat_id, payload.chat_id]),
    messageId: readFirstString([message.message_id, event.message_id, payload.message_id]),
  };
};

const normalizeDingTalk = (payload = {}) => {
  const textObject = isPlainObject(payload.text) ? payload.text : {};

  return {
    platform: 'dingtalk',
    text: readFirstString([
      textObject.content,
      payload.content,
      payload.text,
      payload.message,
    ]),
    sender: readFirstString([payload.senderStaffId, payload.senderId, payload.senderNick]),
    conversationId: readFirstString([payload.conversationId, payload.conversationType]),
    messageId: readFirstString([payload.msgId, payload.messageId]),
  };
};

const normalizeWeCom = (payload = {}) => {
  return {
    platform: 'wecom',
    text: readFirstString([payload.Content, payload.content, payload.text, payload.message]),
    sender: readFirstString([payload.FromUserName, payload.fromUserName, payload.sender]),
    conversationId: readFirstString([payload.ToUserName, payload.toUserName, payload.chat_id]),
    messageId: readFirstString([payload.MsgId, payload.msgId, payload.messageId]),
  };
};

const normalizeGeneric = (payload = {}) => {
  const message = isPlainObject(payload.message) ? payload.message : {};
  const eventMessage = isPlainObject(payload?.event?.message) ? payload.event.message : {};

  return {
    platform: 'generic',
    text: readFirstString([
      extractTextFromMaybeJson(eventMessage.content),
      eventMessage.text,
      extractTextFromMaybeJson(message.content),
      message.text,
      payload.content,
      payload.text,
      typeof payload.message === 'string' ? payload.message : '',
    ]),
    sender: readFirstString([payload.sender, payload.user_id, payload.userId, payload.open_id]),
    conversationId: readFirstString([payload.conversation_id, payload.conversationId, payload.chat_id]),
    messageId: readFirstString([payload.message_id, payload.messageId, payload.msgId]),
  };
};

const detectPlatform = (payload = {}, configuredType = '') => {
  const normalizedType = normalizeText(configuredType).toLowerCase();
  if (['feishu', 'lark', 'dingtalk', 'wecom'].includes(normalizedType)) {
    return normalizedType === 'lark' ? 'feishu' : normalizedType;
  }

  if (payload?.event?.message || payload?.schema === '2.0') {
    return 'feishu';
  }

  if (payload?.conversationId || payload?.senderStaffId || payload?.msgtype) {
    return 'dingtalk';
  }

  if (payload?.FromUserName || payload?.MsgId || payload?.MsgType) {
    return 'wecom';
  }

  return 'generic';
};

export const normalizeIncomingMessage = (payload = {}, options = {}) => {
  if (payload?.challenge) {
    return {
      challenge: payload.challenge,
      ignored: false,
    };
  }

  const platform = detectPlatform(payload, options.channelType);
  const normalized =
    platform === 'feishu'
      ? normalizeFeishu(payload)
      : platform === 'dingtalk'
        ? normalizeDingTalk(payload)
        : platform === 'wecom'
          ? normalizeWeCom(payload)
          : normalizeGeneric(payload);
  const text = normalizeText(normalized.text);

  return {
    ...normalized,
    platform,
    text,
    ignored: !text,
    reason: text ? '' : 'empty-message',
    rawEventType: normalizeText(payload.header?.event_type || payload.EventType || payload.type),
  };
};

export default {
  normalizeIncomingMessage,
};
