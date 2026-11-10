import { MenuItem } from '../models/MenuItem.js';
import { Restaurant } from '../models/Restaurant.js';
import { AppError } from '../utils/AppError.js';
import { fromPoint, haversineKm } from '../utils/geo.js';
import { computeTotals, deliveryFeeFor, etaMinutes, round1, round2 } from '../utils/pricing.js';
import { evaluateCoupon } from './couponService.js';

/**
 * Prices an order entirely from database values. The client only sends item ids, chosen option names,
 * quantities, a coupon code and a delivery location, so nothing it sends can change a price.
 */
export async function priceOrder({ userId, restaurantId, items, couponCode, location, forCheckout = false }) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new AppError('Restaurant not found', 404);
  if (forCheckout && !restaurant.isOpen) throw new AppError(`${restaurant.name} is closed right now`, 409);

  const ids = [...new Set(items.map((i) => i.menuItem))];
  const menu = await MenuItem.find({ _id: { $in: ids }, restaurant: restaurant._id });
  const byId = new Map(menu.map((m) => [String(m._id), m]));

  const lines = items.map((line) => {
    const dish = byId.get(line.menuItem);
    if (!dish) throw new AppError('An item in your cart does not belong to this restaurant', 400);
    if (!dish.available) throw new AppError(`${dish.name} is not available right now`, 409);

    const chosen = [];
    for (const group of dish.optionGroups) {
      const picks = (line.options || []).filter((o) => o.group === group.name);
      if (picks.length < group.min) throw new AppError(`Choose ${group.min === 1 ? 'an option' : `at least ${group.min}`} for "${group.name}" on ${dish.name}`, 400);
      if (picks.length > group.max) throw new AppError(`Choose at most ${group.max} for "${group.name}" on ${dish.name}`, 400);
      if (new Set(picks.map((p) => p.name)).size !== picks.length) throw new AppError(`Duplicate option for "${group.name}"`, 400);
      for (const pick of picks) {
        const option = group.options.find((o) => o.name === pick.name);
        if (!option) throw new AppError(`"${pick.name}" is not an option for ${dish.name}`, 400);
        chosen.push({ group: group.name, name: option.name, price: option.price });
      }
    }
    const unknown = (line.options || []).find((o) => !dish.optionGroups.some((g) => g.name === o.group));
    if (unknown) throw new AppError(`"${unknown.group}" is not an option group for ${dish.name}`, 400);

    const unitPrice = round2(dish.price + chosen.reduce((s, o) => s + o.price, 0));
    return {
      menuItem: dish._id,
      name: dish.name,
      veg: dish.veg,
      qty: line.qty,
      options: chosen,
      unitPrice,
      lineTotal: round2(unitPrice * line.qty),
    };
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  if (subtotal < restaurant.minOrder) {
    throw new AppError(`${restaurant.name} has a minimum order of ₹${restaurant.minOrder}. Add ₹${Math.ceil(restaurant.minOrder - subtotal)} more.`, 400);
  }

  const distanceKm = haversineKm(fromPoint(restaurant.location), location);
  if (distanceKm > restaurant.deliveryRadiusKm) {
    throw new AppError(`${restaurant.name} delivers within ${restaurant.deliveryRadiusKm} km, and you are ${round1(distanceKm)} km away`, 400);
  }

  let coupon = null;
  let discount = 0;
  let freeDelivery = false;
  if (couponCode) {
    ({ coupon, discount, freeDelivery } = await evaluateCoupon({ code: couponCode, restaurantId: restaurant._id, subtotal, userId }));
  }

  const totals = computeTotals({ subtotal, discount, deliveryFee: deliveryFeeFor(distanceKm), freeDelivery });
  return {
    restaurant,
    lines,
    coupon,
    totals,
    distanceKm: round1(distanceKm),
    etaMins: etaMinutes(restaurant.prepTime, distanceKm),
  };
}

/** What the API returns for a quote (the coupon document itself stays server-side). */
export const quoteView = (q) => ({
  restaurant: { _id: q.restaurant._id, name: q.restaurant.name, isOpen: q.restaurant.isOpen },
  items: q.lines,
  couponCode: q.coupon?.code ?? null,
  ...q.totals,
  distanceKm: q.distanceKm,
  etaMins: q.etaMins,
});
