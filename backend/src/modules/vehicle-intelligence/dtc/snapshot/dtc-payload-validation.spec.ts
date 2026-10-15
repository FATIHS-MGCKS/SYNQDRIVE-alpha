import {
  assessObdDtcValue,
  assessProviderTimestamp,
  allowsConfirmedClear,
} from './dtc-payload-validation';

describe('dtc-payload-validation', () => {
  it('classifies explicit empty list as VALID_EMPTY', () => {
    const a = assessObdDtcValue([]);
    expect(a.valueClass).toBe('VALID_EMPTY');
    expect(allowsConfirmedClear(a)).toBe(true);
  });

  it('classifies all-invalid tokens as PARTIAL (no confirmed clear)', () => {
    const a = assessObdDtcValue(['not-a-dtc', 'garbage']);
    expect(a.valueClass).toBe('PARTIAL');
    expect(allowsConfirmedClear(a)).toBe(false);
  });

  it('rejects future provider timestamps', () => {
    const now = new Date('2026-10-15T12:00:00Z');
    const r = assessProviderTimestamp('2026-10-15T14:00:00Z', now);
    expect(r.class).toBe('FUTURE');
  });
});
