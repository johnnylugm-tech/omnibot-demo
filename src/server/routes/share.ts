import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, isNull, gt, isNotNull, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { notes, shareLinks } from '@/db/schema';
import { renderMarkdown } from '@/lib/markdown';
import { httpErrors } from '@/lib/errors';
import { generateShareToken, hashToken } from '@/lib/crypto';
import { requireAuth, type AppEnv } from '../middleware';

const router = new Hono<AppEnv>();
router.use('*', requireAuth);

// GET /api/share — 列出我所有 note 的 share links
router.get('/', async (c) => {
  const user = c.get('user')!;
  const rows = await db
    .select({
      id: shareLinks.id,
      noteId: shareLinks.noteId,
      createdAt: shareLinks.createdAt,
      expiresAt: shareLinks.expiresAt,
      revokedAt: shareLinks.revokedAt,
      noteTitle: notes.title,
    })
    .from(shareLinks)
    .innerJoin(notes, eq(shareLinks.noteId, notes.id))
    .where(eq(notes.userId, user.id))
    .orderBy(desc(shareLinks.createdAt));
  return c.json({ shares: rows });
});

const CreateBody = z.object({
  noteId: z.string().uuid(),
});

// POST /api/share — 創建 share link（含 7 天自動過期）
const SHARE_TTL_DAYS = 7;

router.post('/', async (c) => {
  const user = c.get('user')!;
  const body = CreateBody.parse(await c.req.json());
  // 確認 note 存在、屬於自己、未軟刪除
  const note = await db
    .select({ id: notes.id })
    .from(notes)
    .where(
      and(
        eq(notes.id, body.noteId),
        eq(notes.userId, user.id),
        isNull(notes.deletedAt),
      ),
    )
    .limit(1);
  if (!note[0]) throw httpErrors.notFound('Note not found');

  const { token, tokenHash } = generateShareToken();
  const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(shareLinks)
    .values({ noteId: body.noteId, tokenHash, expiresAt })
    .returning();
  if (!row) throw httpErrors.server('Failed');
  // URL 內的 token 是明文；DB 只存 hash（即便 DB 洩漏也無法構造有效 URL）
  return c.json({ share: { ...row, token } });
});

// DELETE /api/share/:id — 撤銷
router.delete('/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  // 確認這個 share 屬於自己的 note
  const rows = await db
    .select({ id: shareLinks.id, noteUserId: notes.userId })
    .from(shareLinks)
    .innerJoin(notes, eq(shareLinks.noteId, notes.id))
    .where(eq(shareLinks.id, id))
    .limit(1);
  if (!rows[0] || rows[0].noteUserId !== user.id)
    throw httpErrors.notFound('Share not found');
  await db
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(eq(shareLinks.id, id));
  return c.json({ ok: true });
});

export default router;
