import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, auth, clearDb, registerUser, startDb, stopDb } from './helpers.js';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe('auth', () => {
  it('registers a customer by default and returns a token', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'Riya Sen', email: 'RIYA@Test.dev', password: 'Passw0rdX' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'riya@test.dev', role: 'customer' });
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.token).toBeTruthy();
  });

  it.each(['customer', 'owner', 'rider'])('allows signing up as %s', async (role) => {
    const { user } = await registerUser(role);
    expect(user.role).toBe(role);
  });

  it('refuses an admin role and unknown roles', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'Eve', email: 'eve@test.dev', password: 'Passw0rdX', role: 'admin' });
    expect(res.status).toBe(400);
  });

  it('validates the password and email, and rejects duplicates', async () => {
    const weak = await api().post('/api/auth/register').send({ name: 'Eve', email: 'eve@test.dev', password: 'short' });
    expect(weak.status).toBe(400);
    const bad = await api().post('/api/auth/register').send({ name: 'Eve', email: 'not-an-email', password: 'Passw0rdX' });
    expect(bad.status).toBe(400);
    const first = await registerUser('customer', { email: 'dup@test.dev' });
    expect(first.res.status).toBe(201);
    const dup = await api().post('/api/auth/register').send({ name: 'Other', email: 'dup@test.dev', password: 'Passw0rdX' });
    expect(dup.status).toBe(409);
  });

  it('logs in with the right password only, with one generic error', async () => {
    const { credentials } = await registerUser('customer');
    const ok = await api().post('/api/auth/login').send({ email: credentials.email, password: credentials.password });
    expect(ok.status).toBe(200);
    const wrong = await api().post('/api/auth/login').send({ email: credentials.email, password: 'Wrong1234' });
    const unknown = await api().post('/api/auth/login').send({ email: 'nobody@test.dev', password: 'Wrong1234' });
    expect(wrong.status).toBe(401);
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('protects /auth/me and updates the profile', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
    expect((await api().get('/api/auth/me').set(auth('garbage'))).status).toBe(401);
    const { token, credentials } = await registerUser('customer');
    const me = await api().get('/api/auth/me').set(auth(token));
    expect(me.body.user.email).toBe(credentials.email);
    const upd = await api().put('/api/auth/profile').set(auth(token)).send({ name: 'New Name', phone: '+91 9000000000' });
    expect(upd.body.user).toMatchObject({ name: 'New Name', phone: '+91 9000000000' });
    const badPw = await api().put('/api/auth/profile').set(auth(token)).send({ newPassword: 'Another123', currentPassword: 'nope' });
    expect(badPw.status).toBe(400);
  });

  it('keeps the three role areas separate', async () => {
    const customer = await registerUser('customer');
    const owner = await registerUser('owner');
    const rider = await registerUser('rider');
    expect((await api().get('/api/owner/menu').set(auth(customer.token))).status).toBe(403);
    expect((await api().get('/api/rider/orders/available').set(auth(owner.token))).status).toBe(403);
    expect((await api().get('/api/orders/mine').set(auth(rider.token))).status).toBe(403);
    expect((await api().get('/api/owner/menu')).status).toBe(401);
  });
});
