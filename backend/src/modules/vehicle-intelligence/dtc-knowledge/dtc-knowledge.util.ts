/**
 * DTC code normalization + best-effort classification.
 *
 * Pure functions — no I/O, no AI. Used by the knowledge service to decide
 * whether a code is worth enriching and to pre-fill structural fields.
 */

export type DtcSystemCategory = 'POWERTRAIN' | 'BODY' | 'CHASSIS' | 'NETWORK' | 'UNKNOWN';
export type DtcStandardType = 'GENERIC' | 'MANUFACTURER_SPECIFIC' | 'UNKNOWN';

/** Valid OBD-II DTC: first char P/B/C/U + 4 alphanumeric characters. */
const DTC_PATTERN = /^[PBCU][0-9A-Z]{4}$/;

/**
 * Normalizes a raw DTC string:
 *  - trims, uppercases, removes ALL internal whitespace ("p 0675" → "P0675")
 *  - validates the canonical pattern
 * Returns the normalized code, or `null` if it is not a valid DTC (callers must
 * NOT enrich / call AI for null results).
 */
export function normalizeDtcCode(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!DTC_PATTERN.test(cleaned)) return null;
  return cleaned;
}

export function isValidDtcCode(raw: string | null | undefined): boolean {
  return normalizeDtcCode(raw) !== null;
}

/** System category from the first character. */
export function getDtcSystemCategory(normalizedCode: string): DtcSystemCategory {
  switch (normalizedCode?.charAt(0)?.toUpperCase()) {
    case 'P':
      return 'POWERTRAIN';
    case 'B':
      return 'BODY';
    case 'C':
      return 'CHASSIS';
    case 'U':
      return 'NETWORK';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Best-effort generic vs manufacturer-specific classification from the second
 * character. This is intentionally conservative — it is a hint, not a guarantee:
 *  - x0xxx → usually GENERIC (SAE-defined)
 *  - x1xxx → usually MANUFACTURER_SPECIFIC
 *  - anything else (2/3/…) → UNKNOWN
 */
export function getDtcStandardType(normalizedCode: string): DtcStandardType {
  const second = normalizedCode?.charAt(1);
  if (second === '0') return 'GENERIC';
  if (second === '1') return 'MANUFACTURER_SPECIFIC';
  return 'UNKNOWN';
}
