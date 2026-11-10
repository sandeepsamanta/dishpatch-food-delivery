import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Coupon } from '../src/models/Coupon.js';
import { CUSTOMER_AT, FAR, api, auth, biryaniLine, clearDb, createCoupon, line, orderBody, placeOrder, registerUser, setupRestaurant, startDb, stopDb } from './helpers.js';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

const quote = (customer, place, items, extra = {}) =>
  api().post('/api/orders/quote').set(auth(customer.token)).send({ restaurant: place._id, items, location: CUSTOMER_AT, ...extra });

describe('pricing and quotes', () => {
  it('prices options, quantities, fee and GST on the server', async () => {
    const { place, biryani, naan } = await setupRestaurant();
    const customer = await registerUser('customer');
    // Large (+80) with Raita (+20): 300 each x 2 = 600, plus 2 naan = 100 -> subtotal 700
    const res = await quote(customer, place, [
      line(biryani, 2, [{ group: 'Size', name: 'Large' }, { group: 'Add-ons', name: 'Raita' }]),
      line(naan, 2),
    ]);
    expect(res.status).toBe(200);
    const q = res.body.quote;
    expect(q.items[0]).toMatchObject({ name: 'Chicken Biryani', unitPrice: 300, lineTotal: 600 });
    expect(q).toMatchObject({ subtotal: 700, discount: 0, deliveryFee: 25, tax: 35, total: 760 });
    expect(q.distanceKm).toBeCloseTo(0.5, 1);
    expect(q.etaMins).toBeGreaterThan(20);
  });

  it('charges more for longer distances', async () => {
    const { place, biryani } = await setupRestaurant({ restaurant: { deliveryRadiusKm: 20 }, location: { lat: 22.5726 + 0.0425, lng: 88.3639 } }); // ~4.7 km
    const customer = await registerUser('customer');
    const res = await quote(customer, place, [biryaniLine(biryani)]);
    // 4.7 km: base 25 covers 2 km, 3 more started km x 8 = 24 -> 49
    expect(res.body.quote.deliveryFee).toBe(49);
  });

  it('ignores any price the client sends', async () => {
    const { place, naan } = await setupRestaurant();
    const customer = await registerUser('customer');
    const res = await quote(customer, place, [{ ...line(naan, 2), price: 1, unitPrice: 1 }]);
    expect(res.body.quote.subtotal).toBe(100);
  });

  it('enforces option rules: required, max, unknown and duplicate', async () => {
    const { place, biryani } = await setupRestaurant();
    const customer = await registerUser('customer');
    const bad = (items) => quote(customer, place, items);
    expect((await bad([line(biryani)])).body.message).toMatch(/Size/); // required group missing
    const tooMany = biryaniLine(biryani, 1, [{ group: 'Add-ons', name: 'Raita' }, { group: 'Add-ons', name: 'Egg' }, { group: 'Add-ons', name: 'Salad' }]);
    expect((await bad([tooMany])).body.message).toMatch(/at most 2/);
    expect((await bad([line(biryani, 1, [{ group: 'Size', name: 'Giant' }])])).body.message).toMatch(/not an option/);
    expect((await bad([line(biryani, 1, [{ group: 'Size', name: 'Regular' }, { group: 'Sauce', name: 'Mayo' }])])).body.message).toMatch(/not an option group/);
    expect((await bad([biryaniLine(biryani, 1, [{ group: 'Add-ons', name: 'Raita' }, { group: 'Add-ons', name: 'Raita' }])])).body.message).toMatch(/Duplicate/);
  });

  it("rejects another restaurant's dishes, unavailable dishes and bad quantities", async () => {
    const a = await setupRestaurant();
    const b = await setupRestaurant();
    const customer = await registerUser('customer');
    expect((await quote(customer, a.place, [line(b.naan)])).status).toBe(400);

    await api().put(`/api/owner/menu/${a.naan._id}`).set(auth(a.owner.token)).send({ available: false });
    expect((await quote(customer, a.place, [line(a.naan)])).status).toBe(409);

    expect((await quote(customer, b.place, [line(b.naan, 0)])).status).toBe(400);
    expect((await quote(customer, b.place, [line(b.naan, 21)])).status).toBe(400);
    expect((await quote(customer, b.place, [])).status).toBe(400);
  });

  it('enforces the minimum order and the delivery radius', async () => {
    const { place, naan } = await setupRestaurant({ restaurant: { minOrder: 120 } });
    const customer = await registerUser('customer');
    const small = await quote(customer, place, [line(naan, 1)]);
    expect(small.status).toBe(400);
    expect(small.body.message).toMatch(/minimum order of ₹120/);

    const far = await quote(customer, place, [line(naan, 3)], { location: FAR });
    expect(far.status).toBe(400);
    expect(far.body.message).toMatch(/delivers within 8 km/);
  });

  it('needs a customer account', async () => {
    const { place, naan } = await setupRestaurant();
    const res = await api().post('/api/orders/quote').send({ restaurant: place._id, items: [line(naan)], location: CUSTOMER_AT });
    expect(res.status).toBe(401);
  });
});

describe('coupons at checkout', () => {
  it('applies percent (with cap), flat and free-delivery coupons', async () => {
    const { place, owner, naan } = await setupRestaurant();
    const customer = await registerUser('customer');
    await createCoupon(owner, { code: 'PCT20', type: 'percent', value: 20, maxDiscount: 15 });
    await createCoupon(owner, { code: 'FLAT30', type: 'flat', value: 30 });
    await createCoupon(owner, { code: 'FREE', type: 'free_delivery' });
    const items = [line(naan, 4)]; // 200

    const pct = (await quote(customer, place, items, { couponCode: 'pct20' })).body.quote; // lower-case input is fine
    expect(pct).toMatchObject({ discount: 15, couponCode: 'PCT20', tax: 9.25, total: 219.25 });
    const flat = (await quote(customer, place, items, { couponCode: 'FLAT30' })).body.quote;
    expect(flat).toMatchObject({ discount: 30, tax: 8.5, total: 203.5 });
    const free = (await quote(customer, place, items, { couponCode: 'FREE' })).body.quote;
    expect(free).toMatchObject({ discount: 0, deliveryFee: 0, total: 210 });
  });

  it('explains why a coupon is refused', async () => {
    const a = await setupRestaurant();
    const b = await setupRestaurant();
    const customer = await registerUser('customer');
    await createCoupon(a.owner, { code: 'BIG', minOrder: 500 });
    await createCoupon(a.owner, { code: 'GONE', expiresAt: '2020-01-01' });
    await createCoupon(a.owner, { code: 'OFF', active: false });
    const items = [line(a.naan, 3)];

    const msg = async (code, place = a.place, its = items) => (await quote(customer, place, its, { couponCode: code })).body.message;
    expect(await msg('NOPE')).toMatch(/not valid/);
    expect(await msg('BIG')).toMatch(/Add ₹\d+ more/);
    expect(await msg('GONE')).toMatch(/expired/);
    expect(await msg('OFF')).toMatch(/not valid/);
    expect(await msg('BIG', b.place, [line(b.naan, 20)])).toMatch(/not valid for this restaurant/);
  });

  it('counts a redemption on order and gives it back on cancel', async () => {
    const { place, owner, naan } = await setupRestaurant();
    const customer = await registerUser('customer');
    await createCoupon(owner, { code: 'ONCE', usageLimit: 5 });

    const { res, order } = await placeOrder(customer, place, [line(naan, 2)], { couponCode: 'ONCE' });
    expect(res.status).toBe(201);
    expect(order).toMatchObject({ couponCode: 'ONCE', discount: 10 });
    expect((await Coupon.findOne({ code: 'ONCE' })).usedCount).toBe(1);

    // One use per customer...
    const again = await placeOrder(customer, place, [line(naan, 2)], { couponCode: 'ONCE' });
    expect(again.res.status).toBe(400);
    expect(again.res.body.message).toMatch(/already used/);

    // ...unless the order was cancelled, which releases the coupon.
    expect((await api().put(`/api/orders/${order._id}/cancel`).set(auth(customer.token))).status).toBe(200);
    expect((await Coupon.findOne({ code: 'ONCE' })).usedCount).toBe(0);
    expect((await placeOrder(customer, place, [line(naan, 2)], { couponCode: 'ONCE' })).res.status).toBe(201);
  });

  it('never over-redeems a limited coupon when buyers race for the last use', async () => {
    const { place, owner, naan } = await setupRestaurant();
    await createCoupon(owner, { code: 'LAST', usageLimit: 1 });
    const buyers = await Promise.all(Array.from({ length: 5 }, () => registerUser('customer')));

    const results = await Promise.all(buyers.map((b) => placeOrder(b, place, [line(naan, 2)], { couponCode: 'LAST' })));
    const statuses = results.map((r) => r.res.status).sort();
    expect(statuses).toEqual([201, 400, 400, 400, 400]);
    expect((await Coupon.findOne({ code: 'LAST' })).usedCount).toBe(1);
  });
});

describe('placing and managing orders', () => {
  it('creates an order that snapshots prices and starts as "placed"', async () => {
    const { place, owner, naan, biryani } = await setupRestaurant();
    const customer = await registerUser('customer');
    const { res, order } = await placeOrder(customer, place, [biryaniLine(biryani, 1, [{ group: 'Add-ons', name: 'Egg' }]), line(naan, 2)], { note: 'Less spicy' });
    expect(res.status).toBe(201);
    expect(order).toMatchObject({ status: 'placed', subtotal: 315, deliveryFee: 25, tax: 15.75, total: 355.75, paymentMethod: 'cod', note: 'Less spicy' });
    expect(order.items[0].options).toEqual([{ group: 'Size', name: 'Regular', price: 0 }, { group: 'Add-ons', name: 'Egg', price: 15 }]);
    expect(order.statusHistory.map((s) => s.status)).toEqual(['placed']);
    expect(order.restaurant.name).toBe('Test Kitchen');

    // Later menu changes do not rewrite history.
    await api().put(`/api/owner/menu/${naan._id}`).set(auth(owner.token)).send({ price: 999 });
    const fetched = await api().get(`/api/orders/${order._id}`).set(auth(customer.token));
    expect(fetched.body.order.items[1].unitPrice).toBe(50);
  });

  it('validates the delivery address', async () => {
    const { place, naan } = await setupRestaurant();
    const customer = await registerUser('customer');
    const body = orderBody(place, [line(naan, 3)]);
    for (const patch of [{ pincode: '12' }, { phone: 'abc' }, { line: '' }]) {
      const res = await api().post('/api/orders').set(auth(customer.token)).send({ ...body, address: { ...body.address, ...patch } });
      expect(res.status).toBe(400);
    }
  });

  it('refuses orders while the restaurant is closed', async () => {
    const { place, owner, naan } = await setupRestaurant();
    const customer = await registerUser('customer');
    await api().put('/api/owner/restaurant').set(auth(owner.token)).send({ isOpen: false });
    const { res } = await placeOrder(customer, place, [line(naan, 3)]);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/closed/);
  });

  it("lists only the customer's own orders and hides others (404, not 403)", async () => {
    const { place, naan } = await setupRestaurant();
    const alice = await registerUser('customer');
    const bob = await registerUser('customer');
    const { order } = await placeOrder(alice, place, [line(naan, 3)]);

    expect((await api().get('/api/orders/mine').set(auth(alice.token))).body.orders).toHaveLength(1);
    expect((await api().get('/api/orders/mine').set(auth(bob.token))).body.orders).toHaveLength(0);
    expect((await api().get(`/api/orders/${order._id}`).set(auth(bob.token))).status).toBe(404);
    expect((await api().put(`/api/orders/${order._id}/cancel`).set(auth(bob.token))).status).toBe(404);
  });

  it("lets only the restaurant's own owner see its orders", async () => {
    const a = await setupRestaurant();
    const b = await setupRestaurant();
    const customer = await registerUser('customer');
    const { order } = await placeOrder(customer, a.place, [line(a.naan, 3)]);
    expect((await api().get(`/api/orders/${order._id}`).set(auth(a.owner.token))).status).toBe(200);
    expect((await api().get(`/api/orders/${order._id}`).set(auth(b.owner.token))).status).toBe(404);
    expect((await api().get('/api/owner/orders').set(auth(b.owner.token))).body.orders).toHaveLength(0);
  });

  it('can be cancelled only before the restaurant accepts', async () => {
    const { place, owner, naan } = await setupRestaurant();
    const customer = await registerUser('customer');
    const first = (await placeOrder(customer, place, [line(naan, 3)])).order;
    const cancelled = await api().put(`/api/orders/${first._id}/cancel`).set(auth(customer.token));
    expect(cancelled.body.order.status).toBe('cancelled');
    expect((await api().put(`/api/orders/${first._id}/cancel`).set(auth(customer.token))).status).toBe(409);

    const second = (await placeOrder(customer, place, [line(naan, 3)])).order;
    await api().put(`/api/owner/orders/${second._id}/status`).set(auth(owner.token)).send({ status: 'accepted' });
    const late = await api().put(`/api/orders/${second._id}/cancel`).set(auth(customer.token));
    expect(late.status).toBe(409);
    expect(late.body.message).toMatch(/already accepted/);
  });
});
