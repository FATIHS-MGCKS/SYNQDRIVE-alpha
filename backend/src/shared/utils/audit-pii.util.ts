const SENSITIVE_META_KEY_FRAGMENTS = [
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'auth_header',
  'refresh',
  'otp',
  'pin',
  'signature',
  'iban',
  'bic',
  'creditcard',
  'credit_card',
  'cvv',
  'ssn',
  'tax_id',
  'taxid',
  'latitude',
  'longitude',
  'coordinates',
  'callbackurl',
  'callback_url',
];

function isSensitiveMetaKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_META_KEY_FRAGMENTS.some((f) => k.includes(f));
}

/** Best-effort recursive scrubber for audit metadata objects. */
export function scrubPiiJson<T = unknown>(input: T): T {
  if (input == null) return input;
  if (Array.isArray(input)) {
    return input.map((v) => scrubPiiJson(v)) as unknown as T;
  }
  if (typeof input !== 'object') return input;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (isSensitiveMetaKey(k)) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object') {
      out[k] = scrubPiiJson(v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

/** Redact likely PII embedded in free-text audit descriptions. */
export function scrubPiiString(input: string): string {
  if (!input) return input;
  return input
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b\d{7,}\b/g, (m) => `[${m.length}-digit]`);
}
