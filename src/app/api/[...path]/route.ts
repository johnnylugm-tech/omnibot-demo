// Next.js App Router 入口 — 把所有 /api/* 交給 Hono
import app from '@/server/api';

export const GET = (req: Request) => app.fetch(req);
export const POST = (req: Request) => app.fetch(req);
export const PUT = (req: Request) => app.fetch(req);
export const PATCH = (req: Request) => app.fetch(req);
export const DELETE = (req: Request) => app.fetch(req);
export const HEAD = (req: Request) => app.fetch(req);
export const OPTIONS = (req: Request) => app.fetch(req);
