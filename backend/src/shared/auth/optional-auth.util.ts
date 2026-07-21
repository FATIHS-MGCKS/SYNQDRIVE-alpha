import * as jwt from 'jsonwebtoken';
import { normalizeIdentityEmail } from '@modules/users/utils/identity-email.util';

export interface OptionalAuthIdentity {
  userId: string;
  email: string;
}

export function extractOptionalAuthIdentity(
  authorizationHeader?: string,
): OptionalAuthIdentity | null {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) return null;

  const [type, token] = authorizationHeader?.split(' ') ?? [];
  if (type !== 'Bearer' || !token) return null;

  try {
    const decoded = jwt.verify(token, secret) as {
      sub?: string;
      email?: string;
    };
    if (!decoded.sub || !decoded.email) return null;
    return {
      userId: decoded.sub,
      email: normalizeIdentityEmail(decoded.email),
    };
  } catch {
    return null;
  }
}
