import { describe, expect, test } from 'bun:test';
import { createApp, type AuthRoutes } from './app';
import { verifyJWT } from './jwt';

const JWT_SECRET = 'test-secret';

function authRoutes(api: Partial<AuthRoutes['api']> = {}): AuthRoutes {
  return {
    api: {
      signInEmail: async () => null,
      signUpEmail: async () => null,
      getSession: async () => null,
      ...api,
    },
    handler: () => new Response('better-auth', { status: 204 }),
  };
}

describe('auth app', () => {
  test('serves health and delegates unmatched Better Auth routes', async () => {
    const app = createApp(authRoutes(), JWT_SECRET);

    const health = await app.request('/health');
    const delegated = await app.request('/api/auth/session');

    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    expect(delegated.status).toBe(204);
  });

  test('rejects malformed sign-in JSON', async () => {
    const app = createApp(authRoutes(), JWT_SECRET);
    const response = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      body: '{',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'Invalid request body' });
  });

  test('signs a FastAPI JWT after email sign-in', async () => {
    const app = createApp(
      authRoutes({
        signInEmail: async () => ({
          user: { id: 'user-1', email: 'user@example.com', name: 'Savey User' },
        }),
      }),
      JWT_SECRET,
    );

    const response = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@example.com', password: 'password' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const body = await response.json();
    const claims = await verifyJWT(body.token, JWT_SECRET);

    expect(response.status).toBe(200);
    expect(body.user).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Savey User',
    });
    expect(claims?.sub).toBe('user-1');
    expect(claims?.email).toBe('user@example.com');
    expect(claims?.name).toBe('Savey User');
  });

  test('maps existing-account sign-up errors to conflict', async () => {
    const app = createApp(
      authRoutes({
        signUpEmail: async () => {
          throw new Error('duplicate user');
        },
      }),
      JWT_SECRET,
    );

    const response = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@example.com', password: 'password' }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: 'An account with this email already exists',
    });
  });

  test('refreshes JWTs and exposes internal sessions', async () => {
    const app = createApp(
      authRoutes({
        getSession: async () => ({
          user: { id: 'user-2', email: 'session@example.com' },
        }),
      }),
      JWT_SECRET,
    );

    const refresh = await app.request('/api/auth/token/refresh', { method: 'POST' });
    const refreshBody = await refresh.json();
    const internalSession = await app.request('/internal/session');

    expect(refresh.status).toBe(200);
    expect((await verifyJWT(refreshBody.token, JWT_SECRET))?.sub).toBe('user-2');
    expect(await internalSession.json()).toEqual({
      user_id: 'user-2',
      email: 'session@example.com',
    });
  });
});
