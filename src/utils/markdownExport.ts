import type { OutputVersion } from '../types/output';

export function buildOutputMarkdown(taskTitle: string, taskGoal: string, version: OutputVersion, executionSteps: Array<{ title: string; status: string; summary?: string }>, evidences: Array<{ title: string; summary: string }>, risks: Array<{ title: string; description: string }>): string {
  const lines: string[] = [];

  lines.push(`# ${taskTitle}`);
  lines.push('');
  lines.push('## 任务目标');
  lines.push(taskGoal);
  lines.push('');

  lines.push('## 正式交付版');
  lines.push(version.formalVersion || '（未生成）');
  lines.push('');

  lines.push('## 简洁沟通版');
  lines.push(version.conciseVersion || '（未生成）');
  lines.push('');

  lines.push('## 口语跟进版');
  lines.push(version.spokenVersion || '（未生成）');
  lines.push('');

  lines.push('## 关键依据');
  for (const ev of evidences) {
    lines.push(`- **${ev.title}**：${ev.summary}`);
  }
  lines.push('');

  lines.push('## 风险与限制');
  for (const r of risks) {
    lines.push(`- **${r.title}**：${r.description}`);
  }
  lines.push('');

  lines.push('## 执行过程');
  for (const step of executionSteps) {
    const icon = step.status === 'done' ? '✅' : step.status === 'degraded' ? '⚠️' : step.status === 'failed' ? '❌' : '⏳';
    lines.push(`- ${icon} ${step.title}${step.summary ? `：${step.summary}` : ''}`);
  }

  return lines.join('\n');
}

export function downloadMarkdownFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
