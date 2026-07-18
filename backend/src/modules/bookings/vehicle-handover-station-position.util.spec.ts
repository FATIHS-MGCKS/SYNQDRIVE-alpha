import {
  buildHandoverPickupPositionWriteData,
  buildHandoverReturnPositionWriteData,
  isPickupCurrentPositionAlreadyApplied,
  isReturnCurrentPositionAlreadyApplied,
  shouldClearExpectedStationOnReturn,
} from './vehicle-handover-station-position.util';

const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('vehicle-handover-station-position.util', () => {
  describe('isPickupCurrentPositionAlreadyApplied', () => {
    it('is true when current position is cleared', () => {
      expect(
        isPickupCurrentPositionAlreadyApplied({
          currentStationId: null,
          currentStationSource: null,
        }),
      ).toBe(true);
    });

    it('is false when a current station is still set', () => {
      expect(
        isPickupCurrentPositionAlreadyApplied({
          currentStationId: STATION_A,
          currentStationSource: 'MANUAL',
        }),
      ).toBe(false);
    });
  });

  describe('isReturnCurrentPositionAlreadyApplied', () => {
    it('is true when current already matches return station with RETURN source', () => {
      expect(
        isReturnCurrentPositionAlreadyApplied(
          { currentStationId: STATION_B, currentStationSource: 'RETURN' },
          STATION_B,
        ),
      ).toBe(true);
    });

    it('is false when current differs or source is not RETURN', () => {
      expect(
        isReturnCurrentPositionAlreadyApplied(
          { currentStationId: STATION_A, currentStationSource: 'MANUAL' },
          STATION_B,
        ),
      ).toBe(false);
    });
  });

  describe('shouldClearExpectedStationOnReturn', () => {
    it('clears expected only when actual return fulfills the expected destination', () => {
      expect(
        shouldClearExpectedStationOnReturn({
          expectedStationId: STATION_B,
          actualReturnStationId: STATION_B,
        }),
      ).toBe(true);
    });

    it('keeps expected when actual return differs from expected destination', () => {
      expect(
        shouldClearExpectedStationOnReturn({
          expectedStationId: STATION_B,
          actualReturnStationId: STATION_A,
        }),
      ).toBe(false);
    });
  });

  describe('buildHandoverPickupPositionWriteData', () => {
    it('clears current provenance and increments version', () => {
      expect(buildHandoverPickupPositionWriteData()).toEqual({
        currentStationId: null,
        currentStationSource: null,
        currentStationConfirmedAt: null,
        currentStationConfirmedByUserId: null,
        stationPositionVersion: { increment: 1 },
      });
    });
  });

  describe('buildHandoverReturnPositionWriteData', () => {
    it('sets RETURN provenance without clearing expected by default', () => {
      const confirmedAt = new Date('2026-07-18T12:00:00.000Z');
      expect(
        buildHandoverReturnPositionWriteData({
          actualStationId: STATION_B,
          performedByUserId: 'user-1',
          confirmedAt,
          clearExpected: false,
        }),
      ).toEqual({
        currentStationId: STATION_B,
        currentStationSource: 'RETURN',
        currentStationConfirmedAt: confirmedAt,
        currentStationConfirmedByUserId: 'user-1',
        stationPositionVersion: { increment: 1 },
      });
    });

    it('clears expected metadata when destination is fulfilled', () => {
      expect(
        buildHandoverReturnPositionWriteData({
          actualStationId: STATION_B,
          clearExpected: true,
        }),
      ).toEqual(
        expect.objectContaining({
          currentStationId: STATION_B,
          expectedStationId: null,
          expectedStationSource: null,
          expectedStationSetAt: null,
        }),
      );
    });
  });
});
