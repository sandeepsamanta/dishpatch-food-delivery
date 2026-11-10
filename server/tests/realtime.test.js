import { createServer } from 'node:http';
import { io as connect } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeRealtime, initRealtime } from '../src/realtime/socket.js';
import { api, app, auth, clearDb, line, placeOrder, registerUser, setupRestaurant, startDb, stopDb } from './helpers.js';

let server;
let url;
const sockets = [];

beforeAll(async () => {
  await startDb();
  server = createServer(app);
  initRealtime(server);
  await new Promise((r) => server.listen(0, r));
  url = `http://localhost:${server.address().port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await closeRealtime();
  await new Promise((r) => server.close(r));
  await stopDb();
});
beforeEach(clearDb);

const listen = (token) =>
  new Promise((resolve, reject) => {
    const s = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
const next = (socket, event) => new Promise((resolve) => socket.once(event, resolve));
const quiet = (socket, event, ms = 300) =>
  new Promise((resolve) => {
    let got = false;
    socket.once(event, () => (got = true));
    setTimeout(() => resolve(!got), ms);
  });

describe('realtime updates', () => {
  it('rejects sockets without a valid token', async () => {
    await expect(listen('nope')).rejects.toThrow(/unauthorized/);
  });

  it('pushes new orders to the restaurant, and status changes to the customer', async () => {
    const { owner, place, naan } = await setupRestaurant();
    const customer = await registerUser('customer');
    const ownerSocket = await listen(owner.token);
    const customerSocket = await listen(customer.token);

    const arrival = next(ownerSocket, 'order:new');
    const { order } = await placeOrder(customer, place, [line(naan, 3)]);
    expect((await arrival)._id).toBe(order._id);

    const update = next(customerSocket, 'order:update');
    await api().put(`/api/owner/orders/${order._id}/status`).set(auth(owner.token)).send({ status: 'accepted' });
    expect(await update).toMatchObject({ _id: order._id, status: 'accepted' });
  });

  it('tells riders about accepted orders, then removes them once claimed, and streams location to the customer', async () => {
    const { owner, place, naan } = await setupRestaurant();
    const customer = await registerUser('customer');
    const rider = await registerUser('rider');
    const otherRider = await registerUser('rider');
    const riderSocket = await listen(rider.token);
    const otherSocket = await listen(otherRider.token);
    const customerSocket = await listen(customer.token);
    const { order } = await placeOrder(customer, place, [line(naan, 3)]);

    const offered = Promise.all([next(riderSocket, 'order:available'), next(otherSocket, 'order:available')]);
    await api().put(`/api/owner/orders/${order._id}/status`).set(auth(owner.token)).send({ status: 'accepted' });
    expect((await offered).map((o) => o._id)).toEqual([order._id, order._id]);

    const gone = next(otherSocket, 'order:unavailable');
    await api().post(`/api/rider/orders/${order._id}/claim`).set(auth(rider.token));
    expect((await gone)._id).toBe(order._id);

    await api().put(`/api/owner/orders/${order._id}/status`).set(auth(owner.token)).send({ status: 'preparing' });
    await api().put(`/api/owner/orders/${order._id}/status`).set(auth(owner.token)).send({ status: 'ready' });
    await api().put(`/api/rider/orders/${order._id}/status`).set(auth(rider.token)).send({ status: 'picked_up' });

    const moved = next(customerSocket, 'order:location');
    await api().put(`/api/rider/orders/${order._id}/location`).set(auth(rider.token)).send({ lat: 22.575, lng: 88.364 });
    expect((await moved).riderLocation).toMatchObject({ lat: 22.575, lng: 88.364 });
  });

  it("does not leak one customer's order events to another customer", async () => {
    const { owner, place, naan } = await setupRestaurant();
    const alice = await registerUser('customer');
    const bob = await registerUser('customer');
    const bobSocket = await listen(bob.token);
    const silent = quiet(bobSocket, 'order:update');
    const { order } = await placeOrder(alice, place, [line(naan, 3)]);
    await api().put(`/api/owner/orders/${order._id}/status`).set(auth(owner.token)).send({ status: 'accepted' });
    expect(await silent).toBe(true);
  });
});
