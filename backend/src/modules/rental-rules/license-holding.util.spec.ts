import {
  combineLicenseHoldingMonths,
  findNonWholeYearLicenseHoldingRecords,
  formatLicenseHoldingDuration,
  licenseHoldingMonthsFromYearsAlias,
  splitLicenseHoldingMonths,
} from './license-holding.util';

describe('license-holding.util', () => {
  it.each([
    [18, { wholeYears: 1, extraMonths: 6 }],
    [6, { wholeYears: 0, extraMonths: 6 }],
    [24, { wholeYears: 2, extraMonths: 0 }],
    [0, { wholeYears: 0, extraMonths: 0 }],
  ])('splits %i months losslessly', (months, expected) => {
    expect(splitLicenseHoldingMonths(months)).toEqual(expected);
    expect(combineLicenseHoldingMonths(expected.wholeYears, expected.extraMonths)).toBe(months);
  });

  it('formats mixed durations readably', () => {
    expect(formatLicenseHoldingDuration(18, { long: true })).toBe('1 year 6 months');
    expect(formatLicenseHoldingDuration(6, { long: true })).toBe('6 months');
    expect(formatLicenseHoldingDuration(24, { long: true })).toBe('2 years');
  });

  it('maps whole-year API alias without rounding drift', () => {
    expect(licenseHoldingMonthsFromYearsAlias(2)).toBe(24);
  });

  it('detects persisted values that are not whole-year multiples', () => {
    const rows = findNonWholeYearLicenseHoldingRecords([
      { id: 'a', minimumLicenseHoldingMonths: 18 },
      { id: 'b', minimumLicenseHoldingMonths: 24 },
      { id: 'c', minimumLicenseHoldingMonths: null },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['a']);
  });
});
