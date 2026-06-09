import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tags, noteTags, TAG_COLORS } from '@/db/schema';
import { httpErrors } from '@/lib/errors';
import { requireAuth, type AppEnv } from '../middleware';

const router = new Hono<AppEnv>();
router.use('*', requireAuth);

// GET /api/tags
router.get('/', async (c) => {
  const user = c.get('user')!;
  const rows = await db
    .select()
    .from(tags)
    .where(eq(tags.userId, user.id))
    .orderBy(desc(tags.createdAt));
  return c.json({ tags: rows });
});

const CreateBody = z.object({
  name: z.string().min(1).max(40),
  color: z.enum(TAG_COLORS).default('gray'),
});

router.post('/', async (c) => {
  const user = c.get('user')!;
  const body = CreateBody.parse(await c.req.json().catch(() => ({})));
  try {
    const [row] = await db
      .insert(tags)
      .values({ userId: user.id, name: body.name, color: body.color })
      .returning();
    if (!row) throw httpErrors.server('Failed');
    return c.json({ tag: row });
  } catch (e) {
    if (
      e &&
      typeof e === 'object' &&
      'code' in e &&
      (e as { code: string }).code === '23505'
    ) {
      throw httpErrors.conflict('Tag name already exists', 'tag_taken');
    }
    throw e;
  }
});

const PatchBody = z.object({
  name: z.string().min(1).max(40).optional(),
  color: z.enum(TAG_COLORS).optional(),
});

router.patch('/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const body = PatchBody.parse(await c.req.json().catch(() => ({})));
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.color !== undefined) updates.color = body.color;
  if (!Object.keys(updates).length) return c.json({ ok: true });
  const [row] = await db
    .update(tags)
    .set(updates)
    .where(and(eq(tags.id, id), eq(tags.userId, user.id)))
    .returning();
  if (!row) throw httpErrors.notFound('Tag not found');
  return c.json({ tag: row });
});

router.delete('/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const [row] = await db
    .delete(tags)
    .where(and(eq(tags.id, id), eq(tags.userId, user.id)))
    .returning({ id: tags.id });
  if (!row) throw httpErrors.notFound('Tag not found');
  return c.json({ ok: true });
});

export default router;
