import { createHash } from 'crypto';

export interface BookingRequestContext {
  ipTruncated: string | null;
  userAgent: string | null;
}

export function resolveBookingRequestContext(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  connection?: { remoteAddress?: string | null };
}): BookingRequestContext {
  const rawIp = resolveClientIp(req);
  return {
    ipTruncated: truncateIpForAudit(rawIp),
    userAgent: truncateUserAgent(req.headers?.['user-agent']),
  };
}

function resolveClientIp(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  connection?: { remoteAddress?: string | null };
}): string | null {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]?.trim() || null;
  }
  return req.ip ?? req.connection?.remoteAddress ?? null;
}

/** IPv4 last octet / IPv6 last segment redacted for privacy-compliant audit. */
export function truncateIpForAudit(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;
  if (trimmed.includes('.')) {
    const parts = trimmed.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
  }
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').filter(Boolean);
    if (parts.length > 0) {
      return `${parts.slice(0, Math.max(1, parts.length - 1)).join(':')}:xxxx`;
    }
  }
  return 'redacted';
}

export function truncateUserAgent(
  value: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw?.trim()) return null;
  return raw.trim().slice(0, 256);
}

export function computeAuditContentHash(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(canonical).digest('hex');
}
