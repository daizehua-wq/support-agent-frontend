import type { ReactNode } from 'react';

import { Card } from 'antd';

type ResultCardProps = {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
};

function ResultCard({ title, extra, children }: ResultCardProps) {
  return (
    <Card
      title={title}
      extra={extra}
      style={{ marginBottom: 16, borderRadius: 8 }}
      styles={{ body: { paddingTop: 16, paddingBottom: 16 } }}
    >
      {children}
    </Card>
  );
}

export default ResultCard;
