/** Canonical DTC code pattern — OBD-II style P/B/C/U + 4 hex digits. */
export const DTC_CODE_PATTERN = /^[PBCU][0-9A-F]{4}$/;

/**
 * Normalize DIMO/webhook/poll DTC payloads to unique canonical codes (VW-F-007).
 */
export function normalizeDtcCodes(value: unknown): string[] {
  if (value === null || value === undefined) return [];

  let source: unknown = value;
  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        source = JSON.parse(trimmed);
      } catch {
        // fall through to comma-split
      }
    }
  }

  const tokens: string[] = Array.isArray(source)
    ? source.map((c) => (typeof c === 'string' ? c : String(c)))
    : typeof source === 'string'
      ? source.split(',')
      : [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    const code = sanitizeDtcCode(token);
    if (code && !seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

export function sanitizeDtcCode(raw: string): string | null {
  const cleaned = raw.replace(/["'[\]\s]/g, '').toUpperCase();
  return DTC_CODE_PATTERN.test(cleaned) ? cleaned : null;
}
