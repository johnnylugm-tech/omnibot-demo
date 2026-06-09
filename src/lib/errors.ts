// 統一錯誤回應；避免洩漏內部訊息但保留可追蹤性
export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const httpErrors = {
  badRequest: (msg = 'Bad request', code = 'bad_request') => new HttpError(400, code, msg),
  unauthorized: (msg = 'Unauthorized', code = 'unauthorized') => new HttpError(401, code, msg),
  forbidden: (msg = 'Forbidden', code = 'forbidden') => new HttpError(403, code, msg),
  notFound: (msg = 'Not found', code = 'not_found') => new HttpError(404, code, msg),
  conflict: (msg = 'Conflict', code = 'conflict') => new HttpError(409, code, msg),
  gone: (msg = 'Gone', code = 'gone') => new HttpError(410, code, msg),
  unprocessable: (msg = 'Unprocessable', code = 'unprocessable_entity') =>
    new HttpError(422, code, msg),
  rateLimited: (msg = 'Too many requests', code = 'rate_limited') => new HttpError(429, code, msg),
  server: (msg = 'Internal error', code = 'internal_error') => new HttpError(500, code, msg),
};
