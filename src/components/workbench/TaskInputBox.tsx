import { Input, Button } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import type React from 'react';

type TaskInputBoxProps = {
  value: string;
  onChange: (value: string) => void;
  onGeneratePlan: () => void;
  disabled?: boolean;
  loading?: boolean;
  buttonLabel?: string;
};

function TaskInputBox({
  value,
  onChange,
  onGeneratePlan,
  disabled = false,
  loading = false,
  buttonLabel = '生成任务计划',
}: TaskInputBoxProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && value.trim()) {
      e.preventDefault();
      onGeneratePlan();
    }
  };

  return (
    <div className="ap-task-input">
      <Input.TextArea
        className="ap-task-input__field"
        placeholder="描述你的任务目标。例如：帮我分析这家客户的背景，检索相关案例，生成一份销售沟通建议。"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        autoSize={{ minRows: 2, maxRows: 5 }}
        disabled={disabled || loading}
      />
      <Button
        className="ap-task-input__action"
        type="primary"
        size="large"
        icon={<SendOutlined />}
        onClick={onGeneratePlan}
        disabled={disabled || !value.trim()}
        loading={loading}
      >
        {buttonLabel}
      </Button>
    </div>
  );
}

export default TaskInputBox;
