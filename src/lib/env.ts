// 中央化的環境變數讀取 + 校驗；lazy evaluate 避免 Next 14 dev 模組評估期 fail-fast
// 僅供 server 使用 — 不可被 client component import
import { z } from 'zod';

if (typeof process === 'undefined' || !process.env) {
  throw new Error('env.ts must only be imported on the server');
}

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 chars'),
  APP_ORIGIN: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

let _env: z.infer<typeof EnvSchema> | null = null;
export const env = new Proxy({} as z.infer<typeof EnvSchema>, {
  get(_t, key) {
    if (!_env) {
      _env = EnvSchema.parse({
        DATABASE_URL: process.env.DATABASE_URL,
        SESSION_SECRET: process.env.SESSION_SECRET,
        APP_ORIGIN: process.env.APP_ORIGIN,
        NODE_ENV: process.env.NODE_ENV,
      });
    }
    return (_env as Record<string, unknown>)[key as string];
  },
});

