import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { protect, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import * as auth from '../controllers/authController.js';
import * as orders from '../controllers/orderController.js';
import * as owner from '../controllers/ownerController.js';
import * as restaurants from '../controllers/restaurantController.js';
import * as rider from '../controllers/riderController.js';
import * as s from '../validators/schemas.js';

const api = Router();

// Brute-force protection on credentials endpoints (disabled under test).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { message: 'Too many attempts. Please try again in a few minutes.' },
});

const asOwner = [protect, requireRole('owner')];
const asRider = [protect, requireRole('rider')];
const asCustomer = [protect, requireRole('customer')];

api.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ---------- auth ----------
api.post('/auth/register', authLimiter, validate({ body: s.registerBody }), h(auth.register));
api.post('/auth/login', authLimiter, validate({ body: s.loginBody }), h(auth.login));
api.get('/auth/me', protect, h(auth.me));
api.put('/auth/profile', protect, validate({ body: s.profileBody }), h(auth.updateProfile));

// ---------- discovery (public) ----------
api.get('/restaurants', validate({ query: s.restaurantQuery }), h(restaurants.listRestaurants));
api.get('/restaurants/cuisines', h(restaurants.listCuisines));
api.get('/restaurants/:id', validate({ params: s.idParams, query: s.restaurantDetailQuery }), h(restaurants.getRestaurant));

// ---------- customer orders ----------
api.post('/orders/quote', ...asCustomer, validate({ body: s.quoteBody }), h(orders.quote));
api.post('/orders', ...asCustomer, validate({ body: s.createOrderBody }), h(orders.createOrder));
api.get('/orders/mine', ...asCustomer, h(orders.myOrders));
api.get('/orders/:id', protect, validate({ params: s.idParams }), h(orders.getOrder));
api.put('/orders/:id/cancel', ...asCustomer, validate({ params: s.idParams }), h(orders.cancelOrder));
api.post('/orders/:id/review', ...asCustomer, validate({ params: s.idParams, body: s.reviewBody }), h(orders.reviewOrder));

// ---------- restaurant owner ----------
api.get('/owner/restaurant', ...asOwner, h(owner.getMyRestaurant));
api.post('/owner/restaurant', ...asOwner, validate({ body: s.restaurantBody }), h(owner.createRestaurant));
api.put('/owner/restaurant', ...asOwner, validate({ body: s.restaurantUpdateBody }), h(owner.updateMyRestaurant));
api.get('/owner/stats', ...asOwner, h(owner.stats));
api.get('/owner/menu', ...asOwner, h(owner.listMenu));
api.post('/owner/menu', ...asOwner, validate({ body: s.menuItemBody }), h(owner.createMenuItem));
api.put('/owner/menu/:id', ...asOwner, validate({ params: s.idParams, body: s.menuItemUpdateBody }), h(owner.updateMenuItem));
api.delete('/owner/menu/:id', ...asOwner, validate({ params: s.idParams }), h(owner.deleteMenuItem));
api.get('/owner/coupons', ...asOwner, h(owner.listCoupons));
api.post('/owner/coupons', ...asOwner, validate({ body: s.couponBody }), h(owner.createCoupon));
api.put('/owner/coupons/:id', ...asOwner, validate({ params: s.idParams, body: s.couponUpdateBody }), h(owner.updateCoupon));
api.delete('/owner/coupons/:id', ...asOwner, validate({ params: s.idParams }), h(owner.deleteCoupon));
api.get('/owner/orders', ...asOwner, validate({ query: s.ownerOrdersQuery }), h(owner.listOrders));
api.put('/owner/orders/:id/status', ...asOwner, validate({ params: s.idParams, body: s.orderStatusBody }), h(owner.updateOrderStatus));

// ---------- delivery partner ----------
api.get('/rider/orders/available', ...asRider, h(rider.availableOrders));
api.get('/rider/orders/mine', ...asRider, h(rider.myDeliveries));
api.post('/rider/orders/:id/claim', ...asRider, validate({ params: s.idParams }), h(rider.claimOrder));
api.put('/rider/orders/:id/status', ...asRider, validate({ params: s.idParams, body: s.orderStatusBody }), h(rider.updateDeliveryStatus));
api.put('/rider/orders/:id/location', ...asRider, validate({ params: s.idParams, body: s.riderLocationBody }), h(rider.updateLocation));

export default api;
