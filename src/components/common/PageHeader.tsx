type PageHeaderProps = {
  title: string;
  description?: string;
};

function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div style={{ marginBottom: 24 }}>
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
  );
}

export default PageHeader;