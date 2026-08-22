import { normalizePhone } from '@modules/customers/utils/customer-normalizer.util';

const DE_COUNTRY_CODE = '49';

/**
 * Shared Communication Center phone normalization.
 * Reuses customer normalizer (digits only) with conservative DE national handling.
 * Does not mutate provider-native stored values.
 */
export function normalizeCommunicationPhone(input?: string | null): string | null {
  if (!input) return null;
  let digits = input.trim();
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);

  const normalized = normalizePhone(digits);
  if (!normalized) return null;

  if (normalized.startsWith('0') && normalized.length >= 10 && normalized.length <= 12) {
    return DE_COUNTRY_CODE + normalized.slice(1);
  }

  return normalized;
}
