import { Button, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useState, useCallback } from 'react';
import type { OutputVersion, OutputEvidence, OutputRisk } from '../../types/output';
import { buildOutputMarkdown, downloadMarkdownFile } from '../../utils/markdownExport';
import * as outputAdapter from '../../utils/taskApiAdapter';

type MarkdownExportActionProps = {
  taskId?: string;
  taskTitle: string;
  taskGoal: string;
  currentVersion: OutputVersion;
  evidences: OutputEvidence[];
  risks: OutputRisk[];
  executionSteps: Array<{ title: string; status: string; summary?: string }>;
  disabled?: boolean;
};

function MarkdownExportAction({
  taskId,
  taskTitle,
  taskGoal,
  currentVersion,
  evidences,
  risks,
  executionSteps,
  disabled = false,
}: MarkdownExportActionProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      // Try API first
      if (taskId) {
        try {
          const result = await outputAdapter.exportOutputMarkdown(taskId, {
            taskTitle,
            taskGoal,
            currentVersion,
            evidences: evidences.map((e) => ({ title: e.title, summary: e.summary })),
            risks: risks.map((r) => ({ title: r.title, description: r.description })),
            executionSteps,
          });
          if (result) {
            downloadMarkdownFile(result.markdown, result.filename);
            message.success('已导出当前版本 Markdown');
            return;
          }
        } catch {
          // Fall through to frontend export
        }
      }

      // Fallback: frontend markdown export
      const md = buildOutputMarkdown(
        taskTitle,
        taskGoal,
        currentVersion,
        executionSteps,
        evidences.map((e) => ({ title: e.title, summary: e.summary })),
        risks.map((r) => ({ title: r.title, description: r.description })),
      );
      const filename = `output-${currentVersion.label}-${Date.now()}.md`;
      downloadMarkdownFile(md, filename);
      message.success('已导出当前版本 Markdown');
    } catch {
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  }, [taskId, taskTitle, taskGoal, currentVersion, evidences, risks, executionSteps]);

  return (
    <Button
      icon={<DownloadOutlined />}
      onClick={handleExport}
      disabled={disabled || exporting}
      loading={exporting}
    >
      导出当前版本 Markdown
    </Button>
  );
}

export default MarkdownExportAction;
