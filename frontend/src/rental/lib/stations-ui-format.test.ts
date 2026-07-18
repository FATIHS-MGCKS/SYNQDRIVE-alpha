import { describe, expect, it } from 'vitest';
import {
  formatStationCount,
  formatStationMetricValue,
  resolveStationNumberFormatLocale,
} from './stations-ui-format';

describe('stations-ui-format', () => {
  it('resolves German and English locales', () => {
    expect(resolveStationNumberFormatLocale('de')).toBe('de-DE');
    expect(resolveStationNumberFormatLocale('en-US')).toBe('en-GB');
  });

  it('formats counts with locale grouping', () => {
    expect(formatStationCount(1234, 'de')).toBe('1.234');
    expect(formatStationCount(1234, 'en')).toBe('1,234');
  });

  it('preserves unknown sentinel', () => {
    expect(formatStationMetricValue('—', 'de')).toBe('—');
  });
});
