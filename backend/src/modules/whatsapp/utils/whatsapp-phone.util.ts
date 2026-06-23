import { normalizePhone } from '@modules/customers/utils/customer-normalizer.util';

const DE_COUNTRY_CODE = '49';

/**
 * Normalize a phone number for storage and matching.
 * Reuses customer normalizer (digits only) and applies conservative DE handling.
 */
export function normalizePhoneNumber(input?: string | null): string | null {
  if (!input) return null;
  let digits = input.trim();
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);

  const normalized = normalizePhone(digits);
  if (!normalized) return null;

  // Conservative DE: leading 0 on national numbers → prepend 49 (no other magic)
  if (normalized.startsWith('0') && normalized.length >= 10 && normalized.length <= 12) {
    return DE_COUNTRY_CODE + normalized.slice(1);
  }

  return normalized;
}

/** Display-friendly E.164-ish format for outbound provider calls */
export function toE164Phone(normalized: string): string {
  return normalized.startsWith('+') ? normalized : `+${normalized}`;
}
