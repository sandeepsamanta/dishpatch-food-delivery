import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app.js';

let mongod;
export const app = createApp();
export const api = () => request(app);

export async function startDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Indexes (unique email, 2dsphere, one review per order) must exist before tests run.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

export async function stopDb() {
  await mongoose.disconnect();
  await mongod?.stop();
}

export async function clearDb() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

export const auth = (token) => ({ Authorization: `Bearer ${token}` });

let counter = 0;
export async function registerUser(role = 'customer', overrides = {}) {
  counter += 1;
  const body = { name: `Test ${role} ${counter}`, email: `${role}${counter}-${Math.random().toString(36).slice(2, 7)}@test.dev`, password: 'Passw0rdX', role, ...overrides };
  const res = await api().post('/api/auth/register').send(body);
  return { ...res.body, credentials: body, res };
}

// A customer standing in central Kolkata. The default test restaurant is ~0.5 km away (delivery fee = base fee).
export const CUSTOMER_AT = { lat: 22.5726, lng: 88.3639 };
export const NEAR = { lat: 22.5771, lng: 88.3639 }; // ~0.5 km north
export const FAR = { lat: 22.6806, lng: 88.3639 }; // ~12 km north

export const address = { name: 'Riya Sen', phone: '+91 9876543210', line: '12 Park Street', city: 'Kolkata', pincode: '700016' };

/** Creates an owner, their restaurant and a small menu through the public API. */
export async function setupRestaurant({ location = NEAR, restaurant = {} } = {}) {
  const owner = await registerUser('owner');
  const created = await api()
    .post('/api/owner/restaurant')
    .set(auth(owner.token))
    .send({ name: 'Test Kitchen', address: '1 Test Road, Kolkata', location, cuisines: ['Biryani'], prepTime: 20, minOrder: 100, ...restaurant });
  const place = created.body.restaurant;

  const post = async (body) => (await api().post('/api/owner/menu').set(auth(owner.token)).send(body)).body.item;
  const biryani = await post({
    name: 'Chicken Biryani',
    price: 200,
    category: 'Biryani',
    veg: false,
    optionGroups: [
      { name: 'Size', min: 1, max: 1, options: [{ name: 'Regular', price: 0 }, { name: 'Large', price: 80 }] },
      { name: 'Add-ons', min: 0, max: 2, options: [{ name: 'Raita', price: 20 }, { name: 'Egg', price: 15 }, { name: 'Salad', price: 10 }] },
    ],
  });
  const naan = await post({ name: 'Butter Naan', price: 50, category: 'Breads', veg: true });
  return { owner, place, biryani, naan };
}

export const line = (item, qty = 1, options = []) => ({ menuItem: item._id, qty, options });
export const biryaniLine = (item, qty = 1, extra = []) => line(item, qty, [{ group: 'Size', name: 'Regular' }, ...extra]);

export const orderBody = (place, items, extra = {}) => ({ restaurant: place._id, items, location: CUSTOMER_AT, address, ...extra });

/** Places an order as `customer` and returns the created order. */
export async function placeOrder(customer, place, items, extra = {}) {
  const res = await api().post('/api/orders').set(auth(customer.token)).send(orderBody(place, items, extra));
  return { res, order: res.body.order };
}

export async function createCoupon(owner, overrides = {}) {
  const res = await api()
    .post('/api/owner/coupons')
    .set(auth(owner.token))
    .send({ code: 'SAVE10', type: 'percent', value: 10, minOrder: 0, ...overrides });
  return res.body.coupon;
}
