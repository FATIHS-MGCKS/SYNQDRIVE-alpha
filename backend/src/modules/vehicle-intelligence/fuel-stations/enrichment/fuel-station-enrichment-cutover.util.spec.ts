import {
  describeFuelStationEnrichmentCutoverMisconfiguration,
  hasValidFuelStationEnrichmentCutover,
  isFuelStationEnrichmentEventAfterCutover,
} from './fuel-station-enrichment-cutover.util';

describe('fuel-station-enrichment-cutover.util', () => {
  const cutoverAt = new Date('2026-09-01T00:00:00.000Z');

  it('uses event startTime as cutover authority', () => {
    expect(
      isFuelStationEnrichmentEventAfterCutover(new Date('2026-08-20T10:00:00.000Z'), cutoverAt),
    ).toBe(false);
    expect(
      isFuelStationEnrichmentEventAfterCutover(new Date('2026-09-02T10:00:00.000Z'), cutoverAt),
    ).toBe(true);
  });

  it('fails closed when cutover is missing', () => {
    expect(
      isFuelStationEnrichmentEventAfterCutover(new Date('2026-09-02T10:00:00.000Z'), null),
    ).toBe(false);
    expect(hasValidFuelStationEnrichmentCutover({ cutoverAt: null, cutoverState: 'missing' })).toBe(
      false,
    );
  });

  it('describes invalid cutover configuration', () => {
    expect(describeFuelStationEnrichmentCutoverMisconfiguration('invalid')).toContain('invalid');
    expect(describeFuelStationEnrichmentCutoverMisconfiguration('missing')).toContain('missing');
  });
});
