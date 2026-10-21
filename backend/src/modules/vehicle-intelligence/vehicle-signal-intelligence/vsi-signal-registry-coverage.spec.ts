import { buildVsiSignalRegistryCoverageMatrix } from './vsi-signal-registry-coverage';

describe('vsi-signal-registry-coverage', () => {
  it('separates catalog support from empirical extractor for materialized keys', () => {
    const rows = buildVsiSignalRegistryCoverageMatrix();
    const position = rows.find((r) => r.canonicalSignalKey === 'position_coordinates');
    const catalogOnly = rows.find((r) => r.canonicalSignalKey === 'trip_activity');
    expect(position?.materializationEnabled).toBe(true);
    expect(position?.empiricalExtractorImplemented).toBe(true);
    expect(position?.historicalQualityAvailable).toBe(false);
    expect(catalogOnly?.materializationEnabled).toBe(false);
    expect(catalogOnly?.empiricalExtractorImplemented).toBe(false);
  });

  it('marks bundle timestamp as sole historical quality axis', () => {
    const rows = buildVsiSignalRegistryCoverageMatrix();
    const bundle = rows.find((r) => r.canonicalSignalKey === 'provider_source_timestamp');
    expect(bundle?.historicalQualityAvailable).toBe(true);
    const lv = rows.find((r) => r.canonicalSignalKey === 'lv_voltage');
    expect(lv?.historicalQualityAvailable).toBe(false);
  });
});
