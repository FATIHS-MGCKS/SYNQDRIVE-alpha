const SENSITIVE_KEY = /token|secret|password|authorization|api[_-]?key|jwt|bearer|cookie/i;
const SENSITIVE_VALUE = /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\./;

export function sanitizeSourcePage(path?: string | null): string | undefined {
  if (!path?.trim()) return undefined;
  const raw = path.trim();
  if (raw.startsWith('http')) {
    try {
      return new URL(raw).pathname;
    } catch {
      return raw.split('?')[0];
    }
  }
  return raw.split('?')[0];
}

export function sanitizeSupportMetadata(
  input: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (typeof value === 'string' && SENSITIVE_VALUE.test(value)) continue;
    if (value !== undefined && value !== null && value !== '') {
      out[key] = value;
    }
  }
  return out;
}

export function buildTechnicalMetadata(extra?: Record<string, unknown>): Record<string, unknown> {
  if (typeof window === 'undefined') return sanitizeSupportMetadata(extra);
  return sanitizeSupportMetadata({
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    path: sanitizeSourcePage(window.location.pathname),
    capturedAt: new Date().toISOString(),
    ...extra,
  });
}

export function mergeTicketMetadata(
  contextMetadata?: Record<string, unknown>,
  options?: { helpCenterAttempted?: boolean; aiTriage?: Record<string, unknown> },
): Record<string, unknown> {
  return sanitizeSupportMetadata({
    ...buildTechnicalMetadata(),
    ...contextMetadata,
    ...(options?.helpCenterAttempted ? { helpCenterAttempted: true } : {}),
    ...(options?.aiTriage ? { aiTriage: sanitizeSupportMetadata(options.aiTriage) } : {}),
  });
}
