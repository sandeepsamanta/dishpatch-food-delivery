import { Coupon } from '../models/Coupon.js';
import { Order } from '../models/Order.js';
import { AppError } from '../utils/AppError.js';
import { VOID } from '../utils/orderFlow.js';
import { round2 } from '../utils/pricing.js';

const inr = (n) => `₹${Math.ceil(n)}`;

/**
 * Checks every rule for `code` and returns { coupon, discount, freeDelivery }.
 * Throws a 400 with a message the customer can act on.
 */
export async function evaluateCoupon({ code, restaurantId, subtotal, userId }) {
  const coupon = await Coupon.findOne({ code: String(code).trim().toUpperCase() });
  if (!coupon || !coupon.active) throw new AppError('That coupon code is not valid', 400);
  if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new AppError('This coupon has expired', 400);
  if (coupon.restaurant && String(coupon.restaurant) !== String(restaurantId)) {
    throw new AppError('This coupon is not valid for this restaurant', 400);
  }
  if (subtotal < coupon.minOrder) {
    throw new AppError(`Add ${inr(coupon.minOrder - subtotal)} more to use ${coupon.code} (minimum order ${inr(coupon.minOrder)})`, 400);
  }
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) throw new AppError('This coupon has been fully redeemed', 400);

  // One use per customer. Cancelled and rejected orders give the coupon back.
  const already = await Order.exists({ customer: userId, couponCode: coupon.code, status: { $nin: VOID } });
  if (already) throw new AppError('You have already used this coupon', 400);

  let discount = 0;
  if (coupon.type === 'percent') {
    discount = (subtotal * coupon.value) / 100;
    if (coupon.maxDiscount > 0) discount = Math.min(discount, coupon.maxDiscount);
  } else if (coupon.type === 'flat') {
    discount = Math.min(coupon.value, subtotal);
  }
  return { coupon, discount: round2(discount), freeDelivery: coupon.type === 'free_delivery' };
}

/**
 * Reserves one redemption. The `usedCount < usageLimit` condition lives inside the update itself,
 * so two simultaneous checkouts cannot both take the last redemption.
 */
export async function claimCoupon(coupon) {
  const filter = { _id: coupon._id };
  if (coupon.usageLimit > 0) filter.usedCount = { $lt: coupon.usageLimit };
  const claimed = await Coupon.findOneAndUpdate(filter, { $inc: { usedCount: 1 } });
  if (!claimed) throw new AppError('This coupon has been fully redeemed', 400);
}

export const releaseCoupon = (code) => (code ? Coupon.updateOne({ code, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }) : null);
