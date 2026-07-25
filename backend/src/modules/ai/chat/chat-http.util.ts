import { normalizeClientIp } from '../limits/ai-agent-rate-limit.service';
import type { Request } from 'express';

export function resolveChatClientIp(
  req: Pick<Request, 'ip' | 'headers'> & { connection?: { remoteAddress?: string | null } },
): string | null {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return normalizeClientIp(forwarded);
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return normalizeClientIp(forwarded[0]);
  }
  return normalizeClientIp(req.ip ?? req.connection?.remoteAddress ?? null);
}
