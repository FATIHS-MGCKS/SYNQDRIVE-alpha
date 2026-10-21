import {
  parseStrictBooleanEnv,
  parseStrictPositiveIntEnv,
} from '@config/charging-station-enrichment.config';
import {
  hasValidChargingStationEnrichmentCutover,
  isChargingStationEnrichmentEventAfterCutover,
} from './charging-station-enrichment-cutover.util';

describe('charging-station-enrichment cutover (T1–T10)', () => {
  it('T1–T3: strict boolean defaults and malformed', () => {
    expect(parseStrictBooleanEnv(undefined, false)).toBe(false);
    expect(parseStrictBooleanEnv('false', false)).toBe(false);
    expect(parseStrictBooleanEnv('1', false)).toBe(false);
    expect(parseStrictBooleanEnv('true', false)).toBe(true);
  });

  it('T4–T5: cutover missing/invalid blocks', () => {
    expect(hasValidChargingStationEnrichmentCutover({ cutoverAt: null, cutoverState: 'missing' })).toBe(
      false,
    );
    expect(hasValidChargingStationEnrichmentCutover({ cutoverAt: null, cutoverState: 'invalid' })).toBe(
      false,
    );
  });

  it('T6–T8: endTime cutover boundary', () => {
    const cutover = new Date('2026-09-01T00:00:00.000Z');
    expect(isChargingStationEnrichmentEventAfterCutover(new Date('2026-08-31T23:59:59.999Z'), cutover)).toBe(
      false,
    );
    expect(isChargingStationEnrichmentEventAfterCutover(new Date('2026-09-01T00:00:00.000Z'), cutover)).toBe(
      true,
    );
    expect(isChargingStationEnrichmentEventAfterCutover(new Date('2026-09-02T00:00:00.000Z'), cutover)).toBe(
      true,
    );
  });

  it('T9: createdAt after cutover but end before still blocked via endTime gate', () => {
    const cutover = new Date('2026-09-01T00:00:00.000Z');
    const endBefore = new Date('2026-08-15T00:00:00.000Z');
    expect(isChargingStationEnrichmentEventAfterCutover(endBefore, cutover)).toBe(false);
  });

  it('strict integer rejects partial/unsafe values', () => {
    expect(parseStrictPositiveIntEnv('10.5', 5)).toBe(5);
    expect(parseStrictPositiveIntEnv('abc', 5)).toBe(5);
    expect(parseStrictPositiveIntEnv('25', 5)).toBe(25);
  });
});
