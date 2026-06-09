import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, passwordResets } from '@/db/schema';
import {
  hashPassword,
  verifyPassword,
  createSession,
  revokeSession,
  buildSessionCookie,
  buildClearSessionCookie,
} from '@/lib/auth';
import { generateShareToken, hashToken } from '@/lib/crypto';
import { httpErrors } from '@/lib/errors';
import { env } from '@/lib/env';
import type { AppEnv } from '../middleware';
import { requireAuth } from '../middleware';

const router = new Hono<AppEnv>();

const SignUpBody = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(80).optional(),
});

const SignInBody = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

const ForgotBody = z.object({
  email: z.string().email().max(200),
});

const ResetBody = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(200),
});

// POST /api/auth/signup
router.post('/signup', async (c) => {
  const body = SignUpBody.parse(await c.req.json().catch(() => ({})));
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email.toLowerCase()))
    .limit(1);
  if (existing.length) throw httpErrors.conflict('Email already in use', 'email_taken');

  const passwordHash = await hashPassword(body.password);
  const [user] = await db
    .insert(users)
    .values({
      email: body.email.toLowerCase(),
      passwordHash,
      name: body.name,
    })
    .returning({ id: users.id, email: users.email, name: users.name });
  if (!user) throw httpErrors.server('Failed to create user');

  const { token, expiresAt } = await createSession(user.id);
  c.header('Set-Cookie', buildSessionCookie(token, expiresAt), { append: true });
  return c.json({ user });
});

// POST /api/auth/signin
router.post('/signin', async (c) => {
  const body = SignInBody.parse(await c.req.json().catch(() => ({})));
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email.toLowerCase()))
    .limit(1);
  const user = rows[0];
  if (!user) throw httpErrors.unauthorized('Invalid credentials', 'invalid_credentials');
  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) throw httpErrors.unauthorized('Invalid credentials', 'invalid_credentials');

  const { token, expiresAt } = await createSession(user.id);
  c.header('Set-Cookie', buildSessionCookie(token, expiresAt), { append: true });
  return c.json({
    user: { id: user.id, email: user.email, name: user.name },
  });
});

// POST /api/auth/signout
router.post('/signout', requireAuth, async (c) => {
  const token = c.get('sessionToken');
  if (token) await revokeSession(token);
  c.header('Set-Cookie', buildClearSessionCookie(), { append: true });
  return c.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', (c) => {
  const user = c.get('user');
  if (!user) return c.json({ user: null });
  return c.json({
    user: { id: user.id, email: user.email, name: user.name },
  });
});

// POST /api/auth/forgot — demo: console magic link (§8.1 O-2)
router.post('/forgot', async (c) => {
  const body = ForgotBody.parse(await c.req.json().catch(() => ({})));
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email.toLowerCase()))
    .limit(1);
  // 不論是否存在都回 ok（防枚舉）
  if (rows.length) {
    const { token, tokenHash } = generateShareToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await db.insert(passwordResets).values({
      userId: rows[0].id,
      tokenHash,
      expiresAt,
    });
    const url = `${env.APP_ORIGIN}/reset?token=${token}`;
    // eslint-disable-next-line no-console
    console.log(`[magic-link] ${body.email} → ${url}`);
  }
  return c.json({ ok: true });
});

// POST /api/auth/reset
router.post('/reset', async (c) => {
  const body = ResetBody.parse(await c.req.json().catch(() => ({})));
  const tokenHash = hashToken(body.token);
  const rows = await db
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, tokenHash))
    .limit(1);
  const reset = rows[0];
  if (!reset) throw httpErrors.unauthorized('Invalid or expired token', 'invalid_token');
  if (reset.usedAt) throw httpErrors.unauthorized('Token already used', 'invalid_token');
  if (reset.expiresAt < new Date()) throw httpErrors.unauthorized('Token expired', 'invalid_token');

  const passwordHash = await hashPassword(body.password);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, reset.userId));
    await tx
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(eq(passwordResets.id, reset.id));
  });
  return c.json({ ok: true });
});

export default router;
