import {
  buildVehicleCorrectCurrentStationCommandAudit,
  evaluateCorrectVehicleCurrentStationCommand,
  isSameCurrentStationAssignment,
} from './vehicle-correct-current-station-command.util';
import {
  VehicleCorrectCurrentStationCommandIssueCode,
  VehicleCorrectCurrentStationCommandName,
  VehicleCorrectCurrentStationCommandOutcome,
} from './vehicle-correct-current-station-command.types';

describe('vehicle-correct-current-station-command.util', () => {
  const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  describe('isSameCurrentStationAssignment', () => {
    it('treats identical station ids as idempotent', () => {
      expect(isSameCurrentStationAssignment(STATION_A, STATION_A)).toBe(true);
    });

    it('treats dual null as idempotent clear', () => {
      expect(isSameCurrentStationAssignment(null, null)).toBe(true);
    });

    it('detects changes between stations or to/from null', () => {
      expect(isSameCurrentStationAssignment(STATION_A, STATION_B)).toBe(false);
      expect(isSameCurrentStationAssignment(STATION_A, null)).toBe(false);
      expect(isSameCurrentStationAssignment(null, STATION_A)).toBe(false);
    });
  });

  describe('evaluateCorrectVehicleCurrentStationCommand', () => {
    it('returns IDEMPOTENT when current station is unchanged', () => {
      const result = evaluateCorrectVehicleCurrentStationCommand({
        currentStationId: STATION_A,
        newCurrentStationId: STATION_A,
        vehicleStatus: 'AVAILABLE',
        source: 'MANUAL',
        targetStationStatus: 'ACTIVE',
      });

      expect(result.outcome).toBe(VehicleCorrectCurrentStationCommandOutcome.IDEMPOTENT);
      expect(result.idempotent).toBe(true);
    });

    it('returns APPLIED for a real current correction', () => {
      const result = evaluateCorrectVehicleCurrentStationCommand({
        currentStationId: STATION_A,
        newCurrentStationId: STATION_B,
        vehicleStatus: 'AVAILABLE',
        source: 'MANUAL',
        targetStationStatus: 'ACTIVE',
      });

      expect(result.outcome).toBe(VehicleCorrectCurrentStationCommandOutcome.APPLIED);
      expect(result.allowed).toBe(true);
    });

    it('warns when vehicle is rented but still allows the correction', () => {
      const result = evaluateCorrectVehicleCurrentStationCommand({
        currentStationId: STATION_A,
        newCurrentStationId: STATION_B,
        vehicleStatus: 'RENTED',
        source: 'MANUAL',
        targetStationStatus: 'ACTIVE',
      });

      expect(result.allowed).toBe(true);
      expect(result.warnings).toEqual([
        expect.objectContaining({
          code: VehicleCorrectCurrentStationCommandIssueCode.VEHICLE_RENTED_CURRENT_CORRECTION_WARNING,
        }),
      ]);
    });

    it('blocks archived target stations', () => {
      const result = evaluateCorrectVehicleCurrentStationCommand({
        currentStationId: STATION_A,
        newCurrentStationId: STATION_B,
        vehicleStatus: 'AVAILABLE',
        source: 'MANUAL',
        targetStationStatus: 'ARCHIVED',
      });

      expect(result.outcome).toBe(VehicleCorrectCurrentStationCommandOutcome.BLOCKED);
      expect(result.blockingReasons[0]?.code).toBe(
        VehicleCorrectCurrentStationCommandIssueCode.TARGET_STATION_ARCHIVED,
      );
    });

    it('blocks inactive target stations', () => {
      const result = evaluateCorrectVehicleCurrentStationCommand({
        currentStationId: STATION_A,
        newCurrentStationId: STATION_B,
        vehicleStatus: 'AVAILABLE',
        source: 'MANUAL',
        targetStationStatus: 'INACTIVE',
      });

      expect(result.outcome).toBe(VehicleCorrectCurrentStationCommandOutcome.BLOCKED);
      expect(result.blockingReasons[0]?.code).toBe(
        VehicleCorrectCurrentStationCommandIssueCode.TARGET_STATION_INACTIVE,
      );
    });

    it('allows clearing current location without target station status', () => {
      const result = evaluateCorrectVehicleCurrentStationCommand({
        currentStationId: STATION_A,
        newCurrentStationId: null,
        vehicleStatus: 'AVAILABLE',
        source: 'MANUAL',
      });

      expect(result.outcome).toBe(VehicleCorrectCurrentStationCommandOutcome.APPLIED);
    });
  });

  describe('buildVehicleCorrectCurrentStationCommandAudit', () => {
    it('records from/to current station ids, source, and version transition', () => {
      const audit = buildVehicleCorrectCurrentStationCommandAudit({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        fromCurrentStationId: STATION_A,
        toCurrentStationId: STATION_B,
        source: 'MANUAL',
        previousStationPositionVersion: 2,
        nextStationPositionVersion: 3,
        reason: 'Yard recount',
        performedByUserId: 'user-1',
        idempotent: false,
      });

      expect(audit).toEqual(
        expect.objectContaining({
          command: VehicleCorrectCurrentStationCommandName.CORRECT_CURRENT_STATION,
          fromCurrentStationId: STATION_A,
          toCurrentStationId: STATION_B,
          source: 'MANUAL',
          previousStationPositionVersion: 2,
          nextStationPositionVersion: 3,
          reason: 'Yard recount',
          performedByUserId: 'user-1',
          idempotent: false,
        }),
      );
    });
  });
});
