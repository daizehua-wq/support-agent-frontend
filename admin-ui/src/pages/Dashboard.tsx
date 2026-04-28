import { useEffect, useState } from 'react';
import { Card, Col, Row, Space, Statistic, Table, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  fetchModelPerformance,
  fetchStats,
  type AdminStats,
  type ModelPerformance,
} from '../api/admin';

const fallbackStats: AdminStats = {
  totalConnections: 0,
  todaySessions: 0,
  totalMessages: 0,
  activeApps: 0,
  todayApiCalls: 0,
  todayTokensUsed: 0,
  modelUsageRank: [],
  ruleHitRate: 0,
  knowledgeGapCount: 0,
  todayActiveSessions: 0,
  totalTokensUsedToday: 0,
};

function Dashboard() {
  const [stats, setStats] = useState<AdminStats>(fallbackStats);
  const [modelPerformance, setModelPerformance] = useState<ModelPerformance[]>([]);
  const [loading, setLoading] = useState(false);

  const loadStats = async () => {
    try {
      setLoading(true);
      const [nextStats, nextModelPerformance] = await Promise.all([
        fetchStats(),
        fetchModelPerformance(),
      ]);
      setStats(nextStats);
      setModelPerformance(nextModelPerformance);
    } catch (error) {
      console.error('stats load failed:', error);
      message.warning('统计接口暂不可用，已显示占位数据');
      setStats(fallbackStats);
      setModelPerformance([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStats();
  }, []);

  const modelColumns: ColumnsType<ModelPerformance> = [
    {
      title: '模型',
      dataIndex: 'model',
      key: 'model',
    },
    {
      title: '调用数',
      dataIndex: 'calls',
      key: 'calls',
      width: 92,
    },
    {
      title: '成功率',
      dataIndex: 'successRate',
      key: 'successRate',
      width: 104,
      render: (value: number) => `${Math.round(Number(value || 0) * 100)}%`,
    },
    {
      title: '平均延迟',
      dataIndex: 'avgLatencyMs',
      key: 'avgLatencyMs',
      width: 120,
      render: (value: number) => `${Number(value || 0)} ms`,
    },
  ];

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2} style={{ marginBottom: 4 }}>
          仪表盘
        </Typography.Title>
        <Typography.Text type="secondary">
          汇总内部连接、对话留痕、多租户应用和开放 API 用量。
        </Typography.Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card loading={loading}>
            <Statistic title="总连接数" value={stats.totalConnections} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card loading={loading}>
            <Statistic title="今日会话数" value={stats.todaySessions} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card loading={loading}>
            <Statistic title="总消息数" value={stats.totalMessages} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card loading={loading}>
            <Statistic title="活跃应用数" value={stats.activeApps} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card loading={loading}>
            <Statistic title="今日 API 调用量" value={stats.todayApiCalls} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card loading={loading}>
            <Statistic
              title="今日 Token 消耗量"
              value={stats.totalTokensUsedToday || stats.todayTokensUsed}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="模型性能对比" loading={loading}>
            <Table
              rowKey="model"
              size="small"
              columns={modelColumns}
              dataSource={modelPerformance.slice(0, 3)}
              pagination={false}
              locale={{ emptyText: '暂无模型调用日志' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="知识库覆盖率" loading={loading}>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Statistic
                  title="规则命中率"
                  value={Math.round(Number(stats.ruleHitRate || 0) * 100)}
                  suffix="%"
                />
              </Col>
              <Col span={12}>
                <Statistic title="知识缺口" value={stats.knowledgeGapCount || 0} />
              </Col>
              <Col span={12}>
                <Statistic title="今日活跃会话" value={stats.todayActiveSessions || 0} />
              </Col>
              <Col span={12}>
                <Statistic
                  title="模型 Token"
                  value={stats.totalTokensUsedToday || stats.todayTokensUsed || 0}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

export default Dashboard;
