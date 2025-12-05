const errorHandler = (error, req, res, next) => {
  console.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Default error response
  let status = error.status || 500;
  let message = error.message || 'Internal Server Error';

  // Handle specific error types
  if (error.name === 'ValidationError') {
    status = 400;
    message = 'Validation Error';
  } else if (error.name === 'UnauthorizedError') {
    status = 401;
    message = 'Unauthorized';
  } else if (error.name === 'CastError') {
    status = 400;
    message = 'Invalid ID format';
  } else if (error.code === 'ENOTFOUND') {
    status = 503;
    message = 'Service temporarily unavailable';
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && status >= 500) {
    message = 'Internal Server Error';
  }

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

module.exports = errorHandler;
