import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcrypt';

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function generateRecoveryCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  let raw = '';
  for (let i = 0; i < 8; i += 1) {
    raw += alphabet[bytes[i] % alphabet.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export async function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(normalizeRecoveryCode(code), 10);
}

export async function verifyRecoveryCode(code: string, codeHash: string): Promise<boolean> {
  return bcrypt.compare(normalizeRecoveryCode(code), codeHash);
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().replace(/\s+/g, '').replace(/-/g, '').toUpperCase();
}

export function safeEqualStrings(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
