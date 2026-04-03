

type EmptyBlockProps = {
  text?: string;
};

function EmptyBlock({ text = '暂无数据' }: EmptyBlockProps) {
  return (
    <div
      style={{
        padding: '32px 16px',
        textAlign: 'center',
        color: '#bfbfbf',
        fontSize: 14,
      }}
    >
      {text}
    </div>
  );
}

export default EmptyBlock;