import { Button, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { OutputVersion, OutputEvidence, OutputRisk } from '../../types/output';
import { buildOutputMarkdown, downloadMarkdownFile } from '../../utils/markdownExport';

type MarkdownExportActionProps = {
  taskTitle: string;
  taskGoal: string;
  currentVersion: OutputVersion;
  evidences: OutputEvidence[];
  risks: OutputRisk[];
  executionSteps: Array<{ title: string; status: string; summary?: string }>;
  disabled?: boolean;
};

function MarkdownExportAction({
  taskTitle,
  taskGoal,
  currentVersion,
  evidences,
  risks,
  executionSteps,
  disabled = false,
}: MarkdownExportActionProps) {
  const handleExport = () => {
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
  };

  return (
    <Button
      icon={<DownloadOutlined />}
      onClick={handleExport}
      disabled={disabled}
    >
      导出当前版本 Markdown
    </Button>
  );
}

export default MarkdownExportAction;
