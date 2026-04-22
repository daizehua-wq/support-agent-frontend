const normalizeStatusCode = (error) => {
  const statusCode = Number(error?.statusCode || error?.status || 500);
  return Number.isInteger(statusCode) && statusCode >= 400 ? statusCode : 500;
};

export default function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = normalizeStatusCode(error);
  const message = error?.message || 'mock server internal error';

  console.error(`[mock][${req.traceId || 'no-trace'}] unhandled error:`, error);

  return res.status(statusCode).json({
    code: statusCode,
    message,
    error: {
      name: error?.name || 'Error',
      message,
    },
    traceId: req.traceId || '',
  });
}
