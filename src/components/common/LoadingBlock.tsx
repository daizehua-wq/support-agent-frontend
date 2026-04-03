type LoadingBlockProps = {
  text?: string;
};

function LoadingBlock({ text = '加载中...' }: LoadingBlockProps) {
  return (
    <div
      style={{
        padding: '32px 16px',
        textAlign: 'center',
        color: '#8c8c8c',
        fontSize: 14,
      }}
    >
      {text}
    </div>
  );
}

export default LoadingBlock;