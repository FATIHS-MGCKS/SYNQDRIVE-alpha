const SECRET_PATTERNS = [
  /bearer\s+[a-z0-9._\-+/=]+/gi,
  /api[_-]?key[=:\s]+[a-z0-9._\-+/=]+/gi,
  /re_[a-zA-Z0-9]{10,}/g,
  /sk_[a-zA-Z0-9]{10,}/g,
  /whsec_[a-zA-Z0-9+/=]+/g,
];

export const MAX_OUTBOUND_ERROR_MESSAGE_LENGTH = 500;

/** Strip likely secrets and truncate provider errors for safe persistence/display. */
export function sanitizeOutboundErrorMessage(
  message: string | null | undefined,
  maxLength: number = MAX_OUTBOUND_ERROR_MESSAGE_LENGTH,
): string | null {
  if (!message?.trim()) return null;
  let sanitized = message.trim();
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[redacted]');
  }
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  if (sanitized.length <= maxLength) return sanitized;
  return `${sanitized.slice(0, maxLength - 1)}…`;
}

export function isRetryableOutboundEmail(input: {
  status: string;
  deliveryStatus: string;
}): boolean {
  if (['QUEUED', 'SENDING'].includes(input.status)) return false;
  if (input.status === 'FAILED') return true;
  if (['BOUNCED', 'COMPLAINED', 'FAILED'].includes(input.deliveryStatus)) return true;
  return false;
}

export function resolveDisplayTimestamp(input: {
  deliveredAt?: Date | null;
  acceptedAt?: Date | null;
  sentAt?: Date | null;
  failedAt?: Date | null;
  requestedAt?: Date | null;
  createdAt: Date;
}): string {
  const pick =
    input.deliveredAt ??
    input.acceptedAt ??
    input.sentAt ??
    input.failedAt ??
    input.requestedAt ??
    input.createdAt;
  return pick.toISOString();
}
