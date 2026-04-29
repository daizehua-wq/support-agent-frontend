import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Space, Spin, Tag, Typography, message } from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  ExportOutlined,
  FileSearchOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import ContinueTaskModal from '../../components/tasks/ContinueTaskModal';
import TaskArchiveHeader from '../../components/tasks/TaskArchiveHeader';
import VersionRecordTable from '../../components/tasks/VersionRecordTable';
import { MOCK_TASKS } from '../../utils/mockTasks';
import * as archiveAdapter from '../../utils/taskApiAdapter';
import type { TaskArchiveItem, TaskVersionRecord } from '../../types/taskArchive';

function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [showContinue, setShowContinue] = useState(false);
  const [task, setTask] = useState<TaskArchiveItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!taskId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    archiveAdapter.getTaskArchiveDetail(taskId).then((detail) => {
      if (!cancelled) {
        setTask(detail as unknown as TaskArchiveItem);
      }
    }).catch(() => {
      if (!cancelled) {
        const mock = MOCK_TASKS.find((t) => t.taskId === taskId) || null;
        setTask(mock);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [taskId]);

  if (!taskId) {
    return (
      <div style={{ maxWidth: 760, margin: '60px auto', textAlign: 'center' }}>
        <Typography.Text type="secondary">未提供任务 ID</Typography.Text>
      </div>
    );
  }

  if (loading || !task) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}>
        <Spin size="large" tip="加载任务详情…" />
      </div>
    );
  }

  const allVersions = [...task.planVersions, ...task.evidencePackVersions, ...task.outputVersions].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt),
  );

  const handleSetCurrent = useCallback(async (version: TaskVersionRecord) => {
    if (!taskId) return;
    try {
      const refreshed = await archiveAdapter.setCurrentTaskArchiveVersion(taskId, version.kind, version.versionId);
      setTask(refreshed as unknown as TaskArchiveItem);
      message.success(`已将 ${version.label} 设为当前${version.kind === 'task_plan' ? '计划' : version.kind === 'evidence_pack' ? '证据包' : '版本'}`);
    } catch {
      message.error('设置当前版本失败');
    }
  }, [taskId]);

  const handleContinueModal = useCallback(async (mode: string) => {
    if (!task) return;
    setShowContinue(false);

    const validModes = ['continue-output', 'supplement-regenerate', 'edit-goal', 'clone-task-structure'];
    if (!validModes.includes(mode)) {
      message.error('无效的继续模式');
      return;
    }

    const route = '/workbench';

    try {
      const result = await archiveAdapter.continueTaskArchive(task.taskId, mode);
      navigate(route, { state: { mode, taskId: result.resumeContext?.taskId || task.taskId, resumeContext: result.resumeContext } });
    } catch {
      message.error('继续推进失败');

    }
  }, [task, navigate]);

  const currentOutput = task.outputVersions.find((v: TaskVersionRecord) => v.status === 'active') || task.outputVersions[task.outputVersions.length - 1];

  return (
    <div className="ap-task-detail">
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tasks')} style={{ marginBottom: 16 }}>返回历史任务</Button>

      {/* Failed alerts */}
      {task.status === 'failed' && task.failureKind === 'external_source' && (
        <Alert
          type="error" banner showIcon
          message={task.taskGoal.includes('企查查') || task.taskGoal.includes('经营风险') ? '该任务需要外部企业数据' : '外部资料源不可用'}
          description={task.failureReason}
          style={{ borderRadius: 20, marginBottom: 18 }}
          action={
            <Space direction="vertical" size={4}>
              <Button size="small" onClick={() => { message.info('重试将在后续阶段接入'); }}>重试外部源</Button>
              {!task.taskGoal.includes('企查查') && !task.taskGoal.includes('经营风险') && (
                <Button size="small" onClick={() => { message.info('跳过外部源继续'); }}>跳过外部源继续</Button>
              )}
              {task.taskGoal.includes('企查查') && (
                <Button size="small" onClick={() => { message.info('基于有限资料继续'); }}>基于有限资料继续</Button>
              )}
            </Space>
          }
        />
      )}

      {/* Header */}
      <TaskArchiveHeader
        task={task}
        onContinue={() => setShowContinue(true)}
        onGoOutput={() => navigate(`/tasks/${task.taskId}/output`)}
      />

      {/* Task Goal */}
      <Card size="small" style={{ borderRadius: 22, marginTop: 18 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 4 }}>任务目标</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ fontSize: 14, lineHeight: 1.7, margin: 0 }}>
          {task.taskGoal}
        </Typography.Paragraph>
      </Card>

      {/* Version Records */}
      <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>版本记录</Typography.Text>
        <VersionRecordTable versions={allVersions} onSetCurrent={handleSetCurrent} />
      </Card>

      {/* Execution Timeline */}
      <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>执行过程</Typography.Text>
        {task.completedSteps?.map((s, i) => (
          <div key={i} style={{ padding: '4px 0', fontSize: 13 }}>
            <Tag color="green" style={{ fontSize: 10 }}>✅</Tag> {s}
          </div>
        ))}
        {task.pendingSteps?.map((s, i) => (
          <div key={i} style={{ padding: '4px 0', fontSize: 13 }}>
            <Tag color="default" style={{ fontSize: 10 }}>⏳</Tag> {s}
          </div>
        ))}
        {task.failedStep && (
          <div style={{ padding: '4px 0', fontSize: 13 }}>
            <Tag color="red" style={{ fontSize: 10 }}>❌</Tag> {task.failedStep}{task.failureReason ? `：${task.failureReason}` : ''}
          </div>
        )}
      </Card>

      {/* Analysis */}
      <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 4 }}>
          <FileSearchOutlined style={{ marginRight: 6 }} />分析结果
        </Typography.Text>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13, lineHeight: 1.7, margin: 0 }}>
          {task.analysisSummary || '暂无分析结果'}
        </Typography.Paragraph>
      </Card>

      {/* Evidence */}
      <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 4 }}>
          <FileSearchOutlined style={{ marginRight: 6 }} />证据资料
        </Typography.Text>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13, lineHeight: 1.7, margin: 0 }}>
          {task.evidenceSummary || '暂无证据资料'}
        </Typography.Paragraph>
      </Card>

      {/* Output Summary */}
      {task.hasOutput && (
        <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
          <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
            最终输出摘要
          </Typography.Text>
          {currentOutput && (
            <>
              <Tag color="blue" style={{ marginBottom: 8 }}>当前 Output：{currentOutput.label}</Tag>
              <Typography.Paragraph
                type="secondary"
                style={{ fontSize: 13, lineHeight: 1.7, margin: 0 }}
                ellipsis={{ rows: 5 }}
              >
                尊敬的客户：根据我们的分析，贵司当前处于半导体材料应用的关键阶段。我们建议从涂布工艺参数优化入手，结合行业标准方案，制定分阶段技术对接计划。近期我们将整理一份详细的技术方案供您审阅……
              </Typography.Paragraph>
              <Space style={{ marginTop: 12 }}>
                <Button type="primary" icon={<ExportOutlined />} onClick={() => navigate(`/tasks/${task.taskId}/output`)}>
                  进入 Output 工作台查看完整交付
                </Button>
                <Button onClick={() => { navigator.clipboard.writeText('尊敬的客户：根据我们的分析……'); message.success('已复制正式交付版'); }}>
                  复制正式交付版
                </Button>
              </Space>
            </>
          )}
          {!currentOutput && (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>暂无 Output 记录</Typography.Text>
          )}
        </Card>
      )}

      {/* Risks */}
      {task.risks.length > 0 && (
        <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
          <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
            <SafetyCertificateOutlined style={{ marginRight: 6 }} />风险与限制
          </Typography.Text>
          {task.risks.map((r, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <Tag color={r.level === 'danger' ? 'red' : r.level === 'warning' ? 'orange' : 'default'} style={{ fontSize: 10 }}>
                {r.title}
              </Tag>
              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>{r.description}</Typography.Text>
            </div>
          ))}
        </Card>
      )}

      {/* Execution Context */}
      <Card size="small" style={{ borderRadius: 22, marginTop: 14 }} styles={{ body: { padding: 16 } }}>
        <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 4 }}>执行上下文</Typography.Text>
        <Space size={6} wrap>
          <Tag style={{ fontSize: 11 }}>Assistant：{task.executionContext.assistantName}</Tag>
          <Tag style={{ fontSize: 11 }}>模型：{task.executionContext.modelName}</Tag>
          {task.executionContext.dataSources.map((ds, i) => (
            <Tag key={i} color={ds.status === 'healthy' ? 'green' : 'red'} style={{ fontSize: 11 }}>{ds.name}</Tag>
          ))}
        </Space>
      </Card>

      {/* Continue button at bottom */}
      {['continuable', 'failed'].includes(task.status) && (
        <div style={{ marginTop: 18, textAlign: 'center' }}>
          <Button type="primary" size="large" icon={<EditOutlined />} onClick={() => setShowContinue(true)}>
            继续推进
          </Button>
        </div>
      )}

      <ContinueTaskModal
        open={showContinue}
        onClose={() => setShowContinue(false)}
        onContinueOutput={() => handleContinueModal('continue-output')}
        onSupplementRegenerate={() => handleContinueModal('supplement-regenerate')}
        onEditGoal={() => handleContinueModal('edit-goal')}
        onCloneTask={() => handleContinueModal('clone-task-structure')}
      />
    </div>
  );
}

export default TaskDetailPage;
