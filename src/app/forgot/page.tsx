'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setSent(true);
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
        <h1 className="text-2xl font-semibold tracking-tight">重設密碼</h1>
        <p className="mt-1 text-sm text-ink-500">
          若帳號存在，我們會寄送重設連結（demo 環境會在伺服器 console 印出 magic link）。
        </p>

        {sent ? (
          <div className="mt-8 card p-5 text-sm text-ink-700">
            如果此 Email 已註冊，重設連結已寄出。請至伺服器 console 取得。
            <div className="mt-4">
              <Link href="/signin" className="link">
                返回登入
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-3">
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1.5">Email</label>
              <input
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? '寄送中…' : '寄送重設連結'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-ink-500">
          <Link href="/signin" className="link">
            返回登入
          </Link>
        </p>
      </div>
    </main>
  );
}
