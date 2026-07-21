import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

export const PASSWORD_RESET_TOKEN_BYTES = 32;

export function generatePasswordResetToken(): { plain: string; hash: string } {
  const plain = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('base64url');
  const hash = bcrypt.hashSync(plain, 10);
  return { plain, hash };
}

export async function verifyPasswordResetToken(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Fast lookup key — bcrypt verification still required before use. */
export function passwordResetTokenLookupKey(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}
