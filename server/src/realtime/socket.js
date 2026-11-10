import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { Restaurant } from '../models/Restaurant.js';
import { User } from '../models/User.js';
import { verifyToken } from '../utils/token.js';

let io = null;

const rooms = {
  user: (id) => `user:${id}`,
  restaurant: (id) => `restaurant:${id}`,
  riders: 'riders',
};

/**
 * Attaches Socket.IO to the HTTP server. Clients authenticate with their JWT in the handshake and are put in
 * private rooms, so a customer only hears about their own orders, an owner about their own restaurant's orders,
 * and riders about orders waiting for pickup.
 */
export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientUrls, methods: ['GET', 'POST'] },
  });

  io.use(async (socket, next) => {
    try {
      const { id } = verifyToken(socket.handshake.auth?.token || '');
      const user = await User.findById(id);
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = user;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.data.user;
    socket.join(rooms.user(user._id));
    if (user.role === 'rider') socket.join(rooms.riders);
    if (user.role === 'owner') {
      const restaurant = await Restaurant.findOne({ owner: user._id }, '_id');
      if (restaurant) socket.join(rooms.restaurant(restaurant._id));
    }
  });
  return io;
}

export async function closeRealtime() {
  if (io) await io.close();
  io = null;
}

// Controllers call these after every state change. They quietly do nothing when sockets are not running (e.g. in unit tests).
const emit = (room, event, payload) => io?.to(room).emit(event, payload);

const brief = (order) => ({
  _id: order._id,
  status: order.status,
  rider: order.rider,
  riderLocation: order.riderLocation,
  statusHistory: order.statusHistory,
  paymentStatus: order.paymentStatus,
  etaMins: order.etaMins,
});

export const realtime = {
  /** A new order arrives at the restaurant. */
  orderPlaced(order) {
    emit(rooms.restaurant(order.restaurant), 'order:new', { _id: order._id });
  },
  /** Everyone involved in the order sees the new state. */
  orderUpdated(order) {
    const payload = brief(order);
    emit(rooms.user(order.customer), 'order:update', payload);
    emit(rooms.restaurant(order.restaurant), 'order:update', payload);
    if (order.rider) emit(rooms.user(order.rider), 'order:update', payload);
  },
  /** An accepted order is waiting for a delivery partner. */
  orderAvailable(order) {
    emit(rooms.riders, 'order:available', { _id: order._id });
  },
  /** The order was claimed or cancelled: other riders should drop it from their list. */
  orderUnavailable(order) {
    emit(rooms.riders, 'order:unavailable', { _id: order._id });
  },
  riderMoved(order) {
    const payload = { _id: order._id, riderLocation: order.riderLocation };
    emit(rooms.user(order.customer), 'order:location', payload);
    emit(rooms.restaurant(order.restaurant), 'order:location', payload);
  },
};
