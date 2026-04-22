import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  description?: string;
  extra?: ReactNode;
};

function PageHeader({ title, description, extra }: PageHeaderProps) {
  return (
    <div
      style={{
        marginBottom: 24,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: '1 1 420px', minWidth: 0 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 700,
            color: '#1f1f1f',
          }}
        >
          {title}
        </h1>

        {description ? (
          <p
            style={{
              marginTop: 8,
              marginBottom: 0,
              fontSize: 14,
              color: '#8c8c8c',
            }}
          >
            {description}
          </p>
        ) : null}
      </div>

      {extra ? <div style={{ flex: '0 0 auto' }}>{extra}</div> : null}
    </div>
  );
}

export default PageHeader;
