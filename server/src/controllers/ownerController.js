import crypto from 'node:crypto';
import { Coupon } from '../models/Coupon.js';
import { MenuItem } from '../models/MenuItem.js';
import { Order } from '../models/Order.js';
import { Restaurant } from '../models/Restaurant.js';
import { releaseCoupon } from '../services/couponService.js';
import { realtime } from '../realtime/socket.js';
import { AppError } from '../utils/AppError.js';
import { toPoint } from '../utils/geo.js';
import { ACTIVE, OWNER_NEXT } from '../utils/orderFlow.js';
import { loadOrderFor, withRelations } from './orderController.js';

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

async function ownRestaurant(user) {
  const restaurant = await Restaurant.findOne({ owner: user._id });
  if (!restaurant) throw new AppError('Set up your restaurant first', 404);
  return restaurant;
}

// ---------- restaurant ----------
export async function getMyRestaurant(req, res) {
  // 200 with null (not 404) lets the dashboard show its "set up your restaurant" step without an error.
  const restaurant = await Restaurant.findOne({ owner: req.user._id });
  res.json({ restaurant });
}

export async function createRestaurant(req, res) {
  if (await Restaurant.exists({ owner: req.user._id })) throw new AppError('You already have a restaurant', 409);
  const { location, ...rest } = req.body;
  const restaurant = await Restaurant.create({
    ...rest,
    owner: req.user._id,
    slug: `${slugify(rest.name)}-${crypto.randomBytes(2).toString('hex')}`,
    location: toPoint(location),
  });
  res.status(201).json({ restaurant });
}

export async function updateMyRestaurant(req, res) {
  const restaurant = await ownRestaurant(req.user);
  const { location, ...rest } = req.body;
  restaurant.set(rest);
  if (location) restaurant.location = toPoint(location);
  await restaurant.save();
  res.json({ restaurant });
}

// ---------- menu ----------
export async function listMenu(req, res) {
  const restaurant = await ownRestaurant(req.user);
  res.json({ items: await MenuItem.find({ restaurant: restaurant._id }).sort({ category: 1, name: 1 }) });
}

export async function createMenuItem(req, res) {
  const restaurant = await ownRestaurant(req.user);
  const item = await MenuItem.create({ ...req.body, restaurant: restaurant._id });
  res.status(201).json({ item });
}

export async function updateMenuItem(req, res) {
  const restaurant = await ownRestaurant(req.user);
  // Scoped to the owner's restaurant: someone else's dish is simply "not found".
  const item = await MenuItem.findOneAndUpdate({ _id: req.params.id, restaurant: restaurant._id }, { $set: req.body }, { new: true, runValidators: true });
  if (!item) throw new AppError('Menu item not found', 404);
  res.json({ item });
}

export async function deleteMenuItem(req, res) {
  const restaurant = await ownRestaurant(req.user);
  const item = await MenuItem.findOneAndDelete({ _id: req.params.id, restaurant: restaurant._id });
  if (!item) throw new AppError('Menu item not found', 404);
  res.json({ message: 'Menu item deleted' }); // past orders keep their own name/price snapshot
}

// ---------- coupons ----------
export async function listCoupons(req, res) {
  const restaurant = await ownRestaurant(req.user);
  res.json({ coupons: await Coupon.find({ restaurant: restaurant._id }).sort({ createdAt: -1 }) });
}

export async function createCoupon(req, res) {
  const restaurant = await ownRestaurant(req.user);
  const coupon = await Coupon.create({ ...req.body, restaurant: restaurant._id });
  res.status(201).json({ coupon });
}

export async function updateCoupon(req, res) {
  const restaurant = await ownRestaurant(req.user);
  const coupon = await Coupon.findOne({ _id: req.params.id, restaurant: restaurant._id });
  if (!coupon) throw new AppError('Coupon not found', 404);
  coupon.set(req.body);
  await coupon.save(); // re-runs the percent/flat value checks on the merged document
  res.json({ coupon });
}

export async function deleteCoupon(req, res) {
  const restaurant = await ownRestaurant(req.user);
  const coupon = await Coupon.findOneAndDelete({ _id: req.params.id, restaurant: restaurant._id });
  if (!coupon) throw new AppError('Coupon not found', 404);
  res.json({ message: 'Coupon deleted' });
}

// ---------- orders ----------
export async function listOrders(req, res) {
  const restaurant = await ownRestaurant(req.user);
  const { status, active, limit } = req.query;
  const filter = { restaurant: restaurant._id };
  if (status) filter.status = status;
  else if (active) filter.status = { $in: ACTIVE };
  const orders = await withRelations(Order.find(filter).sort({ createdAt: active ? 1 : -1 }).limit(limit));
  res.json({ orders });
}

export async function updateOrderStatus(req, res) {
  const restaurant = await ownRestaurant(req.user);
  const { status: to } = req.body;
  const current = await Order.findOne({ _id: req.params.id, restaurant: restaurant._id }, 'status');
  if (!current) throw new AppError('Order not found', 404);
  if (!OWNER_NEXT[current.status]?.includes(to)) {
    throw new AppError(`An order that is "${current.status}" cannot move to "${to}"`, 409);
  }

  // Guarded by the status we validated against, so two quick clicks (or a customer cancelling) cannot both win.
  const order = await Order.findOneAndUpdate(
    { _id: current._id, status: current.status },
    { $set: { status: to }, $push: { statusHistory: { status: to } } },
    { new: true }
  );
  if (!order) throw new AppError('This order was just updated by someone else. Refresh and try again.', 409);

  if (to === 'rejected') await releaseCoupon(order.couponCode);
  realtime.orderUpdated(order);
  if (to === 'accepted' && !order.rider) realtime.orderAvailable(order);
  if (to === 'rejected' || (to === 'accepted' && order.rider)) realtime.orderUnavailable(order);
  res.json({ order: await loadOrderFor(req.user, order._id) });
}

// ---------- stats ----------
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istDay = (d) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

export async function stats(req, res) {
  const restaurant = await ownRestaurant(req.user);
  const now = new Date();
  const startOfToday = new Date(new Date(now.getTime() + IST_OFFSET_MS).setUTCHours(0, 0, 0, 0) - IST_OFFSET_MS);
  const weekAgo = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
  const mine = { restaurant: restaurant._id };

  const [today, pending, active, daily, topItems] = await Promise.all([
    Order.aggregate([
      { $match: { ...mine, createdAt: { $gte: startOfToday }, status: { $nin: ['cancelled', 'rejected'] } } },
      { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, '$total', 0] } } } },
    ]),
    Order.countDocuments({ ...mine, status: 'placed' }),
    Order.countDocuments({ ...mine, status: { $in: ACTIVE } }),
    Order.aggregate([
      { $match: { ...mine, status: 'delivered', createdAt: { $gte: weekAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } }, orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
    ]),
    Order.aggregate([
      { $match: { ...mine, status: 'delivered' } },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', qty: { $sum: '$items.qty' }, revenue: { $sum: '$items.lineTotal' } } },
      { $sort: { qty: -1, _id: 1 } },
      { $limit: 5 },
    ]),
  ]);

  const byDay = new Map(daily.map((d) => [d._id, d]));
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const day = istDay(new Date(weekAgo.getTime() + i * 24 * 60 * 60 * 1000));
    const d = byDay.get(day);
    return { day, orders: d?.orders || 0, revenue: Math.round((d?.revenue || 0) * 100) / 100 };
  });

  res.json({
    today: { orders: today[0]?.orders || 0, revenue: Math.round((today[0]?.revenue || 0) * 100) / 100 },
    pending,
    active,
    last7,
    topItems: topItems.map((t) => ({ name: t._id, qty: t.qty, revenue: Math.round(t.revenue * 100) / 100 })),
  });
}
