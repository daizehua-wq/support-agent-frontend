import { Button, Card, Tag, Typography, message } from 'antd';
import { CopyOutlined, ExportOutlined, HistoryOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { TaskOutputPreview } from '../../types/taskPlan';

type OutputPreviewCardProps = {
  taskId: string;
  preview: TaskOutputPreview;
  degraded?: boolean;
};

function OutputPreviewCard({ taskId, preview, degraded = false }: OutputPreviewCardProps) {
  const navigate = useNavigate();

  const handleCopy = () => {
    navigator.clipboard.writeText(preview.formalPreview)
      .then(() => message.success('正式交付版已复制到剪贴板'))
      .catch(() => message.error('复制失败，请手动复制'));
  };

  const handleContinue = () => {
    message.info('基于当前结果继续推进的功能将在后续阶段接入。', 4);
  };

  return (
    <Card className="ap-output-preview" styles={{ body: { padding: 24 } }}>
      <div className="ap-output-preview__header">
        <Typography.Title level={4} style={{ margin: 0 }}>
          <ExportOutlined style={{ marginRight: 8 }} />
          Output 预览
        </Typography.Title>
        <Tag color="green">已生成三版输出</Tag>
      </div>

      {degraded && (
        <div style={{ marginTop: 12 }}>
          <Tag color="orange">外部源降级，本次输出基于内部知识库和 Reference Pack 生成。</Tag>
        </div>
      )}

      <div className="ap-output-preview__versions">
        <div className="ap-output-preview__version">
          <Typography.Text strong>正式交付版</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.7 }}>
            {preview.formalPreview}
          </Typography.Paragraph>
        </div>
        <div className="ap-output-preview__version">
          <Typography.Text strong>简洁沟通版</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.7 }}>
            {preview.concisePreview}
          </Typography.Paragraph>
        </div>
        <div className="ap-output-preview__version">
          <Typography.Text strong>口语跟进版</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.7 }}>
            {preview.spokenPreview}
          </Typography.Paragraph>
        </div>
      </div>

      <div className="ap-output-preview__meta">
        <Tag>关键依据：{preview.evidenceCount} 条</Tag>
        <Tag color={preview.riskCount > 1 ? 'orange' : 'default'}>风险与限制：{preview.riskCount} 条</Tag>
      </div>

      <div className="ap-output-preview__actions">
        <Button
          type="primary"
          icon={<ExportOutlined />}
          onClick={() => navigate(`/tasks/${taskId}/output`)}
        >
          进入 Output 工作台
        </Button>
        <Button icon={<CopyOutlined />} onClick={handleCopy}>复制正式交付版</Button>
        <Button icon={<HistoryOutlined />} onClick={() => navigate(`/tasks/${taskId}`)}>查看历史任务</Button>
        <Button icon={<ReloadOutlined />} onClick={handleContinue}>基于当前结果继续</Button>
      </div>
    </Card>
  );
}

export default OutputPreviewCard;
