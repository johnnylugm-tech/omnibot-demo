'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api, ApiCallError } from '@/lib/clientApi';
import { renderMarkdown } from '@/lib/markdown';
import { TAG_COLOR_HEX, type Note, type Tag, type TagColor, type ShareLinkRow } from '@/lib/types';
import { TagDot } from '@/components/AppShell';

const TAG_COLORS: TagColor[] = ['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet'];

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function EditorClient({ noteId: noteIdProp }: { noteId?: string } = {}) {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = noteIdProp ?? params.id;

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [tags, setTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [shares, setShares] = useState<ShareLinkRow[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<TagColor>('gray');
  const [taggingBusy, setTaggingBusy] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<{ destroy: () => void } | null>(null);
  const contentRef = useRef('');
  const titleRef = useRef('');
  const noteRef = useRef<Note | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<{ title: string; content: string }>({ title: '', content: '' });

  useEffect(() => {
    void (async () => {
      try {
        const r = await api<{ note: Note; tags: Tag[] }>(`/api/notes/${id}`);
        setNote(r.note);
        setTitle(r.note.title);
        setContent(r.note.content);
        setTags(r.tags);
        lastSavedRef.current = { title: r.note.title, content: r.note.content };

        const tr = await api<{ tags: Tag[] }>('/api/tags');
        setAllTags(tr.tags);

        const sr = await api<{ shares: ShareLinkRow[] }>(`/api/share?noteId=${id}`).catch(() => ({
          shares: [] as ShareLinkRow[],
        }));
        setShares(sr.shares.filter((s) => s.noteId === id));
      } catch (e) {
        if (e instanceof ApiCallError && e.status === 404) router.push('/app');
      }
    })();
  }, [id, router]);

  // 保持 refs 同步，供 CM init / save 閉包讀取最新值
  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { noteRef.current = note; }, [note]);

  useEffect(() => {
    if (!editorRef.current) return;
    if (viewRef.current) return;
    let view: { destroy: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const [{ EditorState }, { EditorView, keymap, lineNumbers, highlightActiveLine }, { defaultKeymap, history, historyKeymap, indentWithTab }, { markdown }] = await Promise.all([
        import('@codemirror/state'),
        import('@codemirror/view'),
        import('@codemirror/commands'),
        import('@codemirror/lang-markdown'),
      ]);
      if (cancelled || !editorRef.current) return;
      const state = EditorState.create({
        doc: contentRef.current,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown(),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              const v = u.state.doc.toString();
              setContent(v);
              scheduleSaveRef.current?.();
            }
          }),
        ],
      });
      view = new EditorView({ state, parent: editorRef.current });
      viewRef.current = view;
    })();
    return () => {
      cancelled = true;
      view?.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 首次載入後將 note 內容同步到 CM（若 CM 比 API 先 init 則 content 為空）
  // 只在 CM 尚未被 user 編輯過時才 sync，避免 overwrite user 正在打的內容
  const initialSyncDone = useRef(false);
  useEffect(() => {
    if (!note || initialSyncDone.current) return;
    const view = viewRef.current;
    if (!view) return;
    initialSyncDone.current = true;
    try {
      const cmView = view as unknown as { dispatch: (tr: { changes: { from: number; to: number; insert: string } }) => void; state?: { doc?: { length: number; toString(): string } } };
      const cmContent = cmView.state?.doc?.toString() ?? '';
      // 若 CM 內容與上次存檔不同 → user 已編輯過，不要覆蓋
      if (cmContent !== lastSavedRef.current.content) return;
      if (cmContent === note.content) return;
      const currentLen = cmView.state?.doc?.length ?? 0;
      cmView.dispatch({ changes: { from: 0, to: currentLen, insert: note.content } });
      setContent(note.content);
    } catch {
      // CM 尚未完全初始化，忽略
    }
  }, [note]);

  // 統一 autosave：title 變更與 CM content 變更都用同一個 debounce
  // 用 monotonic save generation 防止 stale response 覆蓋 lastSavedRef
  const saveGenRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const scheduleSaveRef = useRef<(() => void) | null>(null);

  const scheduleSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void doSave();
    }, 1500);
  }, []); // 空 deps — 用 refs 讀最新值

  useEffect(() => {
    scheduleSaveRef.current = scheduleSave;
  }, [scheduleSave]);

  // title 變更 → schedule save（用 ref 避免 race）
  useEffect(() => {
    if (!note) return;
    if (title === note.title) return;
    scheduleSaveRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  async function doSave() {
    if (saveInFlightRef.current) return; // 序列化：上一個 PATCH 還在 flight
    const cur = noteRef.current;
    const t = titleRef.current;
    const c = contentRef.current;
    if (!cur) return;
    if (c === lastSavedRef.current.content && t === lastSavedRef.current.title) return;
    saveInFlightRef.current = true;
    const myGen = ++saveGenRef.current;
    setStatus('saving');
    try {
      const r = await api<{ note: Note }>(`/api/notes/${id}`, {
        method: 'PATCH',
        json: { title: t, content: c },
      });
      if (myGen !== saveGenRef.current) return; // 已被更新的 save 取代
      setNote(r.note);
      setStatus('saved');
      lastSavedRef.current = { title: t, content: c };
      setTimeout(() => setStatus('idle'), 1500);
    } catch {
      if (myGen !== saveGenRef.current) return;
      setStatus('error');
    } finally {
      if (myGen === saveGenRef.current) saveInFlightRef.current = false;
      // 若期間又有新排程，立即觸發，避免「最後一筆編輯」丟失
      if (saveGenRef.current > myGen) void doSave();
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        void doSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, title, note]);

  async function del() {
    if (!confirm('刪除此筆記？可從回收站恢復。')) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await doSave();
    await api(`/api/notes/${id}`, { method: 'DELETE' });
    router.push('/app');
  }

  async function applyTagIds(tagIds: string[]) {
    setTaggingBusy(true);
    try {
      await api(`/api/notes/${id}/tags`, { method: 'PUT', json: { tagIds } });
      const r = await api<{ tags: Tag[] }>(`/api/notes/${id}`);
      setTags(r.tags);
    } finally {
      setTaggingBusy(false);
    }
  }

  function toggleTag(t: Tag) {
    const has = tags.some((x) => x.id === t.id);
    const next = has ? tags.filter((x) => x.id !== t.id) : [...tags, t];
    void applyTagIds(next.map((x) => x.id));
  }

  async function createTag() {
    const name = newTagName.trim();
    if (!name) return;
    try {
      const r = await api<{ tag: Tag }>('/api/tags', {
        method: 'POST',
        json: { name, color: newTagColor },
      });
      setAllTags((ts) => [r.tag, ...ts]);
      setNewTagName('');
      void toggleTag(r.tag);
    } catch (e) {
      if (e instanceof ApiCallError) alert(e.message);
    }
  }

  async function createShare() {
    const r = await api<{ share: ShareLinkRow & { token: string } }>('/api/share', {
      method: 'POST',
      json: { noteId: id },
    });
    setShares((s) => [
      {
        id: r.share.id,
        noteId: r.share.noteId,
        createdAt: r.share.createdAt,
        expiresAt: r.share.expiresAt,
        revokedAt: r.share.revokedAt,
        noteTitle: note?.title ?? '',
      },
      ...s,
    ]);
    const url = `${window.location.origin}/s/${r.share.token}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    alert(`分享連結已複製：\n${url}`);
  }

  async function revokeShare(sid: string) {
    if (!confirm('撤銷後連結立即失效。確定？')) return;
    await api(`/api/share/${sid}`, { method: 'DELETE' });
    setShares((s) => s.map((x) => (x.id === sid ? { ...x, revokedAt: new Date().toISOString() } : x)));
  }

  const html = renderMarkdown(content);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => router.push('/app')} className="btn-ghost h-8">
          ←
        </button>
        <span className="text-xs text-ink-500 flex-1">
          {!note
            ? '載入中…'
            : status === 'saving'
              ? '儲存中…'
              : status === 'saved'
                ? '已儲存'
                : status === 'error'
                  ? '⚠ 儲存失敗'
                  : ''}
        </span>
        {note && (
          <>
            <button onClick={() => setShowShare((s) => !s)} className="btn-outline h-8 text-xs">
              分享
            </button>
            <button onClick={del} className="btn-danger h-8 text-xs">
              刪除
            </button>
          </>
        )}
      </div>

      {showShare && (
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">公開分享</h3>
            <button onClick={() => void createShare()} className="btn-primary h-8 text-xs">
              產生新連結
            </button>
          </div>
          {shares.length === 0 ? (
            <p className="text-xs text-ink-500 mt-3">尚無分享連結。</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {shares.map((s) => {
                const revoked = !!s.revokedAt;
                return (
                  <li key={s.id} className="text-xs flex items-center gap-3 px-3 py-2 rounded bg-ink-50">
                    <span className="text-ink-500">
                      {new Date(s.createdAt).toLocaleString('zh-TW')}
                    </span>
                    {revoked ? (
                      <span className="text-red-600">已撤銷</span>
                    ) : (
                      <span className="text-green-700">有效</span>
                    )}
                    {!revoked && (
                      <button
                        onClick={() => void revokeShare(s.id)}
                        className="ml-auto text-ink-500 hover:text-red-600"
                      >
                        撤銷
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-[10px] text-ink-500">
            連結產生後，內容任何人可唯讀開啟；你撤銷後立即失效。
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="標題"
            className="w-full bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-ink-300 mb-2"
          />
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {tags.map((t) => (
              <button
                key={t.id}
                onClick={() => toggleTag(t)}
                className="text-[11px] px-2 py-0.5 rounded-full bg-ink-100 text-ink-700 inline-flex items-center gap-1.5 hover:bg-ink-200"
              >
                <TagDot color={t.color} />
                {t.name}
                <span className="text-ink-400">×</span>
              </button>
            ))}
            {allTags
              .filter((t) => !tags.some((x) => x.id === t.id))
              .slice(0, 6)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => toggleTag(t)}
                  disabled={taggingBusy}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-ink-300 text-ink-500 inline-flex items-center gap-1.5 hover:border-ink-400 hover:text-ink-700"
                >
                  <TagDot color={t.color} />+ {t.name}
                </button>
              ))}
            <span className="inline-flex items-center gap-1">
              <input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createTag();
                }}
                placeholder="新標籤"
                className="h-6 text-[11px] px-2 rounded border border-ink-200 bg-white"
              />
              <select
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value as TagColor)}
                className="h-6 text-[11px] rounded border border-ink-200 bg-white"
                aria-label="顏色"
              >
                {TAG_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void createTag()}
                className="h-6 px-2 text-[11px] rounded bg-ink-100 hover:bg-ink-200"
              >
                +
              </button>
            </span>
          </div>
          <div
            ref={editorRef}
            data-testid="cm-editor"
            className="rounded-lg border border-ink-200 bg-white px-3 py-2 min-h-[60vh]"
          />
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink-500 mb-2">Preview</p>
          <div
            className="md rounded-lg border border-ink-200 bg-white px-5 py-4 min-h-[60vh]"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}
