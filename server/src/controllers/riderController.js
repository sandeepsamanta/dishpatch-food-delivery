import { Order } from '../models/Order.js';
import { realtime } from '../realtime/socket.js';
import { AppError } from '../utils/AppError.js';
import { CLAIMABLE, RIDER_NEXT } from '../utils/orderFlow.js';
import { loadOrderFor, withRelations } from './orderController.js';

const ON_MY_PLATE = ['accepted', 'preparing', 'ready', 'picked_up'];

/** Accepted orders nobody has claimed yet. */
export async function availableOrders(_req, res) {
  const orders = await withRelations(Order.find({ rider: null, status: { $in: CLAIMABLE } }).sort({ createdAt: 1 }).limit(30));
  res.json({ orders });
}

export async function claimOrder(req, res) {
  if (await Order.exists({ rider: req.user._id, status: { $in: ON_MY_PLATE } })) {
    throw new AppError('Finish your current delivery before taking another one', 409);
  }
  // `rider: null` is part of the update condition: when two riders tap "Accept" together, exactly one wins.
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, rider: null, status: { $in: CLAIMABLE } },
    { $set: { rider: req.user._id } },
    { new: true }
  );
  if (!order) throw new AppError('This order was just taken by another rider or is no longer available', 409);
  realtime.orderUpdated(order);
  realtime.orderUnavailable(order);
  res.json({ order: await loadOrderFor(req.user, order._id) });
}

export async function updateDeliveryStatus(req, res) {
  const { status: to } = req.body;
  const mine = await Order.findOne({ _id: req.params.id, rider: req.user._id }, 'status');
  if (!mine) throw new AppError('Order not found', 404);
  if (!RIDER_NEXT[mine.status]?.includes(to)) {
    const hint = mine.status === 'ready' || mine.status === 'picked_up' ? '' : ' The restaurant has not marked it ready yet.';
    throw new AppError(`An order that is "${mine.status}" cannot move to "${to}".${hint}`, 409);
  }

  const set = { status: to };
  if (to === 'delivered') {
    set.deliveredAt = new Date();
    set.paymentStatus = 'paid'; // cash collected at the door
  }
  const order = await Order.findOneAndUpdate(
    { _id: mine._id, rider: req.user._id, status: mine.status },
    { $set: set, $push: { statusHistory: { status: to } } },
    { new: true }
  );
  if (!order) throw new AppError('This order was just updated. Refresh and try again.', 409);
  realtime.orderUpdated(order);
  res.json({ order: await loadOrderFor(req.user, order._id) });
}

/** The rider's app reports its position while out for delivery; the customer's map moves live. */
export async function updateLocation(req, res) {
  const { lat, lng } = req.body;
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, rider: req.user._id, status: 'picked_up' },
    { $set: { riderLocation: { lat, lng, updatedAt: new Date() } } },
    { new: true }
  );
  if (!order) throw new AppError('Location can only be shared for an order you have picked up', 409);
  realtime.riderMoved(order);
  res.json({ ok: true });
}

export async function myDeliveries(req, res) {
  const [active, history, earnings] = await Promise.all([
    withRelations(Order.find({ rider: req.user._id, status: { $in: ON_MY_PLATE } }).sort({ createdAt: 1 })),
    withRelations(Order.find({ rider: req.user._id, status: 'delivered' }).sort({ deliveredAt: -1 }).limit(20)),
    Order.aggregate([
      { $match: { rider: req.user._id, status: 'delivered' } },
      { $group: { _id: null, deliveries: { $sum: 1 }, total: { $sum: '$deliveryFee' }, km: { $sum: '$distanceKm' } } },
    ]),
  ]);
  const e = earnings[0];
  res.json({
    active,
    history,
    earnings: { deliveries: e?.deliveries || 0, total: Math.round((e?.total || 0) * 100) / 100, km: Math.round((e?.km || 0) * 10) / 10 },
  });
}
