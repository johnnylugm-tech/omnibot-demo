import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { notes, shareLinks } from '@/db/schema';
import { renderMarkdown } from '@/lib/markdown';

export const dynamic = 'force-dynamic';

export default async function SharedNotePage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();

  const { createHash } = await import('node:crypto');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const now = new Date();

  const rows = await db
    .select({
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
  if (!row) notFound();
  if (row.revokedAt) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-500">410</p>
          <h1 className="mt-3 text-2xl font-semibold">此分享已撤銷</h1>
        </div>
      </main>
    );
  }
  if (row.expiresAt && row.expiresAt < now) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-500">410</p>
          <h1 className="mt-3 text-2xl font-semibold">此分享已過期</h1>
        </div>
      </main>
    );
  }

  const html = renderMarkdown(row.content);

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-ink-200">
        <div className="mx-auto max-w-3xl px-6 py-5 flex items-center justify-between">
          <span className="text-xs uppercase tracking-[0.2em] text-ink-500">Shared note</span>
          <a href="/" className="text-xs text-ink-500 hover:text-ink-700">
            Notes
          </a>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          {row.title || '（無標題）'}
        </h1>
        <p className="mt-2 text-xs text-ink-500">
          最後更新 {new Date(row.updatedAt).toLocaleString('zh-TW')}
        </p>
        <div
          className="md mt-8"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
    </main>
  );
}
