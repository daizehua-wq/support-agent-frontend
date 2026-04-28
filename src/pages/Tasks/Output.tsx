import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Space, Spin, Tag, Typography, message } from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  ExportOutlined,
  FileTextOutlined,
  HistoryOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { generateMockOutput } from '../../utils/mockOutput';
import EvidenceCard from '../../components/output/EvidenceCard';
import MarkdownExportAction from '../../components/output/MarkdownExportAction';
import OutputTabs from '../../components/output/OutputTabs';
import OutputVersionList from '../../components/output/OutputVersionList';
import RiskPanel from '../../components/output/RiskPanel';
import VersionSwitch from '../../components/output/VersionSwitch';
import type { OutputDetail, OutputTabKey } from '../../types/output';

function OutputPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [output, setOutput] = useState<OutputDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OutputTabKey>('formal');
  const [viewVersionId, setViewVersionId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!taskId) {
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      setOutput(generateMockOutput(taskId));
      setLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [taskId]);

  const currentVersionId = viewVersionId || output?.currentVersionId || '';
  const currentVersion = useMemo(
    () => output?.versions.find((v) => v.versionId === currentVersionId),
    [output, currentVersionId],
  );
  const versions = output?.versions || [];
  const evidences = output?.evidences || [];
  const risks = output?.risks || [];
  const executionSteps = output?.executionSteps || [];

  const status = output?.status || 'success';
  const isGenerating = status === 'generating' || regenerating;
  const isFailed = status === 'failed';
  const isDegraded = status === 'degraded';
  const isInsufficient = status === 'evidence_insufficient';
  const hasMultipleVersions = versions.length > 1;

  const handleSetCurrent = useCallback((versionId: string) => {
    setOutput((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        currentVersionId: versionId,
        versions: prev.versions.map((v) => ({
          ...v,
          isCurrent: v.versionId === versionId,
        })),
      };
    });
  }, []);

  const handleViewVersion = useCallback((versionId: string) => {
    setViewVersionId(versionId);
  }, []);

  const handleSwitchVersion = useCallback((versionId: string) => {
    setViewVersionId(versionId);
  }, []);

  const handleRegenerate = () => {
    setRegenerating(true);
    setTimeout(() => {
      setRegenerating(false);
      setViewVersionId(null);
      setOutput((prev) => {
        if (!prev) return prev;
        const newVersionId = `${prev.taskId}-v${prev.versions.length + 1}`;
        const newVersion = {
          versionId: newVersionId,
          label: `v${prev.versions.length + 1}`,
          status: 'success' as const,
          isCurrent: true,
          reason: getRegenReason(prev.taskId),
          createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
          formalVersion: currentVersion?.formalVersion,
          conciseVersion: currentVersion?.conciseVersion,
          spokenVersion: currentVersion?.spokenVersion,
        };
        return {
          ...prev,
          status: 'success' as const,
          currentVersionId: newVersionId,
          versions: [
            ...prev.versions.map((v) => ({ ...v, isCurrent: false })),
            newVersion,
          ],
        };
      });
      message.success('新版本已生成');
    }, 2000);
  };

  const handleRetryVersion = (versionId: string) => {
    setRegenerating(true);
    setTimeout(() => {
      setRegenerating(false);
      setOutput((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: 'success' as const,
          versions: prev.versions.map((v) =>
            v.versionId === versionId
              ? { ...v, status: 'success' as const, failureReason: undefined }
              : v,
          ),
        };
      });
      message.success('版本生成成功');
    }, 2000);
  };

  const handleStopGenerating = () => {
    setRegenerating(false);
    setOutput((prev) => {
      if (!prev) return prev;
      return { ...prev, status: 'success' as const };
    });
    message.info('已停止生成');
  };

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
        <Spin size="large" tip="加载 Output…" />
      </div>
    );
  }

  if (!taskId || !output) {
    return (
      <div style={{ maxWidth: 760, margin: '60px auto', textAlign: 'center', padding: 24 }}>
        <FileTextOutlined style={{ fontSize: 48, color: '#94a3b8' }} />
        <Typography.Title level={4} style={{ marginTop: 16 }}>未找到 Output</Typography.Title>
        <Typography.Paragraph type="secondary">未提供有效的任务 ID，或该任务暂未生成 Output。</Typography.Paragraph>
        <Button type="primary" size="large" icon={<ArrowLeftOutlined />} onClick={() => navigate('/workbench')}>
          返回工作台
        </Button>
      </div>
    );
  }

  return (
    <div className="ap-output-page">
      {/* Top Alerts */}
      {isInsufficient && (
        <Alert
          type="warning" banner showIcon
          message="证据不足"
          description="当前输出已生成，但缺少部分关键信息。建议补充资料后重新生成。"
          style={{ borderRadius: 20, marginBottom: 18 }}
        />
      )}
      {isDegraded && (
        <Alert
          type="warning" banner showIcon
          message="外部资料源降级"
          description="本次输出未使用外部资料源。系统已基于内部知识库、Reference Pack 和已有上下文生成内容。"
          style={{ borderRadius: 20, marginBottom: 18 }}
        />
      )}
      {isFailed && versions.length === 0 && (
        <Alert
          type="error" banner showIcon
          message="暂未生成 Output"
          description="分析结果和证据资料已保留。你可以重试生成或返回工作台修改计划。"
          style={{ borderRadius: 20, marginBottom: 18 }}
        />
      )}
      {isFailed && versions.length > 0 && (
        <Alert
          type="error" banner showIcon
          message="新版本生成失败"
          description="当前展示旧版本，旧版本不受影响。你可以重试生成或查看旧版本。"
          style={{ borderRadius: 20, marginBottom: 18 }}
        />
      )}
      {isGenerating && (
        <Alert
          type="info" banner showIcon
          message={`正在生成新版本${versions.length > 0 ? ` · 当前展示${versions.length > 1 ? `v${versions.length - 1}` : '旧版本'}` : ''}`}
          description={versions.length > 0 ? '旧版本不受影响，生成完成后将自动显示新版本。' : '正在生成正式交付版、简洁沟通版、口语跟进版。'}
          style={{ borderRadius: 20, marginBottom: 18 }}
        />
      )}

      {/* Page Header */}
      <div className="ap-output-target">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/workbench')} style={{ marginBottom: 12 }}>返回工作台</Button>
        <Typography.Title level={2} style={{ margin: 0 }}>
          <ExportOutlined style={{ marginRight: 12 }} />
          Output 工作台
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 4, fontSize: 15 }}>
          {output.taskTitle}
        </Typography.Paragraph>
      </div>

      {/* Version Switch */}
      {hasMultipleVersions && !isGenerating && (
        <div style={{ marginBottom: 16 }}>
          <VersionSwitch versions={versions} currentVersionId={currentVersionId} onSwitch={handleSwitchVersion} />
        </div>
      )}

      {/* Main Layout */}
      <div className="ap-output-layout">
        {/* Left: Main Output */}
        <div className="ap-output-main">
          {isGenerating && (
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <Spin tip="生成中…"><div style={{ padding: 24 }} /></Spin>
              <Button icon={<StopOutlined />} onClick={handleStopGenerating} size="small" style={{ marginTop: 8 }}>停止生成</Button>
            </div>
          )}

          {currentVersion && !isGenerating && (
            <OutputTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              formal={currentVersion.formalVersion}
              concise={currentVersion.conciseVersion}
              spoken={currentVersion.spokenVersion}
              disabled={isFailed && !currentVersion.formalVersion}
            />
          )}

          {isFailed && !currentVersion?.formalVersion && !isGenerating && (
            <Card style={{ borderRadius: 24, textAlign: 'center', padding: 40 }}>
              <Typography.Text type="secondary" style={{ fontSize: 15, display: 'block', marginBottom: 16 }}>
                暂未生成 Output，分析结果和证据资料已保留。
              </Typography.Text>
            </Card>
          )}

          {/* Actions */}
          {!isGenerating && (
            <div className="ap-output-actions">
              <Space wrap>
                <Button type="primary" icon={<ReloadOutlined />} onClick={handleRegenerate}>
                  {isFailed ? '重试生成' : hasMultipleVersions ? '重新生成' : '重新生成'}
                </Button>
                {currentVersion && (
                  <MarkdownExportAction
                    taskTitle={output.taskTitle}
                    taskGoal={output.taskGoal}
                    currentVersion={currentVersion}
                    evidences={evidences}
                    risks={risks}
                    executionSteps={executionSteps}
                  />
                )}
                <Button icon={<EditOutlined />} onClick={() => message.info('Missing Info Drawer 将在后续 FE-8 接入。', 3)}>
                  补充资料再生成
                </Button>
                <Button icon={<HistoryOutlined />} onClick={() => navigate(`/tasks/${output.taskId}`)}>
                  查看历史任务
                </Button>
                {isInsufficient && (
                  <Button icon={<ReloadOutlined />} onClick={handleRegenerate}>
                    补充资料再生成
                  </Button>
                )}
                {isDegraded && (
                  <Button icon={<ReloadOutlined />} onClick={handleRegenerate}>
                    重试外部源并生成新版本
                  </Button>
                )}
              </Space>
            </div>
          )}
        </div>

        {/* Right: Context Sidebar */}
        <div className="ap-output-aside">
          <Card size="small" styles={{ body: { padding: 16 } }}>
            <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
              执行过程
            </Typography.Text>
            {executionSteps.map((step, i) => (
              <div key={i} style={{ padding: '6px 0', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <Tag color={step.status === 'done' ? 'green' : step.status === 'degraded' ? 'orange' : step.status === 'failed' ? 'red' : 'default'} style={{ fontSize: 10 }}>
                  {step.status === 'done' ? '✅' : step.status === 'degraded' ? '⚠️' : step.status === 'failed' ? '❌' : '⏳'}
                </Tag>
                <div>
                  <Typography.Text style={{ fontSize: 12 }}>{step.title}</Typography.Text>
                  {step.summary && (
                    <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{step.summary}</Typography.Text>
                  )}
                </div>
              </div>
            ))}
          </Card>

          <OutputVersionList
            versions={versions}
            currentVersionId={currentVersionId}
            onSetCurrent={handleSetCurrent}
            onRetry={handleRetryVersion}
            onView={handleViewVersion}
          />

          <EvidenceCard evidences={evidences} />
          <RiskPanel risks={risks} />
        </div>
      </div>
    </div>
  );
}

function getRegenReason(taskId: string): string {
  if (taskId.includes('degraded')) return '重试外部源后重新生成';
  if (taskId.includes('insufficient')) return '补充资料后重新生成';
  return '重新生成';
}

export default OutputPage;
