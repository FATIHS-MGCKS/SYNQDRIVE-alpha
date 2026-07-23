/** Canonical persistence unit for license holding duration is total months. */

export interface LicenseHoldingParts {
  wholeYears: number;
  extraMonths: number;
}

export function splitLicenseHoldingMonths(totalMonths: number): LicenseHoldingParts {
  const normalized = Math.trunc(totalMonths);
  return {
    wholeYears: Math.floor(normalized / 12),
    extraMonths: normalized % 12,
  };
}

export function combineLicenseHoldingMonths(wholeYears: number, extraMonths: number): number {
  return Math.trunc(wholeYears) * 12 + Math.trunc(extraMonths);
}

export function formatLicenseHoldingDuration(
  totalMonths: number | null | undefined,
  options?: { long?: boolean },
): string {
  if (totalMonths == null) return '—';
  const { wholeYears, extraMonths } = splitLicenseHoldingMonths(totalMonths);
  const yearWord = (count: number) =>
    options?.long ? (count === 1 ? 'year' : 'years') : 'yr';
  const monthWord = (count: number) =>
    options?.long ? (count === 1 ? 'month' : 'months') : 'mo';

  if (wholeYears === 0) {
    return `${extraMonths} ${monthWord(extraMonths)}`;
  }
  if (extraMonths === 0) {
    return `${wholeYears} ${yearWord(wholeYears)}`;
  }
  return `${wholeYears} ${yearWord(wholeYears)} ${extraMonths} ${monthWord(extraMonths)}`;
}
