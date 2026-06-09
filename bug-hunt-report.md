# Bug Hunt Report — omnibot-demo

Date: 2026-06-10. Scope: full source tree. Method: 4 parallel recon passes (auth/API/frontend/infra) + targeted line-level verification.

**Severity tally:** 2 Critical · 7 High · 9 Medium · 8 Low

---

## CRITICAL

### C-1. Concurrent autosave can lose writes
**File:** `src/components/EditorClient.tsx:152-171` (`doSave`)
**Verified:** yes. Two PATCHes can interleave. The second's `setNote(r.note)` overwrites the first's later content if the user kept typing.
**Fix:** queue saves via a `saveInFlightRef`; ignore stale responses.

### C-2. `loadOwnedNote` does not filter `deletedAt IS NULL` — trashed notes remain mutable & shareable
**File:** `src/server/routes/notes.ts:13-21` (used by `:66, :84, :102, :114, :126, :147`)
**Verified:** yes. Soft-deleted notes can still be: PATCHed, hard-deleted, restored, tags-rewritten. Also enables H-1 and H-2.
**Fix:** add `isNull(notes.deletedAt)` to the where clause.

---

## HIGH

### H-1. `POST /api/share` accepts trashed note IDs
**File:** `src/server/routes/share.ts:42-47`
**Verified:** yes (no `isNull(deletedAt)` filter). Cached client noteId → server happily issues a share for a trashed note.
**Fix:** add `isNull(notes.deletedAt)` (fixed transitively by C-2).

### H-2. Public share serves soft-deleted notes
**File:** `src/server/routes/publicShare.ts:22-40`
**Verified:** yes. Anyone with the previously-distributed URL keeps full read access after the owner trashes the note. No revoke is issued.
**Fix:** filter `isNull(notes.deletedAt)`, or auto-revoke all `share_links` for the note inside the `DELETE` handler.

### H-3. Password reset does not invalidate existing sessions
**File:** `src/server/routes/auth.ts:144-153`
**Verified:** yes. After reset, attacker-held session cookies stay valid — straight account takeover.
**Fix:** inside the same transaction call `revokeAllForUser(reset.userId)`.

### H-4. Reset token TOCTOU — concurrent resets with same valid token
**File:** `src/server/routes/auth.ts:132-153`
**Verified:** yes. The `usedAt` check runs outside the transaction; the `update(usedAt)` has no `usedAt IS NULL` guard. Two concurrent requests both pass the check and both rewrite `passwordHash`.
**Fix:** atomic conditional update: `UPDATE password_resets SET used_at=now() WHERE id=? AND used_at IS NULL`; treat 0 rows as failure.

### H-5. Signin timing oracle for email enumeration
**File:** `src/server/routes/auth.ts:77-79`
**Verified:** yes. Nonexistent email skips bcrypt → measurably faster response. Same error code, different timing.
**Fix:** always run a dummy `bcrypt.compare` against a fixed hash on the no-user path.

### H-6. `sameOrigin` CSRF defense allows requests with no Origin header
**File:** `src/server/middleware.ts:46`
**Verified:** yes. `if (!origin) return next();` is the documented "defense-in-depth" — but missing Origin is the exact case it claims to defend. Combined with `SameSite=Lax`, server-to-server POSTs (no Origin, with stolen cookie via a Lax-eligible navigation) hit state-changing endpoints unchallenged.
**Fix:** require `Origin` to be present on non-GET/HEAD/OPTIONS, or check `Sec-Fetch-Site: same-origin` explicitly.

### H-7. `data:` URI allowed on `<img>` — tracking / fingerprint via public share
**File:** `src/lib/markdown.ts:57-58` (`allowedSchemesByTag: { img: ['http', 'https', 'data'] }`)
**Verified:** yes. Author can embed 1×1 `data:image/gif;base64,…` beacons that fire on every public-share view. Sanitizer doesn't strip the `data:` scheme for `img`, and `<img>` is in `ALLOWED_TAGS`.
**Fix:** drop `'data'`, allow only `['http', 'https']`.

---

## MEDIUM

### M-1. `loadOwnedNote` (see C-2) cascades to M-2/M-3 — same root cause
Same fix as C-2.

### M-2. `share_links.expiresAt` never set — every share is non-expiring
**File:** `src/server/routes/share.ts:50-53`; schema `src/db/schema.ts:163`
**Verified:** yes. Insert omits `expiresAt`; column is nullable; SPEC's 7-day auto-expire is silently dropped.
**Fix:** `expiresAt: sql\`now() + interval '7 days'\`` in the insert values.

### M-3. `POST /api/auth/forgot` stacks valid reset tokens
**File:** `src/server/routes/auth.ts:117-121`
**Verified:** yes. Each call inserts a new row; previous tokens for the same user stay valid for their 30-min TTL. Leaked older token still works.
**Fix:** mark prior outstanding rows `usedAt = now()` for that user before insert, or upsert a single active token.

### M-4. Signup email-uniqueness race
**File:** `src/server/routes/auth.ts:45-60`
**Verified:** yes. Existence check + insert are not atomic; relies on DB unique index but a UNIQUE constraint violation surfaces as a 500.
**Fix:** catch PG error 23505 and return 409.

### M-5. SSR vs API session-cookie name drift
**File:** `src/server/session.ts:9`
**Verified:** yes. Hardcodes `'ob_sid'`; constant `SESSION_COOKIE` in `src/lib/auth.ts:14` is the source of truth. If renamed, SSR silently breaks while API auth keeps working.
**Fix:** import `SESSION_COOKIE` from `@/lib/auth`.

### M-6. Editor mount effect has `[]` deps — stale content when navigating A → B without unmount
**File:** `src/components/EditorClient.tsx:62-106`; parent `src/app/app/notes/[id]/page.tsx`
**Verified:** yes. `initialSyncDone` ref is set once; the new route's `note` content is never dispatched into CM. User navigates `/app/notes/A → /app/notes/B` and keeps seeing A's content with B's title.
**Fix:** key the parent on `id` (e.g. wrap `<EditorClient key={id} />`), or rebuild CM in the mount effect when `id` changes.

### M-7. Dashboard N+1 on tags
**File:** `src/app/app/page.tsx:33-50`
**Verified:** yes. For N notes the dashboard fires N parallel `GET /api/notes/:id` calls just to fetch tags.
**Fix:** add `?include=tags` to `/api/notes` and return tags in one round trip.

### M-8. Drizzle `ilike` term escapes `%` / `_` but no `ESCAPE` clause
**File:** `src/server/routes/notes.ts:37` (search query)
**Verified:** yes. Drizzle emits `column ILIKE $1`; the backslash escapes in the term are treated as literal chars, so `50% off` never matches. Index still used; correctness is wrong.
**Fix:** drop the manual escaping, or use raw `sql\`… ILIKE ${value} ESCAPE '\\\\'\``.

### M-9. env Proxy — client-bundle crash if `env.ts` is transitively imported
**File:** `src/lib/env.ts:12-24`
**Verified:** yes. `auth.ts` uses `env.NODE_ENV`; if `auth.ts` is ever pulled into a client component, the first Proxy access fires `EnvSchema.parse({DATABASE_URL: undefined, …})` and throws `ZodError`.
**Fix:** add a `'server-only'` import at the top of `env.ts`, or split into `env.server.ts` / `env.public.ts`.

---

## LOW

- **L-1.** Pin toggle lost-update race (`src/server/routes/notes.ts:84-99`) — no `updatedAt` precondition; add `If-Match`.
- **L-2.** `c.req.json().catch(() => ({}))` masks malformed JSON across all routes — return `400 invalid_json` instead of swallowing.
- **L-3.** `gcExpiredSessions` is exported but never called (`src/lib/auth.ts:73-75`) — expired `sessions` rows accumulate forever.
- **L-4.** Search highlight regex has stateful `lastIndex` (`src/app/app/search/page.tsx:91-104`) — flaky `<mark>` rendering on multi-match strings.
- **L-5.** `AppShell` ⌘N race (`src/components/AppShell.tsx:30,40`) — listener captures stale `creating` flag; rapid ⌘N fires multiple `POST /api/notes`.
- **L-6.** `del()` in dashboard and editor doesn't handle 500 (`src/app/app/page.tsx:69`, `src/components/EditorClient.tsx:187-193`) — optimistic UI doesn't revert on failure.
- **L-7.** `db/client.ts` falls back to `localhost:5432` in production if `DATABASE_URL` is missing (`src/db/client.ts:6`) — should throw in production.
- **L-8.** No CSP / HSTS / X-Frame-Options (`next.config.mjs`) — defense-in-depth gap given the user-HTML render path.

---

## Verified clean (negative findings)

- `src/lib/markdown.ts` XSS via `<a>` / `<svg>` / `<iframe>` — `html: false` + sanitize-html ALLOWED_TAGS strips them.
- `tags.ts` cross-user IDOR — owner scope is correct on PATCH/DELETE.
- Catch-all route `/api/[...path]/route.ts` — all 7 HTTP methods forwarded.
- FK cascades on `note_tags` / `share_links` (`drizzle/0000_*.sql:61,91`) — `empty-trash` does not orphan rows.
- `globals.css` — no inline scripts, no external resources.
- Public share token regex doesn't collide with sha256 hex (regex is a DoS pre-filter, not a security boundary).

---

## Recommended fix order

1. **C-2** + cascading H-1, H-2 (one-line fix: `isNull(notes.deletedAt)` in `loadOwnedNote`).
2. **H-3** + **H-4** (one transaction: revoke sessions + conditional `used_at`).
3. **C-1** (save queue in `EditorClient`).
4. **H-7** (drop `data:` from `img` allowed schemes).
5. **H-5**, **H-6** (timing + CSRF).
6. **M-1, M-2** (`expiresAt` insert + listing cap).
7. **M-6** (editor keying).
8. **M-7** (batch tags).
9. Medium / Low backlog.
