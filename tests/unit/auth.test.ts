import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/db/client';
import { users, sessions, notes, tags } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  hashPassword,
  verifyPassword,
  createSession,
  findUserBySessionToken,
  revokeSession,
  buildSessionCookie,
  readSessionCookie,
} from '@/lib/auth';
import { generateShareToken, hashToken } from '@/lib/crypto';
import { httpErrors } from '@/lib/errors';
import { HttpError } from '@/lib/errors';
import { renderMarkdown } from '@/lib/markdown';

const TEST_EMAIL = `vit-${Date.now()}@example.com`;

async function cleanup() {
  await db.delete(users).where(eq(users.email, TEST_EMAIL));
}

beforeAll(cleanup);
afterAll(cleanup);

describe('auth: bcrypt + session', () => {
  it('hashPassword + verifyPassword roundtrip', async () => {
    const hash = await hashPassword('hunter2-hunter2');
    expect(hash).not.toBe('hunter2-hunter2');
    expect(hash.length).toBeGreaterThan(50);
    expect(await verifyPassword('hunter2-hunter2', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('createSession + findUserBySessionToken', async () => {
    const [u] = await db
      .insert(users)
      .values({ email: TEST_EMAIL, passwordHash: await hashPassword('pw12345678') })
      .returning();
    if (!u) throw new Error('insert failed');
    const { token, expiresAt } = await createSession(u.id);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const found = await findUserBySessionToken(token);
    expect(found?.id).toBe(u.id);
    // 錯誤 token
    const missing = await findUserBySessionToken('not-a-real-token-xxxxxxxxxxxxxx');
    expect(missing).toBeNull();
  });

  it('revokeSession invalidates token', async () => {
    const { token } = await createSession(
      (await db.select().from(users).where(eq(users.email, TEST_EMAIL)).limit(1))[0]!.id,
    );
    expect(await findUserBySessionToken(token)).not.toBeNull();
    await revokeSession(token);
    expect(await findUserBySessionToken(token)).toBeNull();
  });

  it('cookie builder parses with readSessionCookie', () => {
    const cookie = buildSessionCookie('abc', new Date(Date.now() + 60_000));
    expect(cookie).toContain('ob_sid=abc');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(readSessionCookie(cookie)).toBe('abc');
    expect(readSessionCookie(null)).toBeNull();
    expect(readSessionCookie('foo=bar; baz=qux')).toBeNull();
  });
});

describe('crypto: share token (32 bytes unguessable)', () => {
  it('tokens are unique + non-enumerable', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const { token } = generateShareToken();
      expect(token.length).toBeGreaterThanOrEqual(40);
      expect(seen.has(token)).toBe(false);
      seen.add(token);
    }
  });
  it('hashToken is deterministic and 64 hex chars', () => {
    const h1 = hashToken('hello');
    const h2 = hashToken('hello');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('markdown: XSS guard', () => {
  it('strips raw HTML', () => {
    const html = renderMarkdown('Hello <script>alert(1)</script> world');
    expect(html).not.toContain('<script>');
  });
  it('neutralizes javascript: links', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');
    expect(html).not.toMatch(/href="javascript:/i);
  });
  it('preserves safe markdown', () => {
    const html = renderMarkdown('# Title\n\n**bold** _italic_ `code`');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
  });
  it('external links get rel + target', () => {
    const html = renderMarkdown('[ext](https://example.com)');
    expect(html).toMatch(/target="_blank"/);
    expect(html).toMatch(/rel="noopener noreferrer"/);
  });
});

describe('errors', () => {
  it('httpErrors helpers produce correct status', () => {
    expect(httpErrors.notFound().status).toBe(404);
    expect(httpErrors.unauthorized().status).toBe(401);
    expect(httpErrors.conflict().status).toBe(409);
    const err = new HttpError(418, "I'm a teapot", 'msg');
    expect(err.status).toBe(418);
  });
});
