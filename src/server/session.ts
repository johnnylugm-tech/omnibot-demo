// Server-side session helper for App Router pages
// 在 server component 中讀 cookie 並 resolve user
import { cookies } from 'next/headers';
import { findUserBySessionToken, SESSION_COOKIE } from '@/lib/auth';
import type { User } from '@/db/schema';

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await findUserBySessionToken(token);
  } catch {
    return null;
  }
}
