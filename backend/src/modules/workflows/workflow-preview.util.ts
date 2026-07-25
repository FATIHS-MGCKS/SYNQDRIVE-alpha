const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /\+?\d[\d\s().-]{6,}\d/g;

/** Mask email for dry-run previews — never expose full address. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const maskedLocal = local.length <= 1 ? '*' : `${local[0]}***`;
  const dot = domain.lastIndexOf('.');
  if (dot <= 0) return `${maskedLocal}@***`;
  const domainName = domain.slice(0, dot);
  const tld = domain.slice(dot);
  const maskedDomain = domainName.length <= 1 ? '*' : `${domainName[0]}***`;
  return `${maskedLocal}@${maskedDomain}${tld}`;
}

/** Mask phone number — keep last 2 digits only. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-2)}`;
}

const SECRET_KEY_PATTERN =
  /(api[_-]?key|secret|token|password|authorization|bearer|private[_-]?key)/i;

/** Recursively mask PII and strip secret-like keys from preview payloads. */
export function sanitizePreviewValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    let out = value.replace(EMAIL_PATTERN, (m) => maskEmail(m));
    out = out.replace(PHONE_PATTERN, (m) => maskPhone(m));
    return out;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePreviewValue(item));
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) continue;
      result[key] = sanitizePreviewValue(val);
    }
    return result;
  }
  return value;
}

export function sanitizePreviewRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizePreviewValue(record) as Record<string, unknown>;
}
