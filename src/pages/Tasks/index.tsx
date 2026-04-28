import { Card, Typography } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';

function TasksPage() {
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 4px 48px' }}>
      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          <HistoryOutlined style={{ marginRight: 12 }} />
          历史任务
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: 15 }}>
          即将升级为任务档案系统，支持查看所有已完成和进行中的任务、版本记录和输出交付。
        </Typography.Paragraph>
      </div>

      <Card
        style={{ borderRadius: 28, minHeight: 400 }}
        styles={{ body: { display: 'grid', placeItems: 'center', minHeight: 400 } }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 16 }}>
          任务档案系统正在建设中，敬请期待。
        </Typography.Text>
      </Card>
    </div>
  );
}

export default TasksPage;
