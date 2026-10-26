function notFoundHandler(_req, res) {
  res.status(404).json({
    success: false,
    message: 'Resource not found',
  });
}

function errorHandler(error, _req, res, _next) {
  const statusCode = error.statusCode || 500;

  if (statusCode >= 500) {
    console.error('Unhandled request error', {
      name: error.name || 'Error',
      code: error.code || 'INTERNAL_ERROR',
    });
  }

  const response = {
    success: false,
    message: statusCode === 500 ? 'Internal server error' : error.message,
  };

  if (error.details) {
    response.errors = error.details;
  }

  res.status(statusCode).json(response);
}

module.exports = { notFoundHandler, errorHandler };
