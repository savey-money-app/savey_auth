/**
 * HS256 JWT utilities using Web Crypto API (available in Bun).
 * Produces tokens compatible with python-jose on the FastAPI side.
 */

const JWT_ALG = 'HS256';
const EXPIRES_IN_SECONDS = 15 * 60; // 15 minutes

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64urlFromString(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signJWT(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const header = { alg: JWT_ALG, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iat: now,
    exp: now + EXPIRES_IN_SECONDS,
    iss: 'savey_auth',
    ...payload,
  };

  const headerB64 = base64urlFromString(JSON.stringify(header));
  const payloadB64 = base64urlFromString(JSON.stringify(claims));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));

  return `${signingInput}.${base64url(sig)}`;
}

export async function verifyJWT(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  try {
    const [headerB64, payloadB64, sigB64] = token.split('.');
    if (!headerB64 || !payloadB64 || !sigB64) return null;

    const signingInput = `${headerB64}.${payloadB64}`;
    const key = await getKey(secret);

    // Restore base64url to base64
    const b64 = sigB64.replace(/-/g, '+').replace(/_/g, '/');
    const sig = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(signingInput));
    if (!valid) return null;

    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}
