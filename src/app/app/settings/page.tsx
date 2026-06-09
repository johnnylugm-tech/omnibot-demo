'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiCallError } from '@/lib/clientApi';
import { TAG_COLOR_HEX, type Tag, type TagColor } from '@/lib/types';
import { TagDot } from '@/components/AppShell';

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ id: string; email: string; name: string | null } | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [newPwd, setNewPwd] = useState('');
  const [curPwd, setCurPwd] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await api<{ user: { id: string; email: string; name: string | null } }>(
        '/api/auth/me',
      );
      setMe(r.user);
      const tr = await api<{ tags: Tag[] }>('/api/tags');
      setTags(tr.tags);
    })();
  }, []);

  async function changePwd() {
    setMsg(null);
    setErr(null);
    if (newPwd.length < 8) {
      setErr('新密碼至少 8 字元');
      return;
    }
    setBusy(true);
    try {
      // 簡化：demo 範圍不實作 update password API（需要驗舊密碼 + 重新 hash）；
      // 改為 signout 後用 forgot/reset 流程 — 此處僅提示
      // 為了符合 SPEC FR-2/4 既有 reset 流程，引導使用者走 forgot
      setMsg('請到「忘記密碼」流程重設；demo 範圍密碼變更需 email 流程。');
      setNewPwd('');
      setCurPwd('');
    } finally {
      setBusy(false);
    }
  }

  async function renameTag(t: Tag, name: string, color: TagColor) {
    try {
      const r = await api<{ tag: Tag }>(`/api/tags/${t.id}`, {
        method: 'PATCH',
        json: { name, color },
      });
      setTags((ts) => ts.map((x) => (x.id === t.id ? r.tag : x)));
    } catch (e) {
      if (e instanceof ApiCallError) alert(e.message);
    }
  }

  async function delTag(t: Tag) {
    if (!confirm(`刪除標籤「${t.name}」？`)) return;
    await api(`/api/tags/${t.id}`, { method: 'DELETE' });
    setTags((ts) => ts.filter((x) => x.id !== t.id));
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight">設定</h1>

      <section>
        <h2 className="text-sm font-semibold text-ink-700 mb-3">帳號</h2>
        <div className="card p-4">
          <p className="text-sm text-ink-500">Email</p>
          <p className="text-sm">{me?.email}</p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink-700 mb-3">密碼</h2>
        <div className="card p-4 space-y-3">
          <input
            className="input"
            type="password"
            placeholder="目前密碼（demo 不使用）"
            value={curPwd}
            onChange={(e) => setCurPwd(e.target.value)}
            disabled
          />
          <input
            className="input"
            type="password"
            placeholder="新密碼（至少 8 字元）"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
          />
          {err && <p className="text-sm text-red-600">{err}</p>}
          {msg && <p className="text-sm text-ink-600">{msg}</p>}
          <button onClick={changePwd} disabled={busy} className="btn-primary">
            變更密碼
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink-700 mb-3">標籤管理</h2>
        {tags.length === 0 ? (
          <p className="text-ink-400 text-sm">尚無標籤</p>
        ) : (
          <ul className="card divide-y divide-ink-200">
            {tags.map((t) => (
              <li key={t.id} className="px-4 py-3 flex items-center gap-3">
                <TagDot color={t.color} />
                <input
                  defaultValue={t.name}
                  onBlur={(e) => {
                    if (e.target.value !== t.name) void renameTag(t, e.target.value, t.color);
                  }}
                  className="flex-1 bg-transparent text-sm outline-none"
                />
                <select
                  defaultValue={t.color}
                  onChange={(e) => void renameTag(t, t.name, e.target.value as TagColor)}
                  className="text-xs rounded border border-ink-200 px-2 py-1 bg-white"
                >
                  {(['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet'] as TagColor[]).map(
                    (c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ),
                  )}
                </select>
                <button onClick={() => void delTag(t)} className="btn-danger h-7 text-xs">
                  刪除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-red-700 mb-3">危險區</h2>
        <div className="card p-4">
          <p className="text-sm text-ink-600">
            永久刪除帳號會移除所有筆記、標籤、分享。demo 範圍未實作。
          </p>
          <button
            disabled
            className="btn-danger mt-3 opacity-50 cursor-not-allowed"
            title="demo 未實作"
          >
            永久刪除帳號
          </button>
        </div>
      </section>
    </div>
  );
}
