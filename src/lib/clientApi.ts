// 統一 client-side API helper
export interface ApiError {
  code: string;
  message: string;
}

export class ApiCallError extends Error {
  status: number;
  code: string;
  constructor(status: number, body: { error?: ApiError }) {
    super(body.error?.message ?? `HTTP ${status}`);
    this.status = status;
    this.code = body.error?.code ?? 'unknown';
  }
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers = new Headers(init?.headers);
  let body = init?.body;
  if (init?.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  // 瀏覽器自動加 cookie；同源
  const r = await fetch(path, {
    ...init,
    headers,
    body,
    credentials: 'same-origin',
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new ApiCallError(r.status, data);
  }
  return r.json() as Promise<T>;
}
