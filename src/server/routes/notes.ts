import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, isNull, sql, or, ilike, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { notes, noteTags, tags } from '@/db/schema';
import { httpErrors } from '@/lib/errors';
import { requireAuth, type AppEnv } from '../middleware';

const router = new Hono<AppEnv>();
router.use('*', requireAuth);

// 統一取出 note 並驗 owner；不存在或非 owner 一律 404（不洩漏存在性）
async function loadOwnedNote(noteId: string, userId: string) {
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .limit(1);
  if (!rows[0]) throw httpErrors.notFound('Note not found');
  return rows[0];
}

// 列表：含分區置頂
// GET /api/notes?includeDeleted=0|1&q=...
router.get('/', async (c) => {
  const user = c.get('user')!;
  const includeDeleted = c.req.query('includeDeleted') === '1';
  const q = c.req.query('q')?.trim() ?? '';

  const baseWhere = includeDeleted
    ? eq(notes.userId, user.id)
    : and(eq(notes.userId, user.id), isNull(notes.deletedAt));

  let where = baseWhere;
  if (q) {
    // pg_trgm: 用 ILIKE + similarity；§8.2 T-7
    const term = `%${q.replace(/[%_]/g, (m) => '\\' + m)}%`;
    where = and(
      baseWhere,
      or(ilike(notes.title, term), ilike(notes.content, term))!,
    )!;
  }

  const rows = await db
    .select()
    .from(notes)
    .where(where)
    .orderBy(desc(notes.isPinned), desc(notes.updatedAt))
    .limit(200);

  return c.json({ notes: rows });
});

// POST /api/notes — 創建並回傳（含 id 以便前端跳轉）
router.post('/', async (c) => {
  const user = c.get('user')!;
  const [row] = await db
    .insert(notes)
    .values({ userId: user.id })
    .returning();
  if (!row) throw httpErrors.server('Failed to create note');
  return c.json({ note: row });
});

// GET /api/notes/:id
router.get('/:id', async (c) => {
  const user = c.get('user')!;
  const note = await loadOwnedNote(c.req.param('id'), user.id);
  const t = await db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(noteTags)
    .innerJoin(tags, eq(noteTags.tagId, tags.id))
    .where(eq(noteTags.noteId, note.id));
  return c.json({ note, tags: t });
});

const PatchBody = z.object({
  title: z.string().max(500).optional(),
  content: z.string().max(200_000).optional(),
  isPinned: z.boolean().optional(),
});

// PATCH /api/notes/:id — 自動保存 / 編輯
router.patch('/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  await loadOwnedNote(id, user.id); // 404 if not owner
  const body = PatchBody.parse(await c.req.json().catch(() => ({})));
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.content !== undefined) updates.content = body.content;
  if (body.isPinned !== undefined) updates.isPinned = body.isPinned;
  const [row] = await db
    .update(notes)
    .set(updates)
    .where(and(eq(notes.id, id), eq(notes.userId, user.id)))
    .returning();
  return c.json({ note: row });
});

// DELETE /api/notes/:id — 軟刪除
router.delete('/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  await loadOwnedNote(id, user.id);
  await db
    .update(notes)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, user.id)));
  return c.json({ ok: true });
});

// POST /api/notes/:id/restore
router.post('/:id/restore', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  await loadOwnedNote(id, user.id);
  await db
    .update(notes)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(notes.id, id), eq(notes.userId, user.id)));
  return c.json({ ok: true });
});

// DELETE /api/notes/:id/hard — 永久刪除（從回收站）
router.delete('/:id/hard', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  await loadOwnedNote(id, user.id);
  await db
    .delete(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, user.id)));
  return c.json({ ok: true });
});

// POST /api/notes/empty-trash
router.post('/empty-trash', async (c) => {
  const user = c.get('user')!;
  await db
    .delete(notes)
    .where(and(eq(notes.userId, user.id), sql`${notes.deletedAt} IS NOT NULL`));
  return c.json({ ok: true });
});

// 標籤套用/解除
// PUT /api/notes/:id/tags  body: { tagIds: string[] }
router.put('/:id/tags', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  await loadOwnedNote(id, user.id);
  const body = z
    .object({ tagIds: z.array(z.string().uuid()).max(50) })
    .parse(await c.req.json().catch(() => ({})));
  // 確認所有 tagIds 都屬於該 user
  if (body.tagIds.length) {
    const owned = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.userId, user.id), inArray(tags.id, body.tagIds)));
    if (owned.length !== new Set(body.tagIds).size)
      throw httpErrors.badRequest('Unknown tag');
  }
  await db.transaction(async (tx) => {
    await tx.delete(noteTags).where(eq(noteTags.noteId, id));
    if (body.tagIds.length) {
      await tx
        .insert(noteTags)
        .values(body.tagIds.map((tagId) => ({ noteId: id, tagId })));
    }
    await tx.update(notes).set({ updatedAt: new Date() }).where(eq(notes.id, id));
  });
  return c.json({ ok: true });
});

export default router;
