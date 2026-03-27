import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { auth } from './auth';
import { signJWT } from './jwt';

const app = new Hono();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  }),
);

const JWT_SECRET = process.env.JWT_SECRET!;

/**
 * Sign-in wrapper: calls Better Auth then returns HS256 JWT for FastAPI.
 */
app.post('/api/auth/sign-in/email', async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();

  const result = await auth.api.signInEmail({
    body: { email: body.email, password: body.password },
    asResponse: false,
  });

  if (!result || !result.user) {
    return c.json({ message: 'Invalid email or password' }, 401);
  }

  const token = await signJWT({ sub: result.user.id, email: result.user.email }, JWT_SECRET);

  return c.json({
    token,
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
    },
  });
});

/**
 * Sign-up wrapper: creates Better Auth user then returns HS256 JWT.
 */
app.post('/api/auth/sign-up/email', async (c) => {
  const body = await c.req.json<{ email: string; password: string; name?: string }>();

  const result = await auth.api.signUpEmail({
    body: {
      email: body.email,
      password: body.password,
      name: body.name ?? '',
    },
    asResponse: false,
  });

  if (!result || !result.user) {
    return c.json({ message: 'Registration failed' }, 400);
  }

  const token = await signJWT({ sub: result.user.id, email: result.user.email }, JWT_SECRET);

  return c.json(
    {
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
    },
    201,
  );
});

/**
 * Token refresh: given a valid Better Auth session, issue a fresh JWT.
 * Mobile app calls this when the 15-min access token expires.
 */
app.post('/api/auth/token/refresh', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const token = await signJWT({ sub: session.user.id, email: session.user.email }, JWT_SECRET);
  return c.json({ token });
});

/**
 * Internal endpoint: validate a Better Auth session and return user info.
 * Used by services that need to verify a session cookie (not a JWT).
 */
app.get('/internal/session', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  return c.json({ user_id: session.user.id, email: session.user.email });
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Mount Better Auth handler for all other /api/auth/* routes
// (OAuth callbacks, session management, CSRF, etc.)
app.on(['GET', 'POST'], '/api/auth/**', (c) => auth.handler(c.req.raw));

export default { port: 3001, fetch: app.fetch };
