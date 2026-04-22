import Adapter from './base.js';

const toDisplayText = (value) => {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (value === undefined || value === null) {
    return '-';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
};

const buildCardText = (label, value) => {
  return {
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: `**${label}**\n\`\`\`json\n${toDisplayText(value)}\n\`\`\``,
    },
  };
};

export default class LarkAdapter extends Adapter {
  formatReply(data = {}) {
    const title =
      data?.message ||
      data?.data?.message ||
      data?.data?.title ||
      '业务处理结果';

    return {
      msg_type: 'interactive',
      card: {
        config: {
          wide_screen_mode: true,
          enable_forward: true,
        },
        header: {
          template: data?.code && data.code >= 400 ? 'red' : 'blue',
          title: {
            tag: 'plain_text',
            content: title,
          },
        },
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**code**: ${data?.code ?? 200}\n**traceId**: ${data?.traceId || '-'}`,
            },
          },
          buildCardText('data', data?.data),
        ],
      },
    };
  }
}
