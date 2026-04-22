import { Tag } from 'antd';

type VersionTagProps = {
  version?: string;
  status?: 'published' | 'draft' | 'archived' | string;
};

export default function VersionTag({ version, status }: VersionTagProps) {
  if (!version) {
    return <Tag>未返回</Tag>;
  }

  if (status === 'published') {
    return <Tag color="success">{version} · 已发布</Tag>;
  }

  if (status === 'draft') {
    return <Tag color="warning">{version} · 草稿</Tag>;
  }

  if (status === 'archived') {
    return <Tag color="default">{version} · 已归档</Tag>;
  }

  return <Tag color="blue">{version}</Tag>;
}