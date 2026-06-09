import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/db/client';
import { users, passwordResets, sessions, notes } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

import app from '@/server/api';
import { generateShareToken, hashToken } from '@/lib/crypto';

const EMAIL = `sec-${Date.now()}@example.com`;
const PWD = 'password123';
let cookie: string;
let noteId: string;

async function signup(email: string) {
  const r = await app.fetch(
    new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password: PWD }),
    }),
  );
  expect(r.status).toBe(200);
  const setCookie = r.headers.get('set-cookie') ?? '';
  const m = setCookie.match(/ob_sid=([^;]+)/);
  if (!m) throw new Error('no cookie');
  return m[1];
}

function authReq(path: string, init: RequestInit = {}) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        cookie: `ob_sid=${cookie}`,
        Origin: 'http://localhost:3000',
      },
    }),
  );
}

beforeAll(async () => {
  cookie = await signup(EMAIL);
  // 建立一則 note
  const r = await authReq('/api/notes', { method: 'POST' });
  const data = (await r.json()) as { note: { id: string } };
  noteId = data.note.id;
  await authReq(`/api/notes/${noteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'sec test', content: 'alpha bravo charlie' }),
  });
});

afterAll(async () => {
  await db.delete(users).where(eq(users.email, EMAIL));
});

describe('SECURITY: PATCH If-Match precondition', () => {
  it('succeeds when If-Match matches current updatedAt epoch ms', async () => {
    const cur = await authReq(`/api/notes/${noteId}`);
    const data = (await cur.json()) as { note: { updatedAt: string } };
    const ms = new Date(data.note.updatedAt).getTime();

    const r = await authReq(`/api/notes/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'If-Match': String(ms) },
      body: JSON.stringify({ content: 'updated 1' }),
    });
    expect(r.status).toBe(200);
  });

  it('rejects with 409 when If-Match is stale', async () => {
    const stale = '0'; // 任何早於當前的數字
    const r = await authReq(`/api/notes/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'If-Match': stale },
      body: JSON.stringify({ content: 'should not write' }),
    });
    expect(r.status).toBe(409);
  });

  it('succeeds without If-Match header (backward compat)', async () => {
    const r = await authReq(`/api/notes/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'updated 2' }),
    });
    expect(r.status).toBe(200);
  });
});

describe('SECURITY: ILIKE escape (M-8)', () => {
  // 還原 content — 前面的 PATCH tests 已改為 "updated 2"
  beforeAll(async () => {
    await authReq(`/api/notes/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'alpha bravo charlie' }),
    });
  });

  it('does not match arbitrary chars when query contains %', async () => {
    // 用 % 搜尋應該被當作字面字元，不會比對所有字
    const r = await authReq('/api/notes?q=%25');
    expect(r.status).toBe(200);
    const data = (await r.json()) as { notes: { id: string }[] };
    // 沒有 note 的 title/content 真的包含 '%'，所以應該找不到
    expect(data.notes.some((n) => n.id === noteId)).toBe(false);
  });

  it('does not match _ as wildcard', async () => {
    const r = await authReq('/api/notes?q=a_b');
    expect(r.status).toBe(200);
    const data = (await r.json()) as { notes: { id: string }[] };
    // 我們的 note content 是 "alpha bravo charlie"，沒有 "a_b" 形式
    expect(data.notes.some((n) => n.id === noteId)).toBe(false);
  });

  it('finds literal word "alpha"', async () => {
    const r = await authReq('/api/notes?q=alpha');
    const data = (await r.json()) as { notes: { id: string }[] };
    expect(data.notes.some((n) => n.id === noteId)).toBe(true);
  });
});

describe('SECURITY: /api/notes?include=tags batch fetch (M-7)', () => {
  it('returns tagsByNote in a single response', async () => {
    // 建立 tag 並 attach
    const tr = await authReq('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'sec-batch', color: 'red' }),
    });
    const tagId = ((await tr.json()) as { tag: { id: string } }).tag.id;
    await authReq(`/api/notes/${noteId}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds: [tagId] }),
    });

    const r = await authReq('/api/notes?include=tags');
    expect(r.status).toBe(200);
    const data = (await r.json()) as {
      notes: { id: string }[];
      tagsByNote: Record<string, { id: string; name: string; color: string }[]>;
    };
    expect(data.tagsByNote).toBeDefined();
    expect(data.tagsByNote[noteId]).toBeDefined();
    expect(data.tagsByNote[noteId]!.some((t) => t.id === tagId)).toBe(true);
  });
});

describe('SECURITY: soft-delete share is unreachable (C-2/H-1/H-2)', () => {
  it('cannot create share for soft-deleted note', async () => {
    // 建立 → 軟刪
    const c = await authReq('/api/notes', { method: 'POST' });
    const newNote = ((await c.json()) as { note: { id: string } }).note.id;
    await authReq(`/api/notes/${newNote}`, { method: 'DELETE' });

    const r = await authReq('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId: newNote }),
    });
    expect(r.status).toBe(404);

    // 清理
    await db.delete(notes).where(eq(notes.id, newNote));
  });
});

describe('SECURITY: password reset (placed last — revokes all sessions)', () => {
  it('reset revokes all existing sessions for the user', async () => {
    const userId = (
      await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL))
    )[0]!.id;
    // 確認有 session
    const beforeSessions = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, userId));
    expect(beforeSessions.length).toBeGreaterThan(0);

    // 直接 insert 已知 token 來測試 reset 邏輯
    const { token, tokenHash } = generateShareToken();
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    await db.insert(passwordResets).values({ userId, tokenHash, expiresAt });

    const r = await app.fetch(
      new Request('http://localhost/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ token, password: PWD }),
      }),
    );
    expect(r.status).toBe(200);

    // Assert: 該 user 的所有 sessions 都應被撤銷
    const afterSessions = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, userId));
    expect(afterSessions.length).toBe(0);
  });

  it('reset token cannot be reused (atomic conditional update)', async () => {
    // 先用 signin 拿新 cookie
    const sr = await app.fetch(
      new Request('http://localhost/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: EMAIL, password: PWD }),
      }),
    );
    expect(sr.status).toBe(200);
    const setCookie = sr.headers.get('set-cookie') ?? '';
    const m = setCookie.match(/ob_sid=([^;]+)/);
    cookie = m![1]!;

    const userId = (
      await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL))
    )[0]!.id;
    const { token, tokenHash } = generateShareToken();
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    await db.insert(passwordResets).values({ userId, tokenHash, expiresAt });

    const r1 = await authReq('/api/auth/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: PWD }),
    });
    expect(r1.status).toBe(200);

    // cookie 已被撤銷 → 用直接 fetch（不帶 cookie）來測重用 token
    const r2 = await app.fetch(
      new Request('http://localhost/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ token, password: PWD }),
      }),
    );
    expect(r2.status).toBe(401);
  });
});

// ensure token hash helper used (avoid unused import lint)
void hashToken;
