import {
  buildVehicleChangeHomeStationCommandAudit,
  evaluateChangeVehicleHomeStationCommand,
  isSameHomeStationAssignment,
} from './vehicle-change-home-station-command.util';
import {
  VehicleChangeHomeStationCommandIssueCode,
  VehicleChangeHomeStationCommandName,
  VehicleChangeHomeStationCommandOutcome,
} from './vehicle-change-home-station-command.types';

describe('vehicle-change-home-station-command.util', () => {
  const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  describe('isSameHomeStationAssignment', () => {
    it('treats identical station ids as idempotent', () => {
      expect(isSameHomeStationAssignment(STATION_A, STATION_A)).toBe(true);
    });

    it('treats dual null as idempotent detach', () => {
      expect(isSameHomeStationAssignment(null, null)).toBe(true);
    });

    it('detects changes between stations or to/from null', () => {
      expect(isSameHomeStationAssignment(STATION_A, STATION_B)).toBe(false);
      expect(isSameHomeStationAssignment(STATION_A, null)).toBe(false);
      expect(isSameHomeStationAssignment(null, STATION_A)).toBe(false);
    });
  });

  describe('evaluateChangeVehicleHomeStationCommand', () => {
    it('returns IDEMPOTENT when home station is unchanged', () => {
      const result = evaluateChangeVehicleHomeStationCommand({
        currentHomeStationId: STATION_A,
        newHomeStationId: STATION_A,
        vehicleStatus: 'AVAILABLE',
      });

      expect(result.outcome).toBe(VehicleChangeHomeStationCommandOutcome.IDEMPOTENT);
      expect(result.idempotent).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('returns APPLIED for a real home change', () => {
      const result = evaluateChangeVehicleHomeStationCommand({
        currentHomeStationId: STATION_A,
        newHomeStationId: STATION_B,
        vehicleStatus: 'AVAILABLE',
      });

      expect(result.outcome).toBe(VehicleChangeHomeStationCommandOutcome.APPLIED);
      expect(result.allowed).toBe(true);
    });

    it('warns when vehicle is rented but still allows the change', () => {
      const result = evaluateChangeVehicleHomeStationCommand({
        currentHomeStationId: STATION_A,
        newHomeStationId: STATION_B,
        vehicleStatus: 'RENTED',
      });

      expect(result.allowed).toBe(true);
      expect(result.warnings).toEqual([
        expect.objectContaining({
          code: VehicleChangeHomeStationCommandIssueCode.VEHICLE_RENTED_HOME_CHANGE_WARNING,
        }),
      ]);
    });
  });

  describe('buildVehicleChangeHomeStationCommandAudit', () => {
    it('records from/to home station ids and version transition', () => {
      const audit = buildVehicleChangeHomeStationCommandAudit({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        fromHomeStationId: STATION_A,
        toHomeStationId: STATION_B,
        previousStationPositionVersion: 2,
        nextStationPositionVersion: 3,
        reason: 'Fleet rebalancing',
        performedByUserId: 'user-1',
        idempotent: false,
      });

      expect(audit).toEqual(
        expect.objectContaining({
          command: VehicleChangeHomeStationCommandName.CHANGE_HOME_STATION,
          fromHomeStationId: STATION_A,
          toHomeStationId: STATION_B,
          previousStationPositionVersion: 2,
          nextStationPositionVersion: 3,
          reason: 'Fleet rebalancing',
          performedByUserId: 'user-1',
          idempotent: false,
        }),
      );
    });
  });
});
