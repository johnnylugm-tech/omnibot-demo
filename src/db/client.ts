import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://omnibot:omnibot@localhost:5432/omnibot';

// Reuse client across hot-reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var __pg__: ReturnType<typeof postgres> | undefined;
}

const client =
  globalThis.__pg__ ??
  postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // neon-friendly; safe for plain pg too
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__pg__ = client;
}

export const db = drizzle(client, { schema });
export { schema };
export type DB = typeof db;
