import { Alert, Button, Typography } from 'antd';
import { RocketOutlined } from '@ant-design/icons';

type ConfirmExecutionBarProps = {
  hasRequiredMissing: boolean;
  onConfirm: () => void;
  loading?: boolean;
};

function ConfirmExecutionBar({ hasRequiredMissing, onConfirm, loading = false }: ConfirmExecutionBarProps) {
  return (
    <div className="ap-confirm-bar">
      <Alert
        type="info"
        showIcon
        message={
          <Typography.Text style={{ fontSize: 13 }}>
            确认前不会调用模型、外部资料源或生成输出。
          </Typography.Text>
        }
        description={
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            确认后将执行：分析客户场景 → 检索资料 → 生成输出 → 保存历史任务
          </Typography.Text>
        }
        style={{ marginBottom: 12 }}
      />

      <Button
        type="primary"
        size="large"
        icon={<RocketOutlined />}
        onClick={onConfirm}
        disabled={hasRequiredMissing}
        loading={loading}
        block
        style={{ height: 52, borderRadius: 20, fontSize: 16 }}
      >
        确认并开始执行
      </Button>

      {hasRequiredMissing && (
        <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 8, fontSize: 13 }}>
          请先填写所有必填信息，才能确认并开始执行任务。
        </Typography.Text>
      )}
    </div>
  );
}

export default ConfirmExecutionBar;
