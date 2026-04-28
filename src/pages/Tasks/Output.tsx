import { Button, Card, Space, Typography } from 'antd';
import { ExportOutlined, FileTextOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';

function TaskOutputPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 4px 48px' }}>
      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          <ExportOutlined style={{ marginRight: 12 }} />
          Output 输出工作台
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: 15 }}>
          任务 ID：{taskId}
        </Typography.Paragraph>
      </div>

      <Card
        style={{ borderRadius: 28, minHeight: 400 }}
        styles={{ body: { display: 'grid', placeItems: 'center', minHeight: 400 } }}
      >
        <Space direction="vertical" align="center" size="large">
          <FileTextOutlined style={{ fontSize: 48, color: '#94a3b8' }} />
          <Typography.Text type="secondary" style={{ fontSize: 16 }}>
            Output 输出工作台即将升级为完整交付页面。
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 14 }}>
            未来这里将支持三版输出切换（正式版 / 精简版 / 口播版）、证据引用、风险提示和 Markdown 导出。
          </Typography.Text>
          <Button type="primary" size="large" onClick={() => navigate('/workbench')}>
            进入工作台创建任务
          </Button>
        </Space>
      </Card>
    </div>
  );
}

export default TaskOutputPage;
