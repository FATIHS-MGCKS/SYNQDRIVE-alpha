import {
  inspectStationCoordinatePair,
  inspectStationOpeningHours,
  inspectStationTimezone,
  stationHasActiveCapabilities,
  collectScopeStationIdCandidates,
  isExpectedContextStillValid,
} from './stations-v2-diagnostic.util';
import { StationStatus } from '@prisma/client';

describe('stations-v2-diagnostic.util', () => {
  describe('inspectStationCoordinatePair', () => {
    it('accepts missing coordinates', () => {
      expect(inspectStationCoordinatePair(null, null).valid).toBe(true);
    });

    it('rejects partial coordinate pair', () => {
      const result = inspectStationCoordinatePair(52.5, null);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('STATION_COORDINATE_PAIR_REQUIRED');
    });

    it('rejects out-of-range latitude', () => {
      const result = inspectStationCoordinatePair(95, 10);
      expect(result.valid).toBe(false);
    });
  });

  describe('inspectStationTimezone', () => {
    it('accepts valid IANA timezone', () => {
      expect(inspectStationTimezone('Europe/Berlin').valid).toBe(true);
    });

    it('rejects invalid timezone', () => {
      expect(inspectStationTimezone('Not/AZone').valid).toBe(false);
    });
  });

  describe('inspectStationOpeningHours', () => {
    it('accepts null/undefined', () => {
      expect(inspectStationOpeningHours(null).valid).toBe(true);
    });
  });

  describe('stationHasActiveCapabilities', () => {
    it('flags archived station with pickup enabled', () => {
      expect(
        stationHasActiveCapabilities({
          status: StationStatus.ARCHIVED,
          pickupEnabled: true,
          returnEnabled: false,
        }),
      ).toBe(true);
    });

    it('ignores active station with capabilities', () => {
      expect(
        stationHasActiveCapabilities({
          status: StationStatus.ACTIVE,
          pickupEnabled: true,
          returnEnabled: true,
        }),
      ).toBe(false);
    });
  });

  describe('collectScopeStationIdCandidates', () => {
    it('collects UUIDs from stationIds json and legacy scope', () => {
      const ids = collectScopeStationIdCandidates({
        stationIds: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
        stationScope: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
      });
      expect(ids).toHaveLength(2);
    });

    it('ignores ALL scope sentinel', () => {
      const ids = collectScopeStationIdCandidates({ stationScope: 'ALL' });
      expect(ids).toHaveLength(0);
    });
  });

  describe('isExpectedContextStillValid', () => {
    it('returns true when active transfer matches expected', () => {
      expect(
        isExpectedContextStillValid({
          expectedStationId: 'station-1',
          activeTransferToStationId: 'station-1',
        }),
      ).toBe(true);
    });

    it('returns false without matching context', () => {
      expect(
        isExpectedContextStillValid({
          expectedStationId: 'station-1',
          activeTransferToStationId: 'station-2',
          activeBookingReturnStationId: 'station-3',
        }),
      ).toBe(false);
    });
  });
});
