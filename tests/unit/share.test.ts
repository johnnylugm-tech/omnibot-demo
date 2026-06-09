import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/db/client';
import { users, notes, shareLinks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth';
import { generateShareToken } from '@/lib/crypto';
import app from '@/server/api';

const EMAIL = `share-${Date.now()}@example.com`;
let cookie: string;
let noteId: string;
let shareToken: string;

beforeAll(async () => {
  // signup
  const r = await app.fetch(
    new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ email: EMAIL, password: 'password123' }),
    }),
  );
  const setCookie = r.headers.get('set-cookie') ?? '';
  cookie = setCookie.match(/ob_sid=([^;]+)/)![1]!;

  // create note with content
  const nr = await app.fetch(
    new Request('http://localhost/api/notes', {
      method: 'POST',
      headers: { cookie: `ob_sid=${cookie}`, Origin: 'http://localhost:3000' },
    }),
  );
  noteId = ((await nr.json()) as { note: { id: string } }).note.id;
  await app.fetch(
    new Request(`http://localhost/api/notes/${noteId}`, {
      method: 'PATCH',
      headers: {
        cookie: `ob_sid=${cookie}`,
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ title: 'Public', content: '# Hello\n\nMarkdown content' }),
    }),
  );
  // create share
  const sr = await app.fetch(
    new Request('http://localhost/api/share', {
      method: 'POST',
      headers: {
        cookie: `ob_sid=${cookie}`,
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ noteId }),
    }),
  );
  shareToken = ((await sr.json()) as { share: { token: string } }).share.token;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.email, EMAIL));
});

describe('Public share endpoint (no auth)', () => {
  it('serves shared note content', async () => {
    const r = await app.fetch(new Request(`http://localhost/api/public/s/${shareToken}`));
    expect(r.status).toBe(200);
    const data = (await r.json()) as { note: { title: string; html: string } };
    expect(data.note.title).toBe('Public');
    expect(data.note.html).toContain('<h1>Hello</h1>');
  });

  it('does not leak owner email', async () => {
    const r = await app.fetch(new Request(`http://localhost/api/public/s/${shareToken}`));
    const data = (await r.json()) as Record<string, unknown>;
    expect(JSON.stringify(data)).not.toContain(EMAIL);
  });

  it('unknown token → 404', async () => {
    const r = await app.fetch(
      new Request('http://localhost/api/public/s/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
    );
    expect(r.status).toBe(404);
  });

  it('revoke → 410', async () => {
    // get share id
    const list = await app.fetch(
      new Request('http://localhost/api/share', {
        headers: { cookie: `ob_sid=${cookie}`, Origin: 'http://localhost:3000' },
      }),
    );
    const data = (await list.json()) as { shares: { id: string }[] };
    const shareId = data.shares[0]?.id;
    expect(shareId).toBeTruthy();
    // revoke
    const rev = await app.fetch(
      new Request(`http://localhost/api/share/${shareId}`, {
        method: 'DELETE',
        headers: { cookie: `ob_sid=${cookie}`, Origin: 'http://localhost:3000' },
      }),
    );
    expect(rev.status).toBe(200);
    // 公開端點 410
    const r2 = await app.fetch(new Request(`http://localhost/api/public/s/${shareToken}`));
    expect(r2.status).toBe(410);
  });
});
