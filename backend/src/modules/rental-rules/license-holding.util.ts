/** Canonical persistence unit for license holding duration is total months. */

export interface LicenseHoldingParts {
  wholeYears: number;
  extraMonths: number;
}

export function splitLicenseHoldingMonths(totalMonths: number): LicenseHoldingParts {
  if (!Number.isFinite(totalMonths) || totalMonths < 0) {
    throw new Error('License holding months must be a non-negative number');
  }
  const normalized = Math.trunc(totalMonths);
  return {
    wholeYears: Math.floor(normalized / 12),
    extraMonths: normalized % 12,
  };
}

export function combineLicenseHoldingMonths(wholeYears: number, extraMonths: number): number {
  if (!Number.isFinite(wholeYears) || wholeYears < 0 || wholeYears > 80) {
    throw new Error('License holding whole years must be between 0 and 80');
  }
  if (!Number.isFinite(extraMonths) || extraMonths < 0 || extraMonths > 11) {
    throw new Error('License holding extra months must be between 0 and 11');
  }
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

export function licenseHoldingMonthsFromYearsAlias(wholeYears: number): number {
  return combineLicenseHoldingMonths(wholeYears, 0);
}

export function isLicenseHoldingMonthsPreserved(
  before: number | null | undefined,
  after: number | null | undefined,
): boolean {
  return before === after;
}

/** Records whose month values are not whole-year multiples (safe under month-canonical storage). */
export function findNonWholeYearLicenseHoldingRecords<
  T extends { id: string; minimumLicenseHoldingMonths: number | null },
>(records: T[]): T[] {
  return records.filter(
    (row) => row.minimumLicenseHoldingMonths != null && row.minimumLicenseHoldingMonths % 12 !== 0,
  );
}
