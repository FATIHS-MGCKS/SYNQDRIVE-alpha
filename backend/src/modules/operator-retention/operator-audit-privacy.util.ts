const DATA_URL_PATTERN = /data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/g;
const OPERATOR_SENSITIVE_ROUTE_FRAGMENTS = [
  '/handover',
  '/signature',
  '/operator/',
  '/document-extractions',
] as const;

/**
 * Best-effort sanitization for HTTP audit descriptions.
 * Prevents signature bitmaps and oversized payloads from landing in ActivityLog.
 */
export function sanitizeOperatorAuditDescription(
  description: string,
  routeOrUrl?: string | null,
): string {
  let out = description.replace(DATA_URL_PATTERN, '[signature-data-url]');
  if (routeOrUrl && isOperatorSensitiveRoute(routeOrUrl)) {
    out = out.replace(/\b\d{7,}\b/g, (m) => `[${m.length}-digit]`);
  }
  return out;
}

export function sanitizeOperatorAuditRoute(url: string): string {
  if (!url) return url;
  const [path, query] = url.split('?', 2);
  if (!query) return path;
  const params = new URLSearchParams(query);
  for (const key of [...params.keys()]) {
    if (isSensitiveQueryParam(key)) {
      params.set(key, '[redacted]');
    }
  }
  const rebuilt = params.toString();
  return rebuilt ? `${path}?${rebuilt}` : path;
}

function isOperatorSensitiveRoute(routeOrUrl: string): boolean {
  const lower = routeOrUrl.toLowerCase();
  return OPERATOR_SENSITIVE_ROUTE_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

function isSensitiveQueryParam(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.includes('signature') ||
    k.includes('token') ||
    k.includes('email') ||
    k.includes('phone') ||
    k.includes('iban')
  );
}
