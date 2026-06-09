'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/clientApi';
import { TAG_COLOR_HEX, type TagColor } from '@/lib/types';

interface User {
  id: string;
  email: string;
  name: string | null;
}

export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  // 快捷鍵：⌘K 搜尋、⌘N 新增
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const el = document.getElementById('app-search') as HTMLInputElement | null;
        el?.focus();
      } else if (meta && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        void newNote();
      } else if (meta && e.key.toLowerCase() === 's') {
        // ⌘S 由 editor 自己攔
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newNote = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const r = await api<{ note: { id: string } }>('/api/notes', { method: 'POST' });
      router.push(`/app/notes/${r.note.id}`);
    } finally {
      setCreating(false);
    }
  }, [creating, router]);

  async function signOut() {
    await api('/api/auth/signout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  const navItems = [
    { href: '/app', label: '筆記', match: (p: string) => p === '/app' || p.startsWith('/app/notes/') },
    { href: '/app/trash', label: '回收站', match: (p: string) => p.startsWith('/app/trash') },
    { href: '/app/settings', label: '設定', match: (p: string) => p.startsWith('/app/settings') },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-ink-200 bg-white sticky top-0 z-10">
        <div className="h-full px-4 sm:px-6 flex items-center gap-3">
          <Link href="/app" className="text-base font-semibold tracking-tight">
            Notes
          </Link>
          <nav className="hidden sm:flex items-center gap-1 ml-4">
            {navItems.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  it.match(pathname) ? 'text-ink-900 bg-ink-100' : 'text-ink-500 hover:text-ink-700'
                }`}
              >
                {it.label}
              </Link>
            ))}
          </nav>

          <form
            className="flex-1 max-w-md ml-2 sm:ml-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) router.push(`/app/search?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <div className="relative">
              <input
                id="app-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜尋（標題 / 內容）"
                className="input pl-8 h-9"
                type="search"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 text-xs">
                ⌘K
              </span>
            </div>
          </form>

          <button onClick={newNote} disabled={creating} className="btn-primary h-9">
            {creating ? '建立中…' : '+ 新增'}
          </button>

          <div className="hidden sm:flex items-center gap-2 ml-1">
            <span className="text-xs text-ink-500">{user.name || user.email}</span>
            <button onClick={signOut} className="btn-ghost h-9 text-xs">
              登出
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}

export function TagDot({ color }: { color: TagColor }) {
  return (
    <span
      className="tag-dot"
      style={{ backgroundColor: TAG_COLOR_HEX[color] }}
      aria-hidden
    />
  );
}
