// Auth: bcrypt(cost=12) + DB-backed session (§8.2 T-4, T-5)
// - 給使用者的 cookie = 隨機 32 bytes base64url
// - DB 存 sha256(cookie) → DB 洩漏無法偽造登入
// - session.expiresAt = +14d (§4 NFR)
import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq, and, gt, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessions, users, type User } from '@/db/schema';
import { env } from './env';

const BCRYPT_COST = 12;
const SESSION_TTL_DAYS = 14;
export const SESSION_COOKIE = 'ob_sid';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

export async function createSession(userId: string): Promise<CreatedSession> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  return { token, expiresAt };
}

export async function revokeSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function findUserBySessionToken(token: string): Promise<User | null> {
  const tokenHash = hashToken(token);
  const now = new Date();
  const row = await db
    .select({
      user: users,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row.length) return null;
  return row[0].user;
}

// Lazy GC：讀取時順便清過期
export async function gcExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

// Build Set-Cookie header (HttpOnly, SameSite=Lax, Secure in prod)
export function buildSessionCookie(token: string, expiresAt: Date): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export function buildClearSessionCookie(): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === SESSION_COOKIE && v) return v;
  }
  return null;
}
