import 'dotenv/config';
import { createMiddleware } from 'hono/factory';
import { jwtVerify, SignJWT } from 'jose';

const secret = new TextEncoder().encode(process.env['JWT_SECRET']);
if (!process.env['JWT_SECRET'] || process.env['JWT_SECRET'].length < 32) {
  throw new Error('JWT_SECRET must be set and contain at least 32 characters');
}

export type AuthUser = {
  id: number;
  username: string;
  email: string;
};

export const createToken = (user: AuthUser) =>
  new SignJWT({ email: user.email, username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);

export const requireAuth = createMiddleware<{
  Variables: { user: AuthUser };
}>(async (c, next) => {
  const authorization = c.req.header('Authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : undefined;

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    const id = Number(payload.sub);
    const email = typeof payload['email'] === 'string' ? payload['email'] : undefined;
    const username = typeof payload['username'] === 'string' ? payload['username'] : undefined;
    if (!Number.isInteger(id) || !email || !username) {
      return c.json({ error: 'Invalid authentication token' }, 401);
    }
    c.set('user', { id, email, username });
    return next();
  } catch {
    return c.json({ error: 'Invalid or expired authentication token' }, 401);
  }
});
