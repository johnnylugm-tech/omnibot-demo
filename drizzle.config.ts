import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://omnibot:omnibot@localhost:5432/omnibot',
  },
  strict: true,
  verbose: true,
} satisfies Config;
