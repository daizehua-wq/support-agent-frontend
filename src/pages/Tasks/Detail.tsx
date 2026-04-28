import { Card, Typography } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';

function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 4px 48px' }}>
      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          <FileTextOutlined style={{ marginRight: 12 }} />
          任务详情
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: 15 }}>
          任务 ID：{taskId}
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary" style={{ fontSize: 14 }}>
          任务详情页面即将升级，支持查看执行步骤、证据链、输出版本和操作记录。
        </Typography.Paragraph>
      </div>

      <Card
        style={{ borderRadius: 28, minHeight: 400 }}
        styles={{ body: { display: 'grid', placeItems: 'center', minHeight: 400 } }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 16 }}>
          任务详情正在建设中，敬请期待。
        </Typography.Text>
      </Card>
    </div>
  );
}

export default TaskDetailPage;
