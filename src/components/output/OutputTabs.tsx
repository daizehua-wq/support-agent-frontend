import { Tabs, Typography, Button, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import type { OutputTabKey } from '../../types/output';

const TAB_LABELS: Record<OutputTabKey, string> = {
  formal: '正式交付版',
  concise: '简洁沟通版',
  spoken: '口语跟进版',
};

type OutputTabsProps = {
  activeTab: OutputTabKey;
  onTabChange: (tab: OutputTabKey) => void;
  formal?: string;
  concise?: string;
  spoken?: string;
  disabled?: boolean;
};

function OutputTabs({ activeTab, onTabChange, formal, concise, spoken, disabled = false }: OutputTabsProps) {
  const contentMap: Record<OutputTabKey, string | undefined> = { formal, concise, spoken };

  const handleCopy = () => {
    const text = contentMap[activeTab];
    if (!text) { message.warning('暂无内容可复制'); return; }
    navigator.clipboard.writeText(text)
      .then(() => message.success(`已复制${TAB_LABELS[activeTab]}`))
      .catch(() => message.error('复制失败'));
  };

  return (
    <div className="ap-output-tabs">
      <div className="ap-output-tabs__header">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => onTabChange(key as OutputTabKey)}
          items={(
            Object.entries(TAB_LABELS) as [OutputTabKey, string][]
          ).map(([key, label]) => ({ key, label }))}
          tabBarExtraContent={
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={handleCopy}
              disabled={disabled}
            >
              复制{activeTab === 'formal' ? '正式交付版' : activeTab === 'concise' ? '简洁沟通版' : '口语跟进版'}
            </Button>
          }
        />
      </div>
      <div className="ap-output-tabs__body">
        <Typography.Paragraph style={{ fontSize: 15, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
          {contentMap[activeTab] || '（暂无内容）'}
        </Typography.Paragraph>
      </div>
    </div>
  );
}

export default OutputTabs;
