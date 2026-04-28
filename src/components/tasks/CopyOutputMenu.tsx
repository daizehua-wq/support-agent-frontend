import { Button, Dropdown, message } from 'antd';
import { CopyOutlined, DownOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';

type CopyOutputMenuProps = {
  hasOutput: boolean;
  formalPreview?: string;
};

function CopyOutputMenu({ hasOutput, formalPreview }: CopyOutputMenuProps) {
  const items: MenuProps['items'] = [
    { key: 'formal', label: '复制正式交付版', disabled: !hasOutput },
    { key: 'concise', label: '复制简洁沟通版', disabled: !hasOutput },
    { key: 'spoken', label: '复制口语跟进版', disabled: !hasOutput },
    { key: 'all', label: '复制当前版本全部内容', disabled: !hasOutput },
  ];

  const handleClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'all') {
      message.info('复制当前版本全部内容（实际 Output 数据在详情页获取）');
      return;
    }
    if (key === 'formal' && formalPreview) {
      navigator.clipboard.writeText(formalPreview).then(() => message.success('已复制正式交付版')).catch(() => message.error('复制失败'));
      return;
    }
    if (!hasOutput) {
      message.warning('该任务尚未生成 Output');
      return;
    }
    message.info('Output 内容将在进入详情页后获取');
  };

  return (
    <Dropdown menu={{ items, onClick: handleClick }} trigger={['click']}>
      <Button size="small" icon={<CopyOutlined />} disabled={!hasOutput}>
        复制输出 <DownOutlined />
      </Button>
    </Dropdown>
  );
}

export default CopyOutputMenu;
