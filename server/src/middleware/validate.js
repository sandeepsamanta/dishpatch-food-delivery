import { AppError } from '../utils/AppError.js';

/**
 * validate({ body: schema, query: schema, params: schema })
 * Parsed (and coerced / stripped) values replace the originals.
 */
export const validate = (schemas) => (req, _res, next) => {
  for (const key of ['body', 'query', 'params']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return next(new AppError(details[0]?.message || 'Validation failed', 400, details));
    }
    // req.query is a getter in some setups; define it explicitly.
    Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true });
  }
  next();
};
