import { Button, message } from 'antd';

type CopyButtonProps = {
  text: string;
  label?: string;
};

function CopyButton({ text, label = '复制' }: CopyButtonProps) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('已复制');
    } catch {
      message.error('复制失败，请手动复制');
    }
  };

  return (
    <Button onClick={handleCopy} disabled={!text}>
      {label}
    </Button>
  );
}

export default CopyButton;