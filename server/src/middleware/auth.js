import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyToken } from '../utils/token.js';

export const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new AppError('Not authenticated', 401);

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new AppError('Session expired or invalid. Please log in again.', 401);
  }

  const user = await User.findById(payload.id);
  if (!user) throw new AppError('User no longer exists', 401);
  req.user = user;
  next();
});

/** requireRole('owner') / requireRole('owner', 'rider'). Always used after `protect`. */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user?.role)) return next(new AppError(`This area is for ${roles.join(' or ')} accounts`, 403));
    next();
  };
