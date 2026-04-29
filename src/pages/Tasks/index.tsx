import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, Select, Space, Spin, Typography, message } from 'antd';
import { HistoryOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import ContinueTaskModal from '../../components/tasks/ContinueTaskModal';
import HistoryTaskCard from '../../components/tasks/HistoryTaskCard';
import HistoryTaskTable from '../../components/tasks/HistoryTaskTable';
import * as archiveAdapter from '../../utils/taskApiAdapter';
import type { TaskArchiveItem } from '../../types/taskArchive';

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'full_workflow', label: '完整任务流' },
  { value: 'customer_analysis', label: '客户分析' },
  { value: 'evidence_search', label: '资料检索' },
  { value: 'output_generation', label: '输出生成' },
];

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'continuable', label: '可继续' },
  { value: 'failed', label: '失败' },
  { value: 'running', label: '执行中' },
  { value: 'needs_info', label: '需补充信息' },
  { value: 'completed', label: '已完成' },
  { value: 'draft', label: '草稿' },
];

function TasksPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [continueTarget, setContinueTarget] = useState<TaskArchiveItem | null>(null);
  const [showContinue, setShowContinue] = useState(false);
  const [allTasks, setAllTasks] = useState<TaskArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    archiveAdapter.getTaskArchiveList().then((items) => {
      if (!cancelled) setAllTasks(items);
    }).catch(() => {
      if (!cancelled) setListError(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let tasks = allTasks;
    if (search.trim()) {
      tasks = tasks.filter((t) => t.taskTitle.toLowerCase().includes(search.toLowerCase()));
    }
    if (typeFilter !== 'all') {
      tasks = tasks.filter((t) => t.taskType === typeFilter);
    }
    if (statusFilter !== 'all') {
      tasks = tasks.filter((t) => t.status === statusFilter);
    }
    return tasks;
  }, [search, typeFilter, statusFilter, allTasks]);

  const continuableTasks = useMemo(
    () => filtered.filter((t) => t.status === 'continuable'),
    [filtered],
  );

  const otherTasks = useMemo(
    () => filtered.filter((t) => t.status !== 'continuable'),
    [filtered],
  );

  const handleContinue = useCallback((task: TaskArchiveItem) => {
    setContinueTarget(task);
    setShowContinue(true);
  }, []);

  const handleContinueModal = useCallback(async (mode: string) => {
    if (!continueTarget) return;
    setShowContinue(false);

    const validModes = ['continue-output', 'supplement-regenerate', 'edit-goal', 'clone-task-structure'];
    if (!validModes.includes(mode)) {
      message.error('无效的继续模式');
      return;
    }

    const route = '/workbench';

    try {
      const result = await archiveAdapter.continueTaskArchive(continueTarget.taskId, mode);
      navigate(route, { state: { mode, taskId: result.resumeContext?.taskId || continueTarget.taskId, resumeContext: result.resumeContext } });
    } catch {
      message.error('继续推进失败');
    }
  }, [continueTarget, navigate]);

  return (
    <div className="ap-tasks-page">
      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          <HistoryOutlined style={{ marginRight: 12 }} />
          历史任务
        </Typography.Title>
      </div>

      {/* Filters */}
      <div className="ap-task-filters">
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索任务标题…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 260 }}
          allowClear
        />
        <Select value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} style={{ width: 140 }} />
        <Select value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} style={{ width: 140 }} />
        <Space style={{ marginLeft: 'auto' }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/workbench')}>新建任务</Button>
        </Space>
      </div>

      {/* Loading */}
      {loading && (
        <Card style={{ borderRadius: 28, textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="加载历史任务…" />
        </Card>
      )}

      {/* List Error */}
      {!loading && listError && (
        <Card style={{ borderRadius: 28, textAlign: 'center', padding: 40 }}>
          <Typography.Text type="secondary" style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>历史任务加载失败</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>暂时无法获取历史任务列表。你仍可以进入工作台创建新任务。</Typography.Text>
          <Space>
            <Button onClick={() => window.location.reload()}>重新加载</Button>
            <Button type="primary" onClick={() => navigate('/workbench')}>进入工作台</Button>
          </Space>
        </Card>
      )}

      {/* Continue Highlight */}
      {!loading && !listError && continuableTasks.length > 0 && search === '' && statusFilter === 'all' && (
        <div className="ap-task-highlight">
          <Typography.Title level={5} style={{ margin: '0 0 12px' }}>
            你有 {continuableTasks.length} 个可继续任务
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 14 }}>
            这些任务已经保存进度，可以从上次中断的位置继续推进。
          </Typography.Paragraph>
          {continuableTasks.map((task) => (
            <HistoryTaskCard key={task.taskId} task={task} onContinue={handleContinue} />
          ))}
        </div>
      )}

      {/* True Empty */}
      {!loading && !listError && allTasks.length === 0 && (
        <Card style={{ borderRadius: 28, textAlign: 'center', padding: 40, minHeight: 300, display: 'grid', placeItems: 'center' }}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 16, display: 'block', marginBottom: 8 }}>
              还没有历史任务
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>
              创建并完成第一个任务后，它会自动保存到历史任务中。输入目标开始创建任务。
            </Typography.Text>
            <Button type="primary" onClick={() => navigate('/workbench')}>新建任务</Button>
          </div>
        </Card>
      )}

      {/* Search Empty */}
      {allTasks.length > 0 && filtered.length === 0 && (
        <Card style={{ borderRadius: 28, textAlign: 'center', padding: 40, minHeight: 300, display: 'grid', placeItems: 'center' }}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 16, display: 'block', marginBottom: 8 }}>
              没有找到匹配的历史任务
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>
              当前搜索条件没有匹配结果。你可以清空搜索条件，或进入工作台创建新任务。
            </Typography.Text>
            <Space>
              <Button onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); }}>清空搜索</Button>
              <Button type="primary" onClick={() => navigate('/workbench')}>新建任务</Button>
            </Space>
          </div>
        </Card>
      )}

      {/* Table */}
      {otherTasks.length > 0 && (
        <Card className="ap-task-table-card">
          <HistoryTaskTable tasks={otherTasks} onContinue={handleContinue} />
        </Card>
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

export default TasksPage;
