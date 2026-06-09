import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 lg:px-10 h-14 flex items-center justify-between border-b border-ink-200/70">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Notes
        </Link>
        <nav className="flex items-center gap-1">
          <Link href="/signin" className="btn-ghost">
            登入
          </Link>
          <Link href="/signup" className="btn-primary">
            免費開始
          </Link>
        </nav>
      </header>

      <section className="flex-1 flex items-center">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-500">簡約筆記</p>
          <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-ink-900">
            把思緒，<br className="sm:hidden" />
            寫得輕一點。
          </h1>
          <p className="mt-5 text-ink-600 text-lg">
            為個人與小團隊設計的極速筆記。
            <br className="hidden sm:inline" />
            沒有雜訊、沒有學習成本，只有純粹的書寫。
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/signup" className="btn-primary px-5 py-2.5">
              開始書寫
            </Link>
            <Link href="/signin" className="btn-outline px-5 py-2.5">
              已有帳號
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-ink-200/70 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16 grid sm:grid-cols-3 gap-8">
          {[
            { t: '極速 Markdown', d: '所見即所得編輯，鍵盤優先的快捷鍵。' },
            { t: '輕量整理', d: '標籤、置頂、全域搜尋；無需資料夾階層。' },
            { t: '可分享', d: '一鍵產生唯讀連結，未登入也能開。' },
          ].map((f) => (
            <div key={f.t}>
              <h3 className="text-sm font-semibold text-ink-900">{f.t}</h3>
              <p className="mt-2 text-sm text-ink-600 leading-relaxed">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-ink-200/70">
        <div className="mx-auto max-w-5xl px-6 py-6 text-xs text-ink-500 flex items-center justify-between">
          <span>© Notes</span>
          <Link href="/signin" className="link">
            登入
          </Link>
        </div>
      </footer>
    </main>
  );
}
