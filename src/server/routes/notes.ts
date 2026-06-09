import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, isNull, sql, or, ilike, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { notes, noteTags, tags } from '@/db/schema';
import { httpErrors } from '@/lib/errors';
import { requireAuth, type AppEnv } from '../middleware';

const router = new Hono<AppEnv>();
router.use('*', requireAuth);

// 統一取出 note 並驗 owner；不存在、非 owner 或已軟刪除一律 404（不洩漏存在性）
async function loadOwnedNote(noteId: string, userId: string) {
  const rows = await db
    .select()
    .from(notes)
    .where(
      and(eq(notes.id, noteId), eq(notes.userId, userId), isNull(notes.deletedAt)),
    )
    .limit(1);
  if (!rows[0]) throw httpErrors.notFound('Note not found');
  return rows[0];
}

// 同上但**包含**已軟刪除 — 給 restore / 歷史查詢使用
async function loadOwnedNoteIncludeDeleted(noteId: string, userId: string) {
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .limit(1);
  if (!rows[0]) throw httpErrors.notFound('Note not found');
  return rows[0];
}

// 列表：含分區置頂
// GET /api/notes?includeDeleted=0|1&include=tags&q=...
router.get('/', async (c) => {
  const user = c.get('user')!;
  const includeDeleted = c.req.query('includeDeleted') === '1';
  const includeTags = c.req.query('include') === 'tags';
  const q = c.req.query('q')?.trim() ?? '';

  const baseWhere = includeDeleted
    ? eq(notes.userId, user.id)
    : and(eq(notes.userId, user.id), isNull(notes.deletedAt));

  let where = baseWhere;
  if (q) {
    // pg_trgm: 用 ILIKE + similarity；§8.2 T-7
    // 用 raw sql 加 ESCAPE 子句，pg 才會把 backslash 視為 escape char
    const term = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
    where = sql`${baseWhere} AND (${notes.title} ILIKE ${term} ESCAPE '\\' OR ${notes.content} ILIKE ${term} ESCAPE '\\')`;
  }

  const rows = await db
    .select()
    .from(notes)
    .where(where)
    .orderBy(desc(notes.isPinned), desc(notes.updatedAt))
    .limit(200);

  // 一次批次撈 tags（M-7：避免 N+1）
  let noteTagsMap: Record<string, { id: string; name: string; color: string }[]> = {};
  if (includeTags && rows.length) {
    const tagRows = await db
      .select({
        noteId: noteTags.noteId,
        id: tags.id,
        name: tags.name,
        color: tags.color,
      })
      .from(noteTags)
      .innerJoin(tags, eq(noteTags.tagId, tags.id))
      .where(inArray(noteTags.noteId, rows.map((r) => r.id)));
    for (const tr of tagRows) {
      (noteTagsMap[tr.noteId] ??= []).push({ id: tr.id, name: tr.name, color: tr.color });
    }
  }

  return c.json({
    notes: rows,
    ...(includeTags ? { tagsByNote: noteTagsMap } : {}),
  });
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
// 支援 If-Match: <updatedAt epoch ms> precondition，預防 concurrent write 覆蓋
// 用 epoch ms 而非 ISO 字串：避免 PG timestamp 來回序列化丟失精度
router.patch('/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const cur = await loadOwnedNote(id, user.id);
  const body = PatchBody.parse(await c.req.json());
  const ifMatch = c.req.header('if-match');
  if (ifMatch !== undefined) {
    const expectedMs = Number.parseInt(ifMatch, 10);
    const actualMs = cur.updatedAt.getTime();
    if (!Number.isFinite(expectedMs) || expectedMs !== actualMs) {
      throw httpErrors.conflict('Note was modified by another request', 'etag_mismatch');
    }
  }
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
  await loadOwnedNoteIncludeDeleted(id, user.id);
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
    .parse(await c.req.json());
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
