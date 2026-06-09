import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, passwordResets, sessions } from '@/db/schema';
import {
  hashPassword,
  verifyPassword,
  timingSafeNoUser,
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
  const body = SignUpBody.parse(await c.req.json());
  const passwordHash = await hashPassword(body.password);
  // 單一原子 INSERT：email 唯一 constraint 自動擋 race
  let user: { id: string; email: string; name: string | null } | undefined;
  try {
    const rows = await db
      .insert(users)
      .values({
        email: body.email.toLowerCase(),
        passwordHash,
        name: body.name,
      })
      .returning({ id: users.id, email: users.email, name: users.name });
    user = rows[0];
  } catch (e) {
    // PG unique violation 23505
    if (
      e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === '23505'
    ) {
      throw httpErrors.conflict('Email already in use', 'email_taken');
    }
    throw e;
  }
  if (!user) throw httpErrors.server('Failed to create user');

  const { token, expiresAt } = await createSession(user.id);
  c.header('Set-Cookie', buildSessionCookie(token, expiresAt), { append: true });
  return c.json({ user });
});

// POST /api/auth/signin — 不論 email 是否存在都跑 bcrypt，防 timing oracle
router.post('/signin', async (c) => {
  const body = SignInBody.parse(await c.req.json());
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email.toLowerCase()))
    .limit(1);
  const user = rows[0];
  if (!user) {
    // 跑 dummy bcrypt 對齊耗時
    timingSafeNoUser();
    throw httpErrors.unauthorized('Invalid credentials', 'invalid_credentials');
  }
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
// 同一使用者只能有 1 個有效 token — 新請求會 mark 舊的為 used
router.post('/forgot', async (c) => {
  const body = ForgotBody.parse(await c.req.json());
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email.toLowerCase()))
    .limit(1);
  if (rows.length) {
    const userId = rows[0].id;
    const now = new Date();
    await db
      .update(passwordResets)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResets.userId, userId),
          isNull(passwordResets.usedAt),
        ),
      );
    const { token, tokenHash } = generateShareToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await db.insert(passwordResets).values({
      userId,
      tokenHash,
      expiresAt,
    });
    const url = `${env.APP_ORIGIN}/reset?token=${token}`;
    // eslint-disable-next-line no-console
    console.log(`[magic-link] ${body.email} → ${url}`);
  }
  return c.json({ ok: true });
});

// POST /api/auth/reset — 原子：條件式標記 used + revoke 全部 sessions + 改密碼
router.post('/reset', async (c) => {
  const body = ResetBody.parse(await c.req.json());
  const tokenHash = hashToken(body.token);
  const now = new Date();
  // 原子標記為 used：僅 usedAt IS NULL 且未過期時才更新，回傳更新筆數
  const marked = await db
    .update(passwordResets)
    .set({ usedAt: now })
    .where(
      and(
        eq(passwordResets.tokenHash, tokenHash),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, now),
      ),
    )
    .returning({ id: passwordResets.id, userId: passwordResets.userId });
  const row = marked[0];
  if (!row) throw httpErrors.unauthorized('Invalid or expired token', 'invalid_token');

  const passwordHash = await hashPassword(body.password);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
    // 重設密碼後撤銷所有 sessions（防 attacker 持有的 cookie 繼續有效）
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
  });
  return c.json({ ok: true });
});

export default router;
