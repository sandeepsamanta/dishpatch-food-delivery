import mongoose from 'mongoose';

export const COUPON_TYPES = ['percent', 'flat', 'free_delivery'];

const couponSchema = new mongoose.Schema(
  {
    // null = valid at every restaurant
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', default: null, index: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 20 },
    description: { type: String, trim: true, maxlength: 140, default: '' },
    type: { type: String, enum: COUPON_TYPES, required: true },
    value: { type: Number, min: 0, default: 0 }, // percent (1-100) or flat rupees; ignored for free_delivery
    maxDiscount: { type: Number, min: 0, default: 0 }, // cap for percent coupons, 0 = no cap
    minOrder: { type: Number, min: 0, default: 0 },
    usageLimit: { type: Number, min: 0, default: 0 }, // total redemptions across all users, 0 = unlimited
    usedCount: { type: Number, min: 0, default: 0 },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.pre('validate', function checkValue(next) {
  if (this.type === 'percent' && (this.value < 1 || this.value > 100)) this.invalidate('value', 'A percent coupon needs a value from 1 to 100');
  if (this.type === 'flat' && this.value <= 0) this.invalidate('value', 'A flat coupon needs a value above 0');
  next();
});

export const Coupon = mongoose.model('Coupon', couponSchema);
