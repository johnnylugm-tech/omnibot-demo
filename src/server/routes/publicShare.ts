// 公開分享（未登入可訪問）— FR-15 / 隱私：只暴露 note 內容，不暴露 owner email
import { Hono } from 'hono';
import { and, eq, isNull, isNotNull, gt, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { notes, shareLinks } from '@/db/schema';
import { renderMarkdown } from '@/lib/markdown';
import { httpErrors } from '@/lib/errors';
import { hashToken } from '@/lib/crypto';
import type { AppEnv } from '../middleware';

const router = new Hono<AppEnv>();

// GET /api/public/s/:token — 公開唯讀取得 note
// 撤銷後 410；token 不存在 404；過期 410；未撤銷且未過期回 200
router.get('/s/:token', async (c) => {
  const token = c.req.param('token');
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw httpErrors.notFound('Not found');

  const tokenHash = hashToken(token);
  const now = new Date();

  const rows = await db
    .select({
      noteId: notes.id,
      title: notes.title,
      content: notes.content,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
      revokedAt: shareLinks.revokedAt,
      expiresAt: shareLinks.expiresAt,
    })
    .from(shareLinks)
    .innerJoin(notes, eq(shareLinks.noteId, notes.id))
    .where(eq(shareLinks.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) throw httpErrors.notFound('Not found');
  if (row.revokedAt) throw httpErrors.gone('Share revoked');
  if (row.expiresAt && row.expiresAt < now) throw httpErrors.gone('Share expired');

  const html = renderMarkdown(row.content);
  return c.json({
    note: {
      title: row.title,
      html,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
  });
});

export default router;
