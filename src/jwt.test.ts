import { describe, expect, test } from 'bun:test';
import { signJWT, verifyJWT } from './jwt';

describe('JWT helpers', () => {
  test('signs and verifies FastAPI-compatible claims', async () => {
    const token = await signJWT({ sub: 'user-1', email: 'user@example.com' }, 'secret');
    const claims = await verifyJWT(token, 'secret');

    expect(claims?.sub).toBe('user-1');
    expect(claims?.email).toBe('user@example.com');
    expect(claims?.iss).toBe('savey_auth');
    expect(claims?.exp).toBeNumber();
  });

  test('rejects invalid tokens and signatures', async () => {
    const token = await signJWT({ sub: 'user-1' }, 'secret');

    expect(await verifyJWT('not-a-token', 'secret')).toBeNull();
    expect(await verifyJWT(token, 'different-secret')).toBeNull();
  });
});
