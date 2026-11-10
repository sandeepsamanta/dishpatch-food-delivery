import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { signToken } from '../utils/token.js';

const authResponse = (user) => ({ user: user.toPublic(), token: signToken(user._id) });

export async function register(req, res) {
  const { name, email, password, role, phone } = req.body;
  if (await User.exists({ email })) throw new AppError('That email is already registered', 409);
  const user = await User.create({ name, email, password, role, phone });
  res.status(201).json(authResponse(user));
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  // Same message for unknown email and wrong password to avoid account enumeration.
  if (!user || !(await user.matchPassword(password))) throw new AppError('Invalid email or password', 401);
  res.json(authResponse(user));
}

export async function me(req, res) {
  res.json({ user: req.user.toPublic() });
}

export async function updateProfile(req, res) {
  const { name, phone, currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');
  if (name) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (newPassword) {
    if (!(await user.matchPassword(currentPassword))) throw new AppError('Current password is incorrect', 400);
    user.password = newPassword;
  }
  await user.save();
  res.json(authResponse(user));
}
