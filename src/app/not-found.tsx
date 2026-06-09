import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-500">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">找不到這一頁</h1>
        <p className="mt-2 text-ink-500">連結可能已失效，或你沒有權限存取。</p>
        <Link href="/" className="btn-outline mt-8 inline-flex">
          回首頁
        </Link>
      </div>
    </main>
  );
}
