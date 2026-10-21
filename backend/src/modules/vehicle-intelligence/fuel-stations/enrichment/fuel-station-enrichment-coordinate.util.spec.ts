import { deriveCanonicalFuelStationCoordinate } from './fuel-station-enrichment-coordinate.util';

describe('fuel-station-enrichment-coordinate.util', () => {
  it('uses startLatitude/startLongitude', () => {
    const result = deriveCanonicalFuelStationCoordinate({
      startLatitude: 51.31,
      startLongitude: 9.49,
    });
    expect(result).toEqual({
      latitude: 51.31,
      longitude: 9.49,
      source: 'energy_event_start',
    });
  });

  it('returns null when coordinates missing', () => {
    expect(
      deriveCanonicalFuelStationCoordinate({ startLatitude: null, startLongitude: 9.49 }),
    ).toBeNull();
  });
});
