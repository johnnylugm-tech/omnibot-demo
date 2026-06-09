'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/clientApi';
import { TAG_COLOR_HEX, type Note, type Tag } from '@/lib/types';
import { TagDot } from '@/components/AppShell';

export default function DashboardPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ notes: Note[]; tags?: Tag[] }>('/api/notes');
      setNotes(r.notes);
      const tr = await api<{ tags: Tag[] }>('/api/tags');
      setTags(tr.tags);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 載入每則 note 的 tags
  const [noteTags, setNoteTags] = useState<Record<string, Tag[]>>({});
  useEffect(() => {
    if (!notes.length) return;
    let cancelled = false;
    (async () => {
      const out: Record<string, Tag[]> = {};
      await Promise.all(
        notes.map(async (n) => {
          const r = await api<{ tags: Tag[] }>(`/api/notes/${n.id}`);
          out[n.id] = r.tags;
        }),
      );
      if (!cancelled) setNoteTags(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [notes]);

  const filtered = useMemo(() => {
    if (!activeTag) return notes;
    return notes.filter((n) => (noteTags[n.id] ?? []).some((t) => t.id === activeTag));
  }, [notes, noteTags, activeTag]);

  const pinned = filtered.filter((n) => n.isPinned);
  const others = filtered.filter((n) => !n.isPinned);

  async function togglePin(n: Note) {
    const r = await api<{ note: Note }>(`/api/notes/${n.id}`, {
      method: 'PATCH',
      json: { isPinned: !n.isPinned },
    });
    setNotes((ns) => ns.map((x) => (x.id === n.id ? r.note : x)));
  }

  async function del(n: Note) {
    if (!confirm(`確定刪除「${n.title || '（無標題）'}」？`)) return;
    await api(`/api/notes/${n.id}`, { method: 'DELETE' });
    setNotes((ns) => ns.filter((x) => x.id !== n.id));
  }

  async function newNote() {
    const r = await api<{ note: { id: string } }>('/api/notes', { method: 'POST' });
    router.push(`/app/notes/${r.note.id}`);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">筆記</h1>
        <button onClick={newNote} className="btn-primary">
          + 新增筆記
        </button>
      </div>

      {tags.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTag(null)}
            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
              activeTag === null
                ? 'bg-ink-900 text-white border-ink-900'
                : 'bg-white text-ink-700 border-ink-200 hover:border-ink-300'
            }`}
          >
            全部
          </button>
          {tags.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTag(activeTag === t.id ? null : t.id)}
              className={`px-2.5 py-1 rounded-full text-xs border inline-flex items-center gap-1.5 transition-colors ${
                activeTag === t.id
                  ? 'bg-ink-900 text-white border-ink-900'
                  : 'bg-white text-ink-700 border-ink-200 hover:border-ink-300'
              }`}
            >
              <TagDot color={t.color} />
              {t.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-ink-400 text-sm">載入中…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-ink-500">尚無筆記</p>
          <button onClick={newNote} className="btn-primary mt-4">
            寫下第一則
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {pinned.length > 0 && (
            <section>
              <h2 className="text-xs uppercase tracking-[0.2em] text-ink-500 mb-2">📌 置頂</h2>
              <ul className="card divide-y divide-ink-200">
                {pinned.map((n) => (
                  <NoteRow
                    key={n.id}
                    n={n}
                    tags={noteTags[n.id] ?? []}
                    onPin={() => togglePin(n)}
                    onDelete={() => del(n)}
                  />
                ))}
              </ul>
            </section>
          )}

          {others.length > 0 && (
            <section>
              {pinned.length > 0 && (
                <h2 className="text-xs uppercase tracking-[0.2em] text-ink-500 mb-2">其他</h2>
              )}
              <ul className="card divide-y divide-ink-200">
                {others.map((n) => (
                  <NoteRow
                    key={n.id}
                    n={n}
                    tags={noteTags[n.id] ?? []}
                    onPin={() => togglePin(n)}
                    onDelete={() => del(n)}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function NoteRow({
  n,
  tags,
  onPin,
  onDelete,
}: {
  n: Note;
  tags: Tag[];
  onPin: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="group flex items-center gap-2 px-4 py-3 hover:bg-ink-50 transition-colors">
      <Link href={`/app/notes/${n.id}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-ink-900 truncate">
            {n.title || '（無標題）'}
          </h3>
          {tags.slice(0, 3).map((t) => (
            <span key={t.id} className="text-[10px] text-ink-500 inline-flex items-center gap-1">
              <TagDot color={t.color} />
              {t.name}
            </span>
          ))}
        </div>
        <p className="text-xs text-ink-500 mt-0.5 truncate">
          {n.content.replace(/\s+/g, ' ').slice(0, 120) || '空白筆記'}
        </p>
        <p className="text-[10px] text-ink-400 mt-1">
          {new Date(n.updatedAt).toLocaleString('zh-TW')}
        </p>
      </Link>
      <button
        onClick={onPin}
        className={`opacity-0 group-hover:opacity-100 text-xs px-2 py-1 rounded transition-all ${
          n.isPinned ? 'opacity-100 text-amber-600' : 'text-ink-500 hover:text-ink-700'
        }`}
        title={n.isPinned ? '取消置頂' : '置頂'}
      >
        {n.isPinned ? '📌' : '📍'}
      </button>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1 rounded text-ink-500 hover:text-red-600 transition-all"
        title="刪除"
      >
        ✕
      </button>
    </li>
  );
}
