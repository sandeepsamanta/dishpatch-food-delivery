import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export const notFound = (req, _res, next) => next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  let status = err.statusCode || 500;
  let message = err.message || 'Server error';
  let details = err.details;

  if (err instanceof ZodError) {
    status = 400;
    details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    message = details[0]?.message || 'Validation failed';
  } else if (err.name === 'CastError') {
    status = 404;
    message = 'Resource not found';
  } else if (err.name === 'ValidationError' && err.errors) {
    status = 400;
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    message = details[0]?.message || 'Validation failed';
  } else if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    message = `That ${field} is already in use`;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  }

  if (status >= 500) {
    if (env.nodeEnv !== 'test') console.error(err);
    if (env.isProd) message = 'Something went wrong on our side';
  }

  res.status(status).json({
    message,
    ...(details ? { details } : {}),
    ...(!env.isProd && status >= 500 ? { stack: err.stack } : {}),
  });
};
