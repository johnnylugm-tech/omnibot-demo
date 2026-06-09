# Omnibot — 簡約筆記 SaaS

Markdown 筆記應用，支援標籤、搜尋、公開分享與軟刪除。Next.js 14 + Hono + Postgres + CodeMirror 6。

## 快速開始

```bash
# 1. 啟動資料庫
docker compose up -d

# 2. 複製環境變數
cp .env.example .env

# 3. 安裝依賴
pnpm install

# 4. 執行 migration
pnpm db:migrate

# 5. 啟動開發伺服器
pnpm dev
```

開啟 http://localhost:3000。

## 可用指令

| 指令 | 說明 |
|------|------|
| `pnpm dev` | 啟動 Next.js dev server |
| `pnpm build` | Production build |
| `pnpm start` | 啟動 production server |
| `pnpm db:migrate` | 執行 Drizzle migration |
| `pnpm db:generate` | 生成 migration 檔案 |
| `pnpm db:studio` | 開啟 Drizzle Studio |
| `pnpm db:seed` | 載入 demo 資料 (`demo@example.com` / `demo1234`) |
| `pnpm test:unit` | 執行 Vitest 單元/整合測試 |
| `pnpm test:e2e` | 執行 Playwright E2E 測試 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript 型別檢查 |

## 技術棧

| 層 | 技術 |
|----|------|
| 框架 | Next.js 14.2 (App Router) |
| API | Hono 4.x (內嵌於 Next.js catch-all route) |
| 資料庫 | Postgres 16 (Docker) |
| ORM | Drizzle ORM + postgres-js |
| 編輯器 | CodeMirror 6 (Markdown 模式) |
| 樣式 | Tailwind CSS 3.4 |
| 測試 | Vitest (單元/整合) + Playwright (E2E) |
| 認證 | bcryptjs (cost=12) + DB-backed session (sha256) |

## 專案結構

```
src/
├── app/                  # Next.js App Router 頁面
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Landing page
│   ├── signup/           # 註冊
│   ├── signin/           # 登入
│   ├── forgot/           # 忘記密碼
│   ├── reset/            # 重設密碼
│   ├── s/[token]/        # 公開分享頁 (SSR)
│   ├── app/              # 登入後頁面
│   │   ├── layout.tsx    # Auth-guarded layout
│   │   ├── page.tsx      # Dashboard
│   │   ├── notes/[id]/   # 編輯器
│   │   ├── trash/        # 回收站
│   │   ├── search/       # 搜尋結果
│   │   └── settings/     # 設定 (標籤管理)
│   └── api/[...path]/    # Hono API catch-all
├── components/           # React client components
├── db/                   # Drizzle schema + client
├── lib/                  # 共用工具 (auth, markdown, errors, crypto)
├── server/               # Hono 伺服器
│   ├── api.ts            # App 組合 + 錯誤處理
│   ├── middleware.ts      # authContext, requireAuth, sameOrigin
│   ├── session.ts        # SSR session helper
│   └── routes/           # API routes
│       ├── auth.ts       # /api/auth/*
│       ├── notes.ts      # /api/notes/*
│       ├── tags.ts       # /api/tags/*
│       ├── share.ts      # /api/share/*
│       └── publicShare.ts # /api/public/s/:token
├── drizzle/              # Drizzle migrations
├── tests/                # 測試
│   ├── unit/             # Vitest (Hono app.fetch)
│   └── e2e/              # Playwright (headless Chromium)
└── scripts/              # seed.ts
```

## 環境變數

| 變數 | 說明 |
|------|------|
| `DATABASE_URL` | Postgres 連線字串 |
| `SESSION_SECRET` | Session 簽章金鑰 (32+ chars) |
| `APP_ORIGIN` | 應用 URL (CSRF same-origin 檢查) |
| `NODE_ENV` | `development` 或 `production` |

## 安全

- 密碼：bcrypt cost=12
- Session：32 bytes random token，DB 存 sha256 hash，HttpOnly + SameSite=Lax cookie
- CSRF：SameSite=Lax + same-origin header check (非 GET 請求)
- XSS：markdown-it (html:false) + sanitize-html 雙層防護
- 授權：每 request 驗證 note ownership（不洩漏存在性：非 owner 一律 404）
- 軟刪除：`deleted_at` timestamp，永久刪除需手動清空回收站
- Share links：URL 含明碼 token；DB 只存 sha256 hash（DB 洩漏無法重建有效連結）

## 功能清單

- [x] FR-1~4 註冊/登入/登出/忘記密碼
- [x] FR-5~8 Markdown 筆記 CRUD + 編輯器
- [x] FR-9~10 軟刪除 + 回收站
- [x] FR-11~12 標籤系統（8 色）
- [x] FR-13~14 搜尋（標題 + 內容 ILIKE）
- [x] FR-15~17 公開分享 + 撤銷
- [x] FR-18 個人設定（標籤管理）
- [x] SEC 所有 API 驗證 ownership
- [x] PRI 內容隔離（user_id partition）

## License

MIT
