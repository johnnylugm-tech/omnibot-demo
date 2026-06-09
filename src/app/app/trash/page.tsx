'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/clientApi';
import type { Note } from '@/lib/types';

export default function TrashPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await api<{ notes: Note[] }>('/api/notes?includeDeleted=1');
      setNotes(r.notes.filter((n) => n.deletedAt));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function restore(n: Note) {
    await api(`/api/notes/${n.id}/restore`, { method: 'POST' });
    void load();
  }
  async function hardDel(n: Note) {
    if (!confirm('永久刪除此筆記？此操作無法復原。')) return;
    await api(`/api/notes/${n.id}/hard`, { method: 'DELETE' });
    void load();
  }
  async function empty() {
    if (!confirm('永久清空回收站？此操作無法復原。')) return;
    await api('/api/notes/empty-trash', { method: 'POST' });
    void load();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">回收站</h1>
        {notes.length > 0 && (
          <button onClick={empty} className="btn-danger">
            一鍵清空
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-ink-400 text-sm">載入中…</p>
      ) : notes.length === 0 ? (
        <div className="card p-10 text-center text-ink-500 text-sm">回收站是空的</div>
      ) : (
        <ul className="card divide-y divide-ink-200">
          {notes.map((n) => (
            <li key={n.id} className="px-4 py-3 flex items-center gap-3">
              <Link href={`/app/notes/${n.id}`} className="flex-1 min-w-0">
                <p className="font-medium truncate">{n.title || '（無標題）'}</p>
                <p className="text-xs text-ink-500 mt-0.5">
                  刪除於 {n.deletedAt && new Date(n.deletedAt).toLocaleString('zh-TW')}
                </p>
              </Link>
              <button onClick={() => restore(n)} className="btn-outline h-8 text-xs">
                恢復
              </button>
              <button onClick={() => hardDel(n)} className="btn-danger h-8 text-xs">
                永久刪除
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs text-ink-500">
        軟刪除的筆記保留 30 天後將自動永久刪除。
      </p>
    </div>
  );
}
