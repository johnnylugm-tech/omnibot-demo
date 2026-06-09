// Hono 中介層：認證 + CSRF + 統一錯誤
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { readSessionCookie, findUserBySessionToken, type SESSION_COOKIE } from '@/lib/auth';
import { env } from '@/lib/env';
import type { User } from '@/db/schema';

export type AppEnv = {
  Variables: {
    user: User | null;
    sessionToken: string | null;
  };
};

// 從 cookie 找 user，設進 c.set
export const authContext = createMiddleware<AppEnv>(async (c, next) => {
  const cookieHeader = c.req.header('cookie') ?? null;
  const token = readSessionCookie(cookieHeader);
  let user: User | null = null;
  if (token) {
    try {
      user = await findUserBySessionToken(token);
    } catch {
      user = null;
    }
  }
  c.set('user', user);
  c.set('sessionToken', token);
  await next();
});

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: { code: 'unauthorized', message: 'Login required' } }, 401);
  }
  await next();
});

// Same-origin 檢查 (defense-in-depth on top of SameSite=Lax)
// 允許沒有 Origin header（部分 server-to-server / 直接 fetch）但若帶了必須 match
export const sameOrigin = createMiddleware<AppEnv>(async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  const origin = c.req.header('origin');
  if (!origin) return next(); // 瀏覽器都會送；放行非瀏覽器 client
  const allowed = new URL(env.APP_ORIGIN).origin;
  if (origin !== allowed) {
    return c.json({ error: { code: 'forbidden', message: 'Cross-origin denied' } }, 403);
  }
  await next();
});

export function toHttpException(err: unknown): HTTPException {
  if (err instanceof HTTPException) return err;
  if (err && typeof err === 'object' && 'status' in err && 'code' in err) {
    const e = err as { status: number; code: string; message: string };
    return new HTTPException(e.status as 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 500, {
      message: JSON.stringify({ error: { code: e.code, message: e.message } }),
    });
  }
  console.error('[unhandled]', err);
  return new HTTPException(500, {
    message: JSON.stringify({ error: { code: 'internal_error', message: 'Internal error' } }),
  });
}
