const SENSITIVE_KEY_PATTERN =
  /(email|password|token|secret|phone|iban|bic|address|name|customer)/i;

export function sanitizeAutomationError(err: unknown): string {
  const message =
    err instanceof Error
      ? err.message
      : err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err);

  return message.replace(/\S+@\S+\.\S+/g, '[redacted-email]').slice(0, 2000);
}

export function sanitizeAutomationPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (value instanceof Date) {
      out[key] = value.toISOString();
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = sanitizeAutomationPayload(value as Record<string, unknown>);
    } else if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      out[key] = value;
    }
  }
  return out;
}
