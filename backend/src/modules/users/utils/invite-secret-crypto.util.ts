import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

function deriveKey(): Buffer {
  const secret =
    process.env.IAM_INVITE_DELIVERY_KEY?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    'dev-invite-delivery-key-not-for-production';
  return createHash('sha256').update(secret).digest();
}

export function encryptInviteToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function decryptInviteToken(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'base64url');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
