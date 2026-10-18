import { validateResearchOsmBbox } from '../di-v0-s4-research-overpass.client';

describe('validateResearchOsmBbox', () => {
  it('rejects corridors exceeding configured span (long-trip partial analysis contract)', () => {
    const reason = validateResearchOsmBbox(
      { south: 48.0, west: 11.0, north: 49.5, east: 12.0 },
      0.25,
    );
    expect(reason).toBe('BBOX_TOO_LARGE');
  });

  it('accepts bounded corridor', () => {
    const reason = validateResearchOsmBbox(
      { south: 48.13, west: 11.58, north: 48.14, east: 11.59 },
      0.25,
    );
    expect(reason).toBeNull();
  });
});
