// 32-byte URL-safe token (FR-15, §4 NFR)
import { randomBytes, createHash } from 'node:crypto';

export function generateShareToken(): { token: string; tokenHash: string } {
  const buf = randomBytes(32); // 256 bits, unguessable
  const token = buf.toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
