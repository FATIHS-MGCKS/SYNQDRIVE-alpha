import {
  assessObdDtcValue,
  assessProviderTimestamp,
  allowsConfirmedClear,
} from './dtc-payload-validation';

describe('dtc-payload-validation', () => {
  it('classifies explicit empty array as VALID_EMPTY', () => {
    const a = assessObdDtcValue([]);
    expect(a.valueClass).toBe('VALID_EMPTY');
    expect(allowsConfirmedClear(a)).toBe(true);
  });

  it('rejects ambiguous empty string', () => {
    expect(assessObdDtcValue('').valueClass).toBe('INVALID');
    expect(assessObdDtcValue('   ').valueClass).toBe('INVALID');
  });

  it('rejects object and number payloads', () => {
    expect(assessObdDtcValue({ P0301: true }).valueClass).toBe('INVALID');
    expect(assessObdDtcValue(42).valueClass).toBe('INVALID');
    expect(assessObdDtcValue(false).valueClass).toBe('INVALID');
  });

  it('rejects malformed JSON string', () => {
    expect(assessObdDtcValue('[P0301,').valueClass).toBe('INVALID');
  });

  it('classifies all-invalid tokens as PARTIAL (no confirmed clear)', () => {
    const a = assessObdDtcValue(['not-a-dtc', 'garbage']);
    expect(a.valueClass).toBe('PARTIAL');
    expect(allowsConfirmedClear(a)).toBe(false);
  });

  it('classifies mixed valid/invalid array as PARTIAL', () => {
    const a = assessObdDtcValue(['P0301', 'not-a-dtc']);
    expect(a.valueClass).toBe('PARTIAL');
    expect(a.codes).toEqual([]);
  });

  it('rejects future provider timestamps', () => {
    const now = new Date('2026-10-15T12:00:00Z');
    const r = assessProviderTimestamp('2026-10-15T14:00:00Z', now);
    expect(r.class).toBe('FUTURE');
  });
});
