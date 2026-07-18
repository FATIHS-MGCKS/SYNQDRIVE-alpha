import { evaluateGeofenceShadow } from './station-geofence-shadow.util';

describe('evaluateGeofenceShadow', () => {
  it('returns HOME when vehicle is inside radius (GEO-03)', () => {
    const result = evaluateGeofenceShadow({
      stationLatitude: 52.52,
      stationLongitude: 13.405,
      radiusMeters: 500,
      vehicleLatitude: 52.5201,
      vehicleLongitude: 13.4051,
    });
    expect(result.state).toBe('HOME');
    expect(result.distanceMeters).not.toBeNull();
  });

  it('returns UNKNOWN without coordinates', () => {
    expect(
      evaluateGeofenceShadow({
        stationLatitude: null,
        stationLongitude: null,
        radiusMeters: 100,
        vehicleLatitude: 52.52,
        vehicleLongitude: 13.4,
      }).state,
    ).toBe('UNKNOWN');
  });
});
