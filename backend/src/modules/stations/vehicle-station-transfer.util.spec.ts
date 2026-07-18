import {
  canTransitionVehicleStationTransfer,
  evaluatePlanVehicleStationTransfer,
  evaluateTransferTransition,
  isActiveVehicleStationTransferStatus,
  shouldClearExpectedOnTransferCancel,
} from './vehicle-station-transfer.util';

const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = '2026-07-18T12:00:00.000Z';

describe('vehicle-station-transfer.util', () => {
  describe('canTransitionVehicleStationTransfer', () => {
    it('allows planned to ready, in transit, or cancelled', () => {
      expect(canTransitionVehicleStationTransfer('PLANNED', 'READY')).toBe(true);
      expect(canTransitionVehicleStationTransfer('PLANNED', 'IN_TRANSIT')).toBe(true);
      expect(canTransitionVehicleStationTransfer('PLANNED', 'CANCELLED')).toBe(true);
    });

    it('allows in transit to arrived, overdue, or cancelled', () => {
      expect(canTransitionVehicleStationTransfer('IN_TRANSIT', 'ARRIVED')).toBe(true);
      expect(canTransitionVehicleStationTransfer('IN_TRANSIT', 'OVERDUE')).toBe(true);
    });

    it('rejects invalid transitions', () => {
      expect(canTransitionVehicleStationTransfer('ARRIVED', 'PLANNED')).toBe(false);
      expect(canTransitionVehicleStationTransfer('CANCELLED', 'IN_TRANSIT')).toBe(false);
    });

    it('is idempotent for same status', () => {
      expect(canTransitionVehicleStationTransfer('PLANNED', 'PLANNED')).toBe(true);
    });
  });

  describe('isActiveVehicleStationTransferStatus', () => {
    it('treats planned through overdue as active except arrived and cancelled', () => {
      expect(isActiveVehicleStationTransferStatus('PLANNED')).toBe(true);
      expect(isActiveVehicleStationTransferStatus('READY')).toBe(true);
      expect(isActiveVehicleStationTransferStatus('IN_TRANSIT')).toBe(true);
      expect(isActiveVehicleStationTransferStatus('OVERDUE')).toBe(true);
      expect(isActiveVehicleStationTransferStatus('ARRIVED')).toBe(false);
      expect(isActiveVehicleStationTransferStatus('CANCELLED')).toBe(false);
    });
  });

  describe('evaluatePlanVehicleStationTransfer', () => {
    it('blocks when another active transfer exists', () => {
      const result = evaluatePlanVehicleStationTransfer({
        organizationId: 'org-transfer',
        vehicleId: 'vehicle-1',
        fromStationId: STATION_A,
        toStationId: STATION_B,
        toStationStatus: 'ACTIVE',
        activeTransferCount: 1,
        plannedAt: NOW,
      });

      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe('VEHICLE_STATION_TRANSFER_ACTIVE_EXISTS');
    });

    it('blocks same from and to station', () => {
      const result = evaluatePlanVehicleStationTransfer({
        organizationId: 'org-transfer',
        vehicleId: 'vehicle-1',
        fromStationId: STATION_A,
        toStationId: STATION_A,
        toStationStatus: 'ACTIVE',
        activeTransferCount: 0,
        plannedAt: NOW,
      });

      expect(result.allowed).toBe(false);
    });
  });

  describe('evaluateTransferTransition', () => {
    const baseTransfer = {
      status: 'IN_TRANSIT' as const,
      toStationId: STATION_B,
    };

    it('marks arrive as setting current and clearing expected when destination matches', () => {
      const result = evaluateTransferTransition({
        transfer: baseTransfer,
        targetStatus: 'ARRIVED',
        vehicle: {
          expectedStationId: STATION_B,
          expectedStationSource: 'TRANSFER',
          currentStationId: STATION_A,
        },
        otherActiveTransferCount: 0,
        performedAt: NOW,
      });

      expect(result.allowed).toBe(true);
      expect(result.shouldSetCurrent).toBe(true);
      expect(result.shouldClearExpected).toBe(true);
    });

    it('blocks arrive when expected destination differs', () => {
      const result = evaluateTransferTransition({
        transfer: baseTransfer,
        targetStatus: 'ARRIVED',
        vehicle: {
          expectedStationId: STATION_A,
          expectedStationSource: 'TRANSFER',
          currentStationId: STATION_A,
        },
        otherActiveTransferCount: 0,
        performedAt: NOW,
      });

      expect(result.allowed).toBe(false);
    });

    it('is idempotent when status unchanged', () => {
      const result = evaluateTransferTransition({
        transfer: { status: 'PLANNED', toStationId: STATION_B },
        targetStatus: 'PLANNED',
        vehicle: {
          expectedStationId: STATION_B,
          expectedStationSource: 'TRANSFER',
          currentStationId: STATION_A,
        },
        otherActiveTransferCount: 0,
        performedAt: NOW,
      });

      expect(result.idempotent).toBe(true);
    });
  });

  describe('shouldClearExpectedOnTransferCancel', () => {
    it('clears only when transfer-owned expected has no other active context', () => {
      expect(
        shouldClearExpectedOnTransferCancel({
          vehicleExpectedStationId: STATION_B,
          vehicleExpectedStationSource: 'TRANSFER',
          transferToStationId: STATION_B,
          otherActiveTransferCount: 0,
        }),
      ).toBe(true);
    });

    it('keeps expected when source is not transfer', () => {
      expect(
        shouldClearExpectedOnTransferCancel({
          vehicleExpectedStationId: STATION_B,
          vehicleExpectedStationSource: 'RETURN',
          transferToStationId: STATION_B,
          otherActiveTransferCount: 0,
        }),
      ).toBe(false);
    });

    it('keeps expected when another active transfer exists', () => {
      expect(
        shouldClearExpectedOnTransferCancel({
          vehicleExpectedStationId: STATION_B,
          vehicleExpectedStationSource: 'TRANSFER',
          transferToStationId: STATION_B,
          otherActiveTransferCount: 1,
        }),
      ).toBe(false);
    });
  });
});
