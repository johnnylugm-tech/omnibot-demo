'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function ResetPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? 'Reset failed');
      }
      router.push('/signin');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <p className="text-ink-600">缺少重設 token。</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-center text-base font-semibold tracking-tight mb-10">
          Notes
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">設定新密碼</h1>
        <form onSubmit={submit} className="mt-8 space-y-3">
          <input
            className="input"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="新密碼（至少 8 字元）"
          />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? '更新中…' : '更新密碼'}
          </button>
        </form>
      </div>
    </main>
  );
}
