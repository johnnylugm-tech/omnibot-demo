'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/clientApi';
import type { Note } from '@/lib/types';

export default function SearchPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const initialQ = sp.get('q') ?? '';
  const [q, setQ] = useState(initialQ);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQ(initialQ);
    if (!initialQ) {
      setNotes([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api<{ notes: Note[] }>(
          `/api/notes?q=${encodeURIComponent(initialQ)}`,
        );
        setNotes(r.notes);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [initialQ]);

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight mb-4">搜尋</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/app/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="輸入關鍵字…"
          className="input"
        />
      </form>

      <div className="mt-6">
        {loading ? (
          <p className="text-ink-400 text-sm">搜尋中…</p>
        ) : !initialQ ? (
          <p className="text-ink-400 text-sm">輸入標題或內容關鍵字開始搜尋。</p>
        ) : notes.length === 0 ? (
          <p className="text-ink-400 text-sm">沒有符合「{initialQ}」的筆記。</p>
        ) : (
          <ul className="card divide-y divide-ink-200">
            {notes.map((n) => (
              <li key={n.id}>
                <Link href={`/app/notes/${n.id}`} className="block px-4 py-3 hover:bg-ink-50">
                  <p className="font-medium text-ink-900">
                    {highlight(n.title || '（無標題）', initialQ)}
                  </p>
                  <p className="text-sm text-ink-600 mt-1 line-clamp-2">
                    {highlight(snippet(n.content, initialQ), initialQ)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function snippet(content: string, q: string): string {
  if (!q) return content.slice(0, 200);
  const idx = content.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return content.slice(0, 200);
  const start = Math.max(0, idx - 60);
  const end = Math.min(content.length, idx + q.length + 80);
  return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
}

function highlight(text: string, q: string) {
  if (!q) return text;
  // 用 non-global regex + matchAll 避免 stateful lastIndex bug
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i');
  const lcQ = q.toLowerCase();
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'))) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(<span key={last}>{text.slice(last, idx)}</span>);
    out.push(
      <mark key={idx} className="bg-yellow-100 text-ink-900 rounded px-0.5">
        {m[0]}
      </mark>,
    );
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(<span key={last}>{text.slice(last)}</span>);
  void re; // 保留變數供日後調整
  void lcQ;
  return out;
}
