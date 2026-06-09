'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function SignUpPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') ?? '/app';
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? `Signup failed (${r.status})`);
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
        <h1 className="text-2xl font-semibold tracking-tight">建立帳號</h1>
        <p className="mt-1 text-sm text-ink-500">免費、無信用卡。</p>

        <form onSubmit={submit} className="mt-8 space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1.5">姓名（選填）</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoComplete="name"
            />
          </div>
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
            <label className="block text-xs font-medium text-ink-600 mb-1.5">
              密碼（至少 8 字元）
            </label>
            <input
              className="input"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? '建立中…' : '建立帳號'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-500">
          已有帳號？{' '}
          <Link href={`/signin?next=${encodeURIComponent(next)}`} className="link">
            登入
          </Link>
        </p>
      </div>
    </main>
  );
}
