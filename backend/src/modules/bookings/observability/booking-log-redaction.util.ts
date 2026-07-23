const EMAIL_PATTERN = /\S+@\S+\.\S+/g;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._-]+/gi;
const TOKEN_PATTERN = /(?:sk|pk)_[A-Za-z0-9]+/gi;
const SIGNATURE_DATA_URL_PATTERN = /data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/gi;
const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;

const REDACTED = '[redacted]';
const MAX_SAFE_MESSAGE_LENGTH = 500;

export function redactBookingLogValue(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Error) {
    return redactBookingLogString(value.message || value.name);
  }
  if (typeof value === 'string') {
    return redactBookingLogString(value);
  }
  try {
    return redactBookingLogString(JSON.stringify(value));
  } catch {
    return redactBookingLogString(String(value));
  }
}

export function redactBookingLogString(input: string): string {
  return input
    .replace(SIGNATURE_DATA_URL_PATTERN, `${REDACTED}:signature`)
    .replace(BEARER_PATTERN, 'Bearer [redacted]')
    .replace(TOKEN_PATTERN, '[redacted-token]')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(CARD_PATTERN, '[redacted-card]')
    .slice(0, MAX_SAFE_MESSAGE_LENGTH);
}

export function classifyBookingErrorCode(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && code.trim()) {
      return code.trim().slice(0, 80);
    }
    const response = (err as { response?: { code?: unknown } }).response;
    if (typeof response?.code === 'string' && response.code.trim()) {
      return response.code.trim().slice(0, 80);
    }
  }
  return fallback;
}
