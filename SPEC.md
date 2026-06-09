# SPEC — 簡約筆記 SaaS

> 本文件為產品需求規格 (PRD + SRS 精簡版)。
> 標記：`[Fact]` = 原 SPEC 明確陳述；`[Inference]` = 由需求合理推斷；`[Open]` = 待業主確認。
> 優先級：`Must` (MVP 必交付) / `Should` (v1.1) / `Could` (未來)。
> 當前版本：0.3（2026-06-10 修訂）

---

## 1. 產品定位

| 項目 | 內容 |
|---|---|
| 產品 | 簡約筆記 SaaS（定位：簡化版 Notion） |
| 目標使用者 | 個人 / 小團隊的知識工作者 |
| 核心價值 | 極速開箱、低噪音編輯、輕量整理、可分享 |
| 風格基調 [Fact] | 極簡、現代、高質感、有產品感 |
| 範圍 [Fact] | 純 Web（響應式桌面優先；行動裝置為次要） |

---

## 2. 資訊架構 (IA) 與頁面清單

### 2.1 行銷 / 公開頁
- **Landing**（產品介紹 + CTA）`Must`
- **Pricing**（方案對照；可暫以單一方案 + Early Access）`Should`
- **Auth — Sign Up / Sign In / Forgot Password**`Must`
- **404 / 500 / 維護頁**`Must`

### 2.2 應用主體（登入後）
- **Dashboard / Notes List**`Must`
- **Note Editor**`Must`
- **Trash**`Must`
- **Search Results**`Must`
- **Settings**（帳號、密碼、危險區）`Should`

### 2.3 公開分享（未登入可訪問）
- **Shared Note (Read-only)**`Must`

---

## 3. 功能需求 (FR)

> 對應原 SPEC 第二段（後端功能）與第三段（技術功能），逐項映射不遺漏。

### 3.1 帳號與會話 — Must
- **FR-1 註冊**：Email + 密碼；密碼 bcrypt cost=12 雜湊儲存（見 §8.2 T-5）
- **FR-2 登入**：成功簽發 HttpOnly + SameSite=Lax Cookie + DB Session（見 §8.2 T-4）
- **FR-3 登出**：撤銷 Session
- **FR-4 密碼重設**：Email 連結重設流程（demo 改用 console 印出連結）`Should`（見 §8.1 O-2）

### 3.2 筆記 CRUD — Must
- **FR-5 列表展示**：依更新時間倒序，置頂項分區置頂
- **FR-6 創建**：點擊「新增筆記」自動建立空白筆記並跳轉至編輯器
- **FR-7 編輯**：標題 + Markdown 內容（見 §8.2 D-5）；即時預覽
- **FR-8 保存**：手動儲存 + 自動儲存（見 FR-12）
- **FR-9 刪除**：軟刪除（寫入 `deleted_at`，隱藏於主列表，進入回收站）
- **FR-10 標籤 (Tag)**：建立 / 重新命名 / 刪除 / 套用至筆記；標籤為使用者私有；預設 8 色票（見 §8.3 D-8）
- **FR-11 置頂 / 取消置頂**：切換 `is_pinned`，列表分區顯示
- **FR-12 自動保存**：編輯器 debounce 1.5s 自動 PATCH；狀態指示器（儲存中 / 已儲存 / 失敗）
- **FR-13 搜索**：依標題 + 內容關鍵字（Postgres `ILIKE` + `pg_trgm`）；支援單一關鍵字（見 §8.2 T-7）
- **FR-14 回收站與恢復**：
  - 軟刪除 30 天後自動硬刪除（見 §8.3 D-1）
  - 列表頁可恢復或永久刪除
  - 回收站可一鍵清空
- **FR-15 公開只讀分享**：
  - 產生不可枚舉 token（URL：`/s/{token}`，32 bytes；見 §4 NFR）
  - 未登入可開啟
  - 撤銷後立即失效
  - 過期時間 [Could]
- **FR-16 權限模型**：
  - 筆記與標籤：`owner_user_id`，僅擁有者可 CRUD
  - 分享：唯讀、匿名存取；不得寫入 / 不得列舉其他筆記

---

## 4. 非功能需求 (NFR)

| 類別 | 指標 | 等級 |
|---|---|---|
| 效能 | 首頁 LCP < 2.0s；編輯器輸入延遲 < 50ms | Should |
| 並發 | 單使用者多分頁同時編輯：以「最後寫入者勝」處理（demo 不做 OT/CRDT） | Must |
| 安全 | HTTPS、CSRF、密碼雜湊 (bcrypt cost=12)、Session 過期 14 天、Share token 32 bytes (`crypto.randomBytes(32)`) | Must |
| 隱私 | 公開分享僅內容本身；不洩漏擁有者 email | Must |
| 可用性 | 鍵盤可達；快捷鍵 (⌘S 儲存 / ⌘K 搜尋 / ⌘N 新增) | Should |
| 相容性 | 現代瀏覽器最新兩版（Chrome / Safari / Firefox / Edge） | Must |
| 可觀測性 | 結構化日誌、錯誤追蹤 (Sentry 等) | Should |
| 資料備份 | DB 每日快照；保留 7 天 | Should |
| 部署 | 單一 docker-compose 可起（app + db） | Should |

---

## 5. 資料模型概覽 (Inference，待技術設計確認)

```
User       (id, email[uniq], password_hash[bcrypt cost=12], name, created_at)
Note       (id, user_id, title, content, is_pinned, deleted_at,
            created_at, updated_at)
Tag        (id, user_id, name, color, created_at)
NoteTag    (note_id, tag_id)            -- 多對多
ShareLink  (id, note_id, token[uniq], expires_at, revoked_at, created_at)
Session    (id, user_id, token, expires_at[14d], created_at)   -- DB session（見 §8.2 T-4）
```

索引：`(user_id, deleted_at, is_pinned, updated_at DESC)`、`NoteTag(tag_id)`、`ShareLink(token)` UNIQUE。
全文搜尋：標題/內容建 `pg_trgm` GIN 索引（見 §8.2 T-7）。

---

## 6. 驗收標準 (Definition of Done, MVP)

1. 新使用者可於 ≤2 分鐘完成註冊 → 登入 → 創建第一則筆記。
2. 編輯器輸入停止 1.5s 後，刷新頁面資料仍存在。
3. 刪除後，Dashboard 不再顯示；Trash 可見；可恢復；可永久刪除。
4. 點擊置頂按鈕，該筆記在列表頂部分區出現；再點取消置頂。
5. 輸入標籤可建立並套用；列表可依標籤篩選 [Should] / 標籤色塊可見。
6. 全域搜尋輸入關鍵字，命中標題或內容的筆記即時呈現。
7. 產生分享連結 → 開新無痕視窗可開啟；撤銷後再開啟回 404 / 410。
8. 嘗試以 A 帳號存取 B 帳號的 `note_id` 或 `share_token` 失敗（404，不洩漏存在性）。
9. 鍵盤快捷鍵（儲存 / 搜尋 / 新增）皆可運作。
10. Lighthouse Performance ≥ 85、Accessibility ≥ 90（登入後主要頁）。

---

## 7. 範圍外 (Out of Scope, MVP)

- 多人即時共同編輯 (Real-time collaboration / OT / CRDT) — 編輯器不做「他人正在編輯」廣播（見 §8.2 T-9）
- 團隊 / Workspace 與成員邀請
- 附件上傳、圖片嵌入
- 匯出 / 匯入、版本歷史
- 行動 App、原生離線
- 付費 / 訂閱金流
- AI 助手、模板市集

---

## 8. 開放問題與決策

> demo 範圍內的單一技術預設：Next.js + Hono API + Postgres (Neon) + Vercel 部署 + Cookie Session + bcrypt + CodeMirror 6 + REST。
> 業主只需答 1 題（見 8.3）。如不接受，§8.1 是「換軌」時要拍板的項目。

### 8.1 待業主決策（換軌時才需回答）

| # | 項目 | demo 預設 | 換軌情境 |
|---|---|---|---|
| O-1 | 部署平台 | Vercel + Neon | 業主不允許資料落地第三方 → 改自架 docker-compose + Postgres |
| O-2 | 密碼重設 | console 印 magic link | 需走真 email → 引入 SMTP |
| O-3 | 錯誤追蹤 | console + 結構化 log | 需 SLA 或回放 → 接入 Sentry/GlitchTip |
| O-4 | 資料備份 | Neon 內建 PITR（7 天） | 需長期歸檔 → 補 S3 dump |
| O-5 | 內容模型 | Markdown + 即時預覽 | 需 block 編輯器（表格、嵌入）→ 換 Tiptap |

### 8.2 技術決議（已定，依此開工）

| # | 項目 | 決議 | 理由 |
|---|---|---|---|
| T-1 | 前端 | Next.js (App Router) + TypeScript | SSR、SEO 預留、Vercel 原生支援 |
| T-2 | 後端 | Hono on Node | TS 全端一致、輕量；可換 Bun runtime |
| T-3 | 資料庫 | Postgres (Neon) | 全文搜尋 (pg_trgm)、FTS5 等價物內建；無 SQLite 單寫者瓶頸 |
| T-4 | 認證 | HttpOnly + SameSite=Lax Cookie + DB Session | 可即時撤銷；JWT 在 demo 規模無收益 |
| T-5 | 密碼雜湊 | bcrypt cost=12 | demo 規模足夠；argon2id 留待 prod |
| T-6 | 編輯器 | CodeMirror 6 (Markdown 模式) | bundle ~80KB gzipped，Lighthouse 可達標；client-only dynamic import 不影響 FCP（編輯器非首屏關鍵路徑） |
| T-7 | 搜尋 | `ILIKE`（Postgres 大小寫不敏感） + `pg_trgm` 索引 | demo 規模（<10k 筆）足夠；超過再升 FTS |
| T-8 | API | REST + JSON；即時性用 SSE（自動保存狀態） | 公開分享頁可 CDN 快取 |
| T-9 | 並發 | 「最後寫入者勝」，不廣播 | 與 §7 Out of Scope 一致；廣播在編輯器視覺上是「in-progress」，易踩即時協作紅線 |
| T-10 | 部署 | Vercel（app）+ Neon（db）| 與 T-1 對齊；自架 Next.js 需自行處理 ISR/image opt |
| T-11 | Markdown 渲染 | `markdown-it`（server） + 同套件 client preview | SSR 友善；XSS 防護走 DOMPurify |

### 8.3 業主授權題（已決議 ✅）

- [x] **2026-06-10 同意 §8.2 技術決議作為 demo 實作依據**
- 工程團隊逕行開工；§8.1 保留為「未來換軌手冊」，換軌時再啟動。
- §3 FR / §4 NFR / §5 資料模型殘留的 `[Open：...]` 標籤已全部以 §8 決議回填清空。

---

## 9. 變更紀錄

| 版本 | 日期 | 變更 | 作者 |
|---|---|---|---|
| 0.1 | 2026-06-10 | 初版結構化重寫 | — |
| 0.2 | 2026-06-10 | §8 重構為「單一技術預設 + 業主 1 題授權」；§4 NFR 補 bcrypt/Session/Share token 具體值；§5 標註演算法與索引；§7 加 T-9 交叉引用 | — |
| 0.3 | 2026-06-10 | 業主授權 §8.3 通過；§3 FR 殘留 `[Open：...]` 全數以 §8 決議回填；§8.3 改為「已決議」 | — |
