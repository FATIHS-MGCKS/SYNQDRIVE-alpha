import type { Request } from 'express';

/**
 * Client IP at the trust boundary — uses Express `req.ip` / socket only.
 * Does not parse client-supplied X-Forwarded-For headers.
 */
export function resolveCoreAppM2mTrustBoundaryClientIp(req: Request): string | null {
  const candidate = req.ip?.trim() || req.socket?.remoteAddress?.trim() || null;
  if (!candidate) {
    return null;
  }
  return candidate.replace(/^::ffff:/, '');
}