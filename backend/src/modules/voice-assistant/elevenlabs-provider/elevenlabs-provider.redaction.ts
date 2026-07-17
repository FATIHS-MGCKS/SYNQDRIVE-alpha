const API_KEY_PATTERN = /xi-api-key['":\s]+[A-Za-z0-9._-]+/gi;
const AGENT_ID_PATTERN = /\bagent_[A-Za-z0-9]{10,}\b/g;
const PHONE_ID_PATTERN = /\bphnum_[A-Za-z0-9]{10,}\b/g;

export function maskExternalId(value: string | null | undefined, prefix = 'ref'): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.length <= 8) {
    return `${prefix}_***`;
  }
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

export function sanitizeElevenLabsLogMessage(message: string): string {
  return message
    .replace(API_KEY_PATTERN, 'xi-api-key=[REDACTED]')
    .replace(AGENT_ID_PATTERN, 'agent_[REDACTED]')
    .replace(PHONE_ID_PATTERN, 'phnum_[REDACTED]');
}

export function redactProviderPayload<T extends Record<string, unknown>>(payload: T): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...payload };
  for (const key of Object.keys(clone)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('secret') ||
      lower.includes('token') ||
      lower.includes('api_key') ||
      lower.includes('signed_url')
    ) {
      clone[key] = '[REDACTED]';
      continue;
    }
    if (lower.includes('agent_id') || lower.endsWith('_id')) {
      const value = clone[key];
      if (typeof value === 'string') {
        clone[key] = maskExternalId(value, lower.includes('phone') ? 'phone' : 'agent');
      }
    }
  }
  return clone;
}
