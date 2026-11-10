import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NEAR, api, auth, clearDb, line, placeOrder, registerUser, setupRestaurant, startDb, stopDb } from './helpers.js';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe('owner: restaurant', () => {
  it('starts with no restaurant, then creates one (only once)', async () => {
    const owner = await registerUser('owner');
    expect((await api().get('/api/owner/restaurant').set(auth(owner.token))).body.restaurant).toBeNull();
    expect((await api().get('/api/owner/menu').set(auth(owner.token))).status).toBe(404);

    const body = { name: 'Fresh Plate', address: '5 Lake Road', location: NEAR };
    const created = await api().post('/api/owner/restaurant').set(auth(owner.token)).send(body);
    expect(created.status).toBe(201);
    expect(created.body.restaurant).toMatchObject({ name: 'Fresh Plate', isOpen: true, deliveryRadiusKm: 8, prepTime: 25 });
    expect(created.body.restaurant.slug).toMatch(/^fresh-plate-/);
    expect((await api().post('/api/owner/restaurant').set(auth(owner.token)).send(body)).status).toBe(409);
  });

  it('validates input and only changes the fields that were sent', async () => {
    const { owner } = await setupRestaurant({ restaurant: { pureVeg: true, priceForTwo: 450, cuisines: ['Biryani', 'Mughlai'] } });
    expect((await api().put('/api/owner/restaurant').set(auth(owner.token)).send({ prepTime: 2 })).status).toBe(400);
    expect((await api().put('/api/owner/restaurant').set(auth(owner.token)).send({ location: { lat: 200, lng: 0 } })).status).toBe(400);
    expect((await api().put('/api/owner/restaurant').set(auth(owner.token)).send({ image: 'javascript:alert(1)' })).status).toBe(400);

    const res = await api().put('/api/owner/restaurant').set(auth(owner.token)).send({ isOpen: false });
    expect(res.body.restaurant).toMatchObject({ isOpen: false, pureVeg: true, priceForTwo: 450, cuisines: ['Biryani', 'Mughlai'] });
  });
});

describe('owner: menu', () => {
  it('creates, updates and deletes dishes, with option-group validation', async () => {
    const { owner, naan } = await setupRestaurant();
    const bad = await api().post('/api/owner/menu').set(auth(owner.token)).send({
      name: 'Pizza', price: 100, category: 'Pizza',
      optionGroups: [{ name: 'Size', min: 2, max: 1, options: [{ name: 'S', price: 0 }] }],
    });
    expect(bad.status).toBe(400);

    const upd = await api().put(`/api/owner/menu/${naan._id}`).set(auth(owner.token)).send({ price: 60 });
    expect(upd.body.item).toMatchObject({ price: 60, name: 'Butter Naan', veg: true, available: true });

    expect((await api().delete(`/api/owner/menu/${naan._id}`).set(auth(owner.token))).status).toBe(200);
    expect((await api().get('/api/owner/menu').set(auth(owner.token))).body.items.map((i) => i.name)).toEqual(['Chicken Biryani']);
  });

  it("cannot edit or delete another restaurant's dishes", async () => {
    const a = await setupRestaurant();
    const b = await setupRestaurant();
    expect((await api().put(`/api/owner/menu/${a.naan._id}`).set(auth(b.owner.token)).send({ price: 1 })).status).toBe(404);
    expect((await api().delete(`/api/owner/menu/${a.naan._id}`).set(auth(b.owner.token))).status).toBe(404);
    expect((await api().get('/api/owner/menu').set(auth(b.owner.token))).body.items).toHaveLength(2);
  });
});

describe('owner: coupons', () => {
  it('creates, edits and deletes coupons with sensible rules', async () => {
    const { owner } = await setupRestaurant();
    const post = (body) => api().post('/api/owner/coupons').set(auth(owner.token)).send(body);
    expect((await post({ code: 'ab', type: 'percent', value: 10 })).status).toBe(400); // code too short
    expect((await post({ code: 'HALF', type: 'percent', value: 150 })).status).toBe(400); // over 100%
    expect((await post({ code: 'ZERO', type: 'flat', value: 0 })).status).toBe(400);

    const ok = await post({ code: 'half50', type: 'percent', value: 50, maxDiscount: 100 });
    expect(ok.status).toBe(201);
    expect(ok.body.coupon.code).toBe('HALF50'); // normalised
    expect((await post({ code: 'HALF50', type: 'flat', value: 10 })).status).toBe(409);

    const id = ok.body.coupon._id;
    expect((await api().put(`/api/owner/coupons/${id}`).set(auth(owner.token)).send({ value: 120 })).status).toBe(400);
    expect((await api().put(`/api/owner/coupons/${id}`).set(auth(owner.token)).send({ active: false })).body.coupon).toMatchObject({ active: false, value: 50 });
    expect((await api().delete(`/api/owner/coupons/${id}`).set(auth(owner.token))).status).toBe(200);
    expect((await api().get('/api/owner/coupons').set(auth(owner.token))).body.coupons).toHaveLength(0);
  });
});

describe('owner: dashboard stats', () => {
  it('counts pending and active orders and totals delivered revenue', async () => {
    const { owner, place, naan } = await setupRestaurant();
    const customer = await registerUser('customer');
    const rider = await registerUser('rider');
    const a = (await placeOrder(customer, place, [line(naan, 4)])).order; // 200 -> total 235
    await placeOrder(customer, place, [line(naan, 3)]); // stays pending

    const move = (o, status) => api().put(`/api/owner/orders/${o._id}/status`).set(auth(owner.token)).send({ status });
    await move(a, 'accepted');
    await api().post(`/api/rider/orders/${a._id}/claim`).set(auth(rider.token));
    await move(a, 'preparing');
    await move(a, 'ready');
    await api().put(`/api/rider/orders/${a._id}/status`).set(auth(rider.token)).send({ status: 'picked_up' });
    await api().put(`/api/rider/orders/${a._id}/status`).set(auth(rider.token)).send({ status: 'delivered' });

    const res = await api().get('/api/owner/stats').set(auth(owner.token));
    expect(res.status).toBe(200);
    expect(res.body.today).toEqual({ orders: 2, revenue: 235 });
    expect(res.body.pending).toBe(1);
    expect(res.body.active).toBe(1);
    expect(res.body.last7).toHaveLength(7);
    expect(res.body.last7.at(-1)).toMatchObject({ orders: 1, revenue: 235 });
    expect(res.body.topItems[0]).toMatchObject({ name: 'Butter Naan', qty: 4 });
  });
});
