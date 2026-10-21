import { MapboxService } from './mapbox.service';

describe('MapboxService matching response handling', () => {
  const service = new MapboxService();

  it('selects highest-confidence matching when multiple are returned', () => {
    const selected = (service as any).selectCanonicalMatching([
      { confidence: 0.4, distance: 1000 },
      { confidence: 0.9, distance: 800 },
      { confidence: 0.7, distance: 1200 },
    ]);

    expect(selected.confidence).toBe(0.9);
  });

  it('tie-breaks multiple matchings by distance', () => {
    const selected = (service as any).selectCanonicalMatching([
      { confidence: 0.8, distance: 900 },
      { confidence: 0.8, distance: 1200 },
    ]);

    expect(selected.distance).toBe(1200);
  });
});
