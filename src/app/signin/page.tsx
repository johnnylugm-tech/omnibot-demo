'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function SignInPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') ?? '/app';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? `Signin failed (${r.status})`);
      }
      router.push(next);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-center text-base font-semibold tracking-tight mb-10">
          Notes
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">登入</h1>
        <p className="mt-1 text-sm text-ink-500">歡迎回來。</p>

        <form onSubmit={submit} className="mt-8 space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">Email</label>
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">密碼</label>
            <input
              className="input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? '登入中…' : '登入'}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm">
          <Link href="/forgot" className="link">
            忘記密碼？
          </Link>
          <Link href={`/signup?next=${encodeURIComponent(next)}`} className="link">
            建立新帳號
          </Link>
        </div>
      </div>
    </main>
  );
}
