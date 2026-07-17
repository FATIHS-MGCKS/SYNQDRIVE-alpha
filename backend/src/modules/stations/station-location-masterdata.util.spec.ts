import { BadRequestException } from '@nestjs/common';
import { StationCoordinatesSource } from '@prisma/client';
import {
  assertValidGeofenceRadius,
  isAcceptableMapboxForwardGeocodeRelevance,
  isAcceptableMapboxSearchboxMatchType,
  MAPBOX_FORWARD_GEOCODE_RELEVANCE_MIN,
  normalizeGeofenceRadius,
  resolveStationCoordinatesProvenance,
  stationHasMissingCoordinates,
  STATION_GEOFENCE_RADIUS_MAX_M,
  STATION_GEOFENCE_RADIUS_MIN_M,
} from './station-location-masterdata.util';

describe('station-location-masterdata.util', () => {
  describe('stationHasMissingCoordinates', () => {
    it('returns true when either coordinate is missing', () => {
      expect(stationHasMissingCoordinates(null, 13)).toBe(true);
      expect(stationHasMissingCoordinates(52.5, null)).toBe(true);
      expect(stationHasMissingCoordinates(null, null)).toBe(true);
    });

    it('returns false when both coordinates are present', () => {
      expect(stationHasMissingCoordinates(52.5, 13.4)).toBe(false);
    });
  });

  describe('assertValidGeofenceRadius', () => {
    it('allows null and omitted radius', () => {
      expect(() => assertValidGeofenceRadius(null)).not.toThrow();
      expect(() => assertValidGeofenceRadius(undefined)).not.toThrow();
    });

    it('rejects out-of-range radius', () => {
      expect(() => assertValidGeofenceRadius(10)).toThrow(BadRequestException);
      expect(() => assertValidGeofenceRadius(9000)).toThrow(BadRequestException);
    });

    it('normalizes valid radius', () => {
      expect(normalizeGeofenceRadius(100.6)).toBe(101);
      expect(STATION_GEOFENCE_RADIUS_MIN_M).toBe(25);
      expect(STATION_GEOFENCE_RADIUS_MAX_M).toBe(5000);
    });
  });

  describe('Mapbox relevance guards', () => {
    it('rejects low forward-geocode relevance', () => {
      expect(isAcceptableMapboxForwardGeocodeRelevance(0.49)).toBe(false);
      expect(isAcceptableMapboxForwardGeocodeRelevance(0.5)).toBe(true);
      expect(MAPBOX_FORWARD_GEOCODE_RELEVANCE_MIN).toBe(0.5);
    });

    it('rejects low searchbox match types', () => {
      expect(isAcceptableMapboxSearchboxMatchType('fallback')).toBe(false);
      expect(isAcceptableMapboxSearchboxMatchType('exact')).toBe(true);
    });
  });

  describe('resolveStationCoordinatesProvenance', () => {
    it('marks explicit coordinates as manual with confirmedAt', () => {
      const result = resolveStationCoordinatesProvenance({ explicitCoordinates: true });
      expect(result.coordinatesSource).toBe(StationCoordinatesSource.MANUAL);
      expect(result.coordinatesConfirmedAt).toBeInstanceOf(Date);
    });

    it('marks forward geocode as unconfirmed', () => {
      const result = resolveStationCoordinatesProvenance({ geocodedCoordinates: true });
      expect(result.coordinatesSource).toBe(StationCoordinatesSource.FORWARD_GEOCODE);
      expect(result.coordinatesConfirmedAt).toBeNull();
    });

    it('clears provenance when coordinates are cleared', () => {
      const result = resolveStationCoordinatesProvenance({ coordinatesCleared: true });
      expect(result).toEqual({
        coordinatesSource: null,
        coordinatesConfirmedAt: null,
      });
    });
  });
});
