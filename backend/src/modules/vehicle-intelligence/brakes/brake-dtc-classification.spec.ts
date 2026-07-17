import {
  buildBrakeDtcDedupeKey,
  classifyBrakeDtc,
  isActiveBrakeDtcEvidenceRow,
  isBrakeDtcEvidenceRelevant,
  resolveBrakeDtcFreshness,
} from './brake-dtc-classification';

describe('brake-dtc-classification', () => {
  it('classifies ABS wheel-speed codes', () => {
    const result = classifyBrakeDtc('C0035');
    expect(result?.category).toBe('ABS');
    expect(result?.severity).toBe('WARNING');
    expect(isBrakeDtcEvidenceRelevant(result!.category)).toBe(true);
  });

  it('classifies ESC stability codes', () => {
    const result = classifyBrakeDtc('C0455');
    expect(result?.category).toBe('ESC');
    expect(result?.safetyClassified).toBe(true);
  });

  it('classifies generic brake system pressure codes', () => {
    const result = classifyBrakeDtc('C1220');
    expect(result?.category).toBe('BRAKE_SYSTEM');
    expect(result?.severity).toBe('CRITICAL');
  });

  it('marks powertrain glow-plug codes as not brake related', () => {
    const result = classifyBrakeDtc('P0675');
    expect(result?.category).toBe('NOT_BRAKE_RELATED');
    expect(isBrakeDtcEvidenceRelevant(result!.category)).toBe(false);
  });

  it('requires review for unknown chassis codes without exact mapping', () => {
    const result = classifyBrakeDtc('C1999');
    expect(result?.category).toBe('BRAKE_SYSTEM');
    expect(result?.reviewRequired).toBe(true);
    expect(result?.severity).toBe('WARNING');
    expect(result?.safetyClassified).toBe(false);
  });

  it('normalizes free-text severity without using description text', () => {
    const result = classifyBrakeDtc('C0265', { eventSeverity: 'safety_critical' });
    expect(result?.severity).toBe('CRITICAL');
  });

  it('builds stable dedupe keys from normalized codes', () => {
    expect(buildBrakeDtcDedupeKey('C0035')).toBe('dtc:C0035');
  });

  it('excludes cleared or stale DTC evidence rows from active health', () => {
    expect(
      isActiveBrakeDtcEvidenceRow({
        source: 'DTC_SIGNAL',
        dtcActive: false,
        dtcSeverity: 'WARNING',
      }),
    ).toBe(false);
    expect(
      isActiveBrakeDtcEvidenceRow({
        source: 'DTC_SIGNAL',
        dtcActive: true,
        dtcFreshness: 'STALE',
        dtcSeverity: 'WARNING',
      }),
    ).toBe(false);
    expect(
      isActiveBrakeDtcEvidenceRow({
        source: 'DTC_SIGNAL',
        dtcActive: true,
        dtcFreshness: 'FRESH',
        dtcSeverity: 'WARNING',
      }),
    ).toBe(true);
  });

  it('resolves freshness from last successful DTC poll', () => {
    const fresh = resolveBrakeDtcFreshness({
      lastSuccessfulCheckAt: new Date(Date.now() - 60_000),
    });
    const stale = resolveBrakeDtcFreshness({
      lastSuccessfulCheckAt: new Date(Date.now() - 7 * 60 * 60_000),
    });
    expect(fresh).toBe('FRESH');
    expect(stale).toBe('STALE');
  });
});
