'use client';
import Link from 'next/link';
import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app error]', error);
  }, [error]);
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-500">500</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">系統暫時無法回應</h1>
        <p className="mt-2 text-ink-500">請稍候再試，或回到首頁。</p>
        <div className="mt-8 flex items-center justify-center gap-2">
          <button onClick={reset} className="btn-primary">
            重試
          </button>
          <Link href="/" className="btn-outline">
            回首頁
          </Link>
        </div>
      </div>
    </main>
  );
}
