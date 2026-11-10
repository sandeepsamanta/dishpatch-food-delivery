import { Order } from '../models/Order.js';
import { Restaurant } from '../models/Restaurant.js';
import { Review } from '../models/Review.js';
import { claimCoupon, releaseCoupon } from '../services/couponService.js';
import { priceOrder, quoteView } from '../services/quoteService.js';
import { realtime } from '../realtime/socket.js';
import { AppError } from '../utils/AppError.js';
import { CUSTOMER_CANCELLABLE } from '../utils/orderFlow.js';

/** Populates what the tracking and detail screens need. */
export const withRelations = (query) =>
  query.populate('restaurant', 'name address location image').populate('rider', 'name phone');

/** Loads an order only for someone involved in it (customer, the restaurant's owner, or its delivery partner). Anyone else gets a 404. */
export async function loadOrderFor(user, id) {
  const order = await withRelations(Order.findById(id));
  if (!order) throw new AppError('Order not found', 404);
  const isCustomer = String(order.customer) === String(user._id);
  const isRider = order.rider && String(order.rider._id) === String(user._id);
  let isOwner = false;
  if (user.role === 'owner') isOwner = Boolean(await Restaurant.exists({ _id: order.restaurant._id, owner: user._id }));
  if (!isCustomer && !isRider && !isOwner) throw new AppError('Order not found', 404);
  return order;
}

export async function quote(req, res) {
  const { restaurant, items, couponCode, location } = req.body;
  const q = await priceOrder({ userId: req.user._id, restaurantId: restaurant, items, couponCode, location });
  res.json({ quote: quoteView(q) });
}

export async function createOrder(req, res) {
  const { restaurant, items, couponCode, location, address, note } = req.body;
  const q = await priceOrder({ userId: req.user._id, restaurantId: restaurant, items, couponCode, location, forCheckout: true });

  // Reserve the coupon redemption atomically before the order exists; give it back if saving fails.
  if (q.coupon) await claimCoupon(q.coupon);
  let order;
  try {
    order = await Order.create({
      customer: req.user._id,
      restaurant: q.restaurant._id,
      restaurantName: q.restaurant.name,
      items: q.lines,
      deliveryAddress: { ...address, location },
      note: note || '',
      distanceKm: q.distanceKm,
      etaMins: q.etaMins,
      ...q.totals,
      couponCode: q.coupon?.code ?? null,
      statusHistory: [{ status: 'placed' }],
    });
  } catch (err) {
    await releaseCoupon(q.coupon?.code);
    throw err;
  }

  realtime.orderPlaced(order);
  res.status(201).json({ order: await withRelations(Order.findById(order._id)) });
}

export async function myOrders(req, res) {
  const orders = await Order.find({ customer: req.user._id }).sort({ createdAt: -1 }).limit(50).populate('restaurant', 'name image');
  res.json({ orders });
}

export async function getOrder(req, res) {
  res.json({ order: await loadOrderFor(req.user, req.params.id) });
}

export async function cancelOrder(req, res) {
  // The status condition is part of the update, so a restaurant accepting at the same instant cannot be overridden.
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, customer: req.user._id, status: { $in: CUSTOMER_CANCELLABLE } },
    { $set: { status: 'cancelled' }, $push: { statusHistory: { status: 'cancelled' } } },
    { new: true }
  );
  if (!order) {
    if (!(await Order.exists({ _id: req.params.id, customer: req.user._id }))) throw new AppError('Order not found', 404);
    throw new AppError('The restaurant has already accepted this order, so it can no longer be cancelled', 409);
  }
  await releaseCoupon(order.couponCode);
  realtime.orderUpdated(order);
  res.json({ order: await withRelations(Order.findById(order._id)) });
}

export async function reviewOrder(req, res) {
  const { rating, comment } = req.body;
  // Flip `reviewed` atomically: only a delivered, not-yet-reviewed order of this customer qualifies.
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, customer: req.user._id, status: 'delivered', reviewed: false },
    { $set: { reviewed: true } }
  );
  if (!order) {
    const existing = await Order.findOne({ _id: req.params.id, customer: req.user._id }, 'status reviewed');
    if (!existing) throw new AppError('Order not found', 404);
    if (existing.reviewed) throw new AppError('You have already reviewed this order', 409);
    throw new AppError('You can review an order once it has been delivered', 409);
  }
  try {
    const review = await Review.create({
      restaurant: order.restaurant,
      user: req.user._id,
      userName: req.user.name,
      order: order._id,
      rating,
      comment: comment || '',
    });
    await Review.recalculate(order.restaurant);
    res.status(201).json({ review });
  } catch (err) {
    await Order.updateOne({ _id: order._id }, { $set: { reviewed: false } });
    throw err;
  }
}
