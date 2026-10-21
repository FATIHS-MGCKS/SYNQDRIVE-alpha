import {
  buildFuelStationEnrichmentInputFingerprint,
  buildFuelStationEnrichmentJobIdempotencyKey,
} from './fuel-station-enrichment-fingerprint.util';

describe('fuel-station-enrichment-fingerprint', () => {
  it('is deterministic for same input', () => {
    const a = buildFuelStationEnrichmentInputFingerprint({
      energyEventId: 'evt-1',
      latitude: 51.3127,
      longitude: 9.4797,
    });
    const b = buildFuelStationEnrichmentInputFingerprint({
      energyEventId: 'evt-1',
      latitude: 51.3127,
      longitude: 9.4797,
    });
    expect(a).toBe(b);
  });

  it('changes when coordinates change', () => {
    const a = buildFuelStationEnrichmentInputFingerprint({
      energyEventId: 'evt-1',
      latitude: 51.3127,
      longitude: 9.4797,
    });
    const b = buildFuelStationEnrichmentInputFingerprint({
      energyEventId: 'evt-1',
      latitude: 51.3128,
      longitude: 9.4797,
    });
    expect(a).not.toBe(b);
  });

  it('builds job idempotency key from event + fingerprint', () => {
    expect(
      buildFuelStationEnrichmentJobIdempotencyKey({
        energyEventId: 'evt-1',
        inputFingerprint: 'abc123',
      }),
    ).toBe('evt-1:abc123');
  });
});
