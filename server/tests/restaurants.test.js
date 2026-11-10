import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FAR, NEAR, api, auth, clearDb, registerUser, setupRestaurant, startDb, stopDb } from './helpers.js';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

const make = async (name, extra = {}) => {
  const owner = await registerUser('owner');
  const res = await api()
    .post('/api/owner/restaurant')
    .set(auth(owner.token))
    .send({ name, address: '1 Road', location: NEAR, ...extra });
  return res.body.restaurant;
};

describe('restaurant discovery', () => {
  it('lists restaurants with filters, sorting and pagination', async () => {
    await make('Alpha Biryani', { cuisines: ['Biryani'], priceForTwo: 500 });
    await make('Beta Pizza', { cuisines: ['Pizza', 'Italian'], priceForTwo: 300, pureVeg: true });
    await make('Gamma Rolls', { cuisines: ['Rolls'], priceForTwo: 200 });

    const all = await api().get('/api/restaurants');
    expect(all.body.total).toBe(3);

    expect((await api().get('/api/restaurants').query({ q: 'pizza' })).body.restaurants.map((r) => r.name)).toEqual(['Beta Pizza']);
    expect((await api().get('/api/restaurants').query({ cuisine: 'Rolls' })).body.total).toBe(1);
    expect((await api().get('/api/restaurants').query({ pureVeg: 'true' })).body.total).toBe(1);

    const cheap = await api().get('/api/restaurants').query({ sort: 'price' });
    expect(cheap.body.restaurants.map((r) => r.priceForTwo)).toEqual([200, 300, 500]);

    const page2 = await api().get('/api/restaurants').query({ limit: 2, page: 2 });
    expect(page2.body.restaurants).toHaveLength(1);
    expect(page2.body.pages).toBe(2);
  });

  it('treats the search text literally, not as a regex', async () => {
    await make('Alpha Biryani');
    const res = await api().get('/api/restaurants').query({ q: '[a-' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('exposes location as lat/lng and lists cuisines', async () => {
    await make('Alpha Biryani', { cuisines: ['Biryani', 'Mughlai'] });
    const res = await api().get('/api/restaurants');
    expect(res.body.restaurants[0].location).toEqual(NEAR);
    expect((await api().get('/api/restaurants/cuisines')).body.cuisines).toEqual(['Biryani', 'Mughlai']);
  });

  it('with a location, returns distance and ETA, and only restaurants that deliver there', async () => {
    await make('Near Kitchen', { location: NEAR, deliveryRadiusKm: 5 });
    await make('Far Kitchen', { location: FAR, deliveryRadiusKm: 5 });
    await make('Far But Wide', { location: FAR, deliveryRadiusKm: 20 });

    const res = await api().get('/api/restaurants').query({ lat: 22.5726, lng: 88.3639, sort: 'distance' });
    expect(res.body.restaurants.map((r) => r.name)).toEqual(['Near Kitchen', 'Far But Wide']);
    const [near, far] = res.body.restaurants;
    expect(near.distanceKm).toBeCloseTo(0.5, 1);
    expect(far.distanceKm).toBeGreaterThan(11);
    expect(near.deliverable).toBe(true);
    expect(near.etaMins).toBeGreaterThan(20);
    expect(res.body.total).toBe(2);
  });

  it('returns a restaurant with its menu, active coupons and reviews', async () => {
    const { place, owner } = await setupRestaurant();
    await api().post('/api/owner/coupons').set(auth(owner.token)).send({ code: 'LIVE10', type: 'percent', value: 10 });
    await api().post('/api/owner/coupons').set(auth(owner.token)).send({ code: 'OLD10', type: 'percent', value: 10, expiresAt: '2020-01-01' });
    await api().post('/api/owner/coupons').set(auth(owner.token)).send({ code: 'USED10', type: 'percent', value: 10, usageLimit: 1 });
    const used = (await api().get(`/api/restaurants/${place._id}`)).body.coupons.find((c) => c.code === 'USED10');
    expect(used).toBeTruthy();

    const res = await api().get(`/api/restaurants/${place._id}`).query({ lat: 22.5726, lng: 88.3639 });
    expect(res.status).toBe(200);
    expect(res.body.menu.map((m) => m.name).sort()).toEqual(['Butter Naan', 'Chicken Biryani']);
    expect(res.body.coupons.map((c) => c.code).sort()).toEqual(['LIVE10', 'USED10']); // expired one hidden
    expect(res.body.restaurant.distanceKm).toBeCloseTo(0.5, 1);
    expect(res.body.reviews).toEqual([]);
  });

  it('answers 404 for an unknown or malformed id', async () => {
    expect((await api().get('/api/restaurants/64b7f0f0f0f0f0f0f0f0f0f0')).status).toBe(404);
    expect((await api().get('/api/restaurants/not-an-id')).status).toBe(400);
  });
});
