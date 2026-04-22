export default function security(req, res, next) {
  console.log(
    `[mock][${req.traceId || 'no-trace'}] security placeholder ${req.method} ${req.originalUrl || req.url}`,
  );
  next();
}
