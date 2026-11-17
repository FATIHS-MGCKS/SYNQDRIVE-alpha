import type { Request } from 'express';

/**
 * Client IP at the HTTP trust boundary for M2M rate limiting.
 *
 * **Production proxy note:** `main.ts` does **not** call `app.set('trust proxy', …)`.
 * Express therefore sets `req.ip` from the TCP peer (`remoteAddress`) unless an operator
 * adds explicit trust-proxy configuration in a separate deployment change.
 * This resolver **never** reads `X-Forwarded-For` — forwarded headers must not override
 * rate-limit identity without a reviewed trust-proxy policy.
 */
export function resolveCoreAppM2mTrustBoundaryClientIp(req: Request): string | null {
  const candidate = req.ip?.trim() || req.socket?.remoteAddress?.trim() || null;
  if (!candidate) {
    return null;
  }
  return candidate.replace(/^::ffff:/, '');
}