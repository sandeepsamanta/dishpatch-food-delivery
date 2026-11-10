import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

export const ROLES = ['customer', 'owner', 'rider'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ROLES, default: 'customer' },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.matchPassword = function matchPassword(plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toPublic = function toPublic() {
  return { _id: this._id, name: this.name, email: this.email, role: this.role, phone: this.phone, createdAt: this.createdAt };
};

export const User = mongoose.model('User', userSchema);
