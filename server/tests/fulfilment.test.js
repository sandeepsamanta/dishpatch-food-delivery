import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, auth, clearDb, line, placeOrder, registerUser, setupRestaurant, startDb, stopDb } from './helpers.js';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

const ownerMove = (owner, order, status) => api().put(`/api/owner/orders/${order._id}/status`).set(auth(owner.token)).send({ status });
const riderMove = (rider, order, status) => api().put(`/api/rider/orders/${order._id}/status`).set(auth(rider.token)).send({ status });
const claim = (rider, order) => api().post(`/api/rider/orders/${order._id}/claim`).set(auth(rider.token));

async function newOrder() {
  const shop = await setupRestaurant();
  const customer = await registerUser('customer');
  const { order } = await placeOrder(customer, shop.place, [line(shop.naan, 3)]);
  return { ...shop, customer, order };
}

describe('restaurant order workflow', () => {
  it('follows placed -> accepted -> preparing -> ready and records history', async () => {
    const { owner, order, customer } = await newOrder();
    for (const status of ['accepted', 'preparing', 'ready']) {
      const res = await ownerMove(owner, order, status);
      expect(res.status).toBe(200);
      expect(res.body.order.status).toBe(status);
    }
    const seen = await api().get(`/api/orders/${order._id}`).set(auth(customer.token));
    expect(seen.body.order.statusHistory.map((s) => s.status)).toEqual(['placed', 'accepted', 'preparing', 'ready']);
  });

  it('rejects skipped, backward and unknown transitions', async () => {
    const { owner, order } = await newOrder();
    expect((await ownerMove(owner, order, 'ready')).status).toBe(409); // cannot skip
    expect((await ownerMove(owner, order, 'delivered')).status).toBe(409); // riders do that
    expect((await ownerMove(owner, order, 'flying')).status).toBe(400);
    await ownerMove(owner, order, 'accepted');
    expect((await ownerMove(owner, order, 'placed')).status).toBe(409); // cannot go back
    expect((await ownerMove(owner, order, 'rejected')).status).toBe(409); // too late to reject
  });

  it("does not let another restaurant's owner touch the order", async () => {
    const { order } = await newOrder();
    const other = await setupRestaurant();
    expect((await ownerMove(other.owner, order, 'accepted')).status).toBe(404);
  });

  it('rejecting an order releases its coupon', async () => {
    const { owner, place, naan } = await setupRestaurant();
    const customer = await registerUser('customer');
    await api().post('/api/owner/coupons').set(auth(owner.token)).send({ code: 'R10', type: 'percent', value: 10, usageLimit: 1 });
    const { order } = await placeOrder(customer, place, [line(naan, 3)], { couponCode: 'R10' });
    expect((await ownerMove(owner, order, 'rejected')).body.order.status).toBe('rejected');
    const other = await registerUser('customer');
    expect((await placeOrder(other, place, [line(naan, 3)], { couponCode: 'R10' })).res.status).toBe(201);
  });

  it('filters the live board by active status', async () => {
    const { owner, place, naan, customer, order } = await newOrder();
    const done = (await placeOrder(customer, place, [line(naan, 3)])).order;
    await ownerMove(owner, done, 'rejected');
    const active = await api().get('/api/owner/orders').query({ active: 'true' }).set(auth(owner.token));
    expect(active.body.orders.map((o) => o._id)).toEqual([order._id]);
    const rejected = await api().get('/api/owner/orders').query({ status: 'rejected' }).set(auth(owner.token));
    expect(rejected.body.orders).toHaveLength(1);
  });
});

describe('delivery partner workflow', () => {
  it('only offers accepted, unclaimed orders', async () => {
    const { owner, order } = await newOrder();
    const rider = await registerUser('rider');
    const list = async () => (await api().get('/api/rider/orders/available').set(auth(rider.token))).body.orders;
    expect(await list()).toHaveLength(0); // still "placed"
    await ownerMove(owner, order, 'accepted');
    expect((await list()).map((o) => o._id)).toEqual([order._id]);
    await claim(rider, order);
    expect(await list()).toHaveLength(0);
  });

  it('lets exactly one rider win when several claim the same order at once', async () => {
    const { owner, order } = await newOrder();
    await ownerMove(owner, order, 'accepted');
    const riders = await Promise.all(Array.from({ length: 5 }, () => registerUser('rider')));
    const results = await Promise.all(riders.map((r) => claim(r, order)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409]);
  });

  it('cannot claim before acceptance, and only one active delivery per rider', async () => {
    const a = await newOrder();
    const rider = await registerUser('rider');
    expect((await claim(rider, a.order)).status).toBe(409); // still "placed"

    await ownerMove(a.owner, a.order, 'accepted');
    expect((await claim(rider, a.order)).status).toBe(200);

    const b = await newOrder();
    await ownerMove(b.owner, b.order, 'accepted');
    const second = await claim(rider, b.order);
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/current delivery/);
  });

  it('completes pickup and delivery in order, only for the assigned rider', async () => {
    const { owner, order, customer } = await newOrder();
    const rider = await registerUser('rider');
    const stranger = await registerUser('rider');
    await ownerMove(owner, order, 'accepted');
    await claim(rider, order);

    expect((await riderMove(rider, order, 'picked_up')).status).toBe(409); // food is not ready yet
    await ownerMove(owner, order, 'preparing');
    await ownerMove(owner, order, 'ready');
    expect((await riderMove(stranger, order, 'picked_up')).status).toBe(404);
    expect((await riderMove(rider, order, 'delivered')).status).toBe(409); // must pick up first

    expect((await riderMove(rider, order, 'picked_up')).body.order.status).toBe('picked_up');
    const done = await riderMove(rider, order, 'delivered');
    expect(done.body.order).toMatchObject({ status: 'delivered', paymentStatus: 'paid' });

    const mine = await api().get('/api/rider/orders/mine').set(auth(rider.token));
    expect(mine.body.active).toHaveLength(0);
    expect(mine.body.history).toHaveLength(1);
    expect(mine.body.earnings).toMatchObject({ deliveries: 1, total: 25 });

    // The customer sees who delivered it.
    const seen = await api().get(`/api/orders/${order._id}`).set(auth(customer.token));
    expect(seen.body.order.rider.name).toBeTruthy();
  });

  it('shares live location only while the order is picked up, and only the rider can', async () => {
    const { owner, order, customer } = await newOrder();
    const rider = await registerUser('rider');
    const stranger = await registerUser('rider');
    const send = (who, lat = 22.57, lng = 88.36) => api().put(`/api/rider/orders/${order._id}/location`).set(auth(who.token)).send({ lat, lng });

    await ownerMove(owner, order, 'accepted');
    await claim(rider, order);
    expect((await send(rider)).status).toBe(409); // not picked up yet
    await ownerMove(owner, order, 'preparing');
    await ownerMove(owner, order, 'ready');
    await riderMove(rider, order, 'picked_up');

    expect((await send(stranger)).status).toBe(409);
    expect((await send(rider, 200, 88)).status).toBe(400); // invalid latitude
    expect((await send(rider, 22.571, 88.362)).status).toBe(200);
    const seen = await api().get(`/api/orders/${order._id}`).set(auth(customer.token));
    expect(seen.body.order.riderLocation).toMatchObject({ lat: 22.571, lng: 88.362 });
  });
});

describe('ratings and reviews', () => {
  async function delivered() {
    const ctx = await newOrder();
    const rider = await registerUser('rider');
    await ownerMove(ctx.owner, ctx.order, 'accepted');
    await claim(rider, ctx.order);
    await ownerMove(ctx.owner, ctx.order, 'preparing');
    await ownerMove(ctx.owner, ctx.order, 'ready');
    await riderMove(rider, ctx.order, 'picked_up');
    await riderMove(rider, ctx.order, 'delivered');
    return ctx;
  }
  const review = (customer, order, body) => api().post(`/api/orders/${order._id}/review`).set(auth(customer.token)).send(body);

  it('is only possible after delivery, once per order', async () => {
    const early = await newOrder();
    expect((await review(early.customer, early.order, { rating: 5 })).status).toBe(409);

    const { customer, order, place } = await delivered();
    expect((await review(customer, order, { rating: 0 })).status).toBe(400);
    expect((await review(customer, order, { rating: 6 })).status).toBe(400);
    const ok = await review(customer, order, { rating: 4, comment: 'Tasty' });
    expect(ok.status).toBe(201);
    expect((await review(customer, order, { rating: 5 })).status).toBe(409);

    const page = await api().get(`/api/restaurants/${place._id}`);
    expect(page.body.restaurant).toMatchObject({ ratingAvg: 4, ratingCount: 1 });
    expect(page.body.reviews[0]).toMatchObject({ rating: 4, comment: 'Tasty' });
  });

  it("keeps the restaurant's average up to date across customers and blocks other people's orders", async () => {
    const first = await delivered();
    await review(first.customer, first.order, { rating: 5 });

    const customer2 = await registerUser('customer');
    const rider = await registerUser('rider');
    const { order } = await placeOrder(customer2, first.place, [line(first.naan, 3)]);
    await ownerMove(first.owner, order, 'accepted');
    await claim(rider, order);
    await ownerMove(first.owner, order, 'preparing');
    await ownerMove(first.owner, order, 'ready');
    await riderMove(rider, order, 'picked_up');
    await riderMove(rider, order, 'delivered');

    expect((await review(first.customer, order, { rating: 1 })).status).toBe(404); // not their order
    await review(customer2, order, { rating: 2 });
    const page = await api().get(`/api/restaurants/${first.place._id}`);
    expect(page.body.restaurant).toMatchObject({ ratingAvg: 3.5, ratingCount: 2 });
  });
});
