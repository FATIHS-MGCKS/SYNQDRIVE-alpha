import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

export function generateInviteToken(): { plain: string; hash: string } {
  const plain = randomBytes(32).toString('base64url');
  const hash = bcrypt.hashSync(plain, 10);
  return { plain, hash };
}

export async function verifyInviteToken(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Fast lookup helper — still verified with bcrypt before accept. */
export function inviteTokenLookupKey(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}
