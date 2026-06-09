import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authContext, sameOrigin, type AppEnv } from './middleware';
import { gcExpiredSessions } from '@/lib/auth';
import auth from './routes/auth';
import notes from './routes/notes';
import tags from './routes/tags';
import share from './routes/share';
import publicShare from './routes/publicShare';

const app = new Hono<AppEnv>();

// L-3：每 1% 機率背景 GC 過期 sessions（避免無限堆積）
let lastGc = 0;
function maybeGc() {
  const now = Date.now();
  if (now - lastGc > 60_000 && Math.random() < 0.01) {
    lastGc = now;
    void gcExpiredSessions().catch(() => {});
  }
}
app.use('*', async (_c, next) => {
  maybeGc();
  await next();
});

// 全域錯誤處理
app.onError((err, c) => {
  // 自定 HttpError（從 lib/errors throw）
  if (err && typeof err === 'object' && 'status' in err && 'code' in err) {
    const e = err as { status: number; code: string; message: string };
    return c.json(
      { error: { code: e.code, message: e.message } },
      e.status as 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 500,
    );
  }
  if (err instanceof HTTPException) {
    try {
      const parsed = JSON.parse(err.message);
      return c.json(parsed, err.status as 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 500);
    } catch {
      return c.json(
        { error: { code: 'http_error', message: err.message } },
        err.status as 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 500,
      );
    }
  }
  if (err instanceof SyntaxError) {
    return c.json(
      { error: { code: 'bad_request', message: 'Invalid JSON' } },
      400,
    );
  }
  console.error('[api error]', err);
  return c.json(
    { error: { code: 'internal_error', message: 'Internal error' } },
    500,
  );
});

app.notFound((c) =>
  c.json({ error: { code: 'not_found', message: 'Route not found' } }, 404),
);

app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }));

// 共用 context
app.use('*', authContext);
app.use('*', sameOrigin);

app.route('/api/auth', auth);
app.route('/api/notes', notes);
app.route('/api/tags', tags);
app.route('/api/share', share);
app.route('/api/public', publicShare);

export type AppType = typeof app;
export default app;
