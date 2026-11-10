export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round1 = (n) => Math.round(n * 10) / 10;

export const DELIVERY = {
  baseFee: 25, // covers the first `baseKm`
  baseKm: 2,
  perKm: 8, // for every started km beyond that
  speedKmph: 22, // average city speed used for the ETA
};
export const TAX_RATE = 0.05; // GST on food

export const deliveryFeeFor = (km) => round2(DELIVERY.baseFee + Math.ceil(Math.max(0, km - DELIVERY.baseKm)) * DELIVERY.perKm);

/** Kitchen prep time + riding time + a few minutes for pickup and handover. */
export const etaMinutes = (prepTime, km) => Math.round(prepTime + (km / DELIVERY.speedKmph) * 60 + 5);

export function computeTotals({ subtotal, discount = 0, deliveryFee, freeDelivery = false }) {
  const taxable = Math.max(0, subtotal - discount);
  const tax = round2(taxable * TAX_RATE);
  const fee = freeDelivery ? 0 : deliveryFee;
  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    deliveryFee: fee,
    tax,
    total: round2(taxable + fee + tax),
  };
}
