import { StationLifecycleWarningCode } from '@shared/stations/station-lifecycle.policy';
import {
  buildStationLifecycleCommandAudit,
  evaluateStationLifecycleCommand,
} from './station-lifecycle-command.util';
import {
  StationLifecycleCommandIssueCode,
  StationLifecycleCommandName,
  StationLifecycleCommandOutcome,
} from './station-lifecycle-command.types';

function station(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ACTIVE' as const,
    isPrimary: false,
    pickupEnabled: true,
    returnEnabled: true,
    archivedAt: null,
    ...overrides,
  };
}

describe('station-lifecycle-command.util', () => {
  describe('evaluateStationLifecycleCommand — activate', () => {
    it('allows inactive to active transition', () => {
      const result = evaluateStationLifecycleCommand({
        command: StationLifecycleCommandName.ACTIVATE,
        station: station({ status: 'INACTIVE' }),
      });
      expect(result.allowed).toBe(true);
      expect(result.outcome).toBe(StationLifecycleCommandOutcome.APPLIED);
      expect(result.enforcedMutations).toEqual({ status: 'ACTIVE' });
    });

    it('is idempotent when already active', () => {
      const result = evaluateStationLifecycleCommand({
        command: StationLifecycleCommandName.ACTIVATE,
        station: station({ status: 'ACTIVE' }),
      });
      expect(result.allowed).toBe(true);
      expect(result.idempotent).toBe(true);
      expect(result.outcome).toBe(StationLifecycleCommandOutcome.IDEMPOTENT);
    });

    it('warns that capabilities are not auto-enabled on activate', () => {
      const result = evaluateStationLifecycleCommand({
        command: StationLifecycleCommandName.ACTIVATE,
        station: station({
          status: 'INACTIVE',
          pickupEnabled: false,
          returnEnabled: false,
        }),
      });
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: StationLifecycleCommandIssueCode.CAPABILITIES_UNCHANGED_ON_ACTIVATE,
          }),
        ]),
      );
    });

    it('blocks activate on archived station', () => {
      const result = evaluateStationLifecycleCommand({
        command: StationLifecycleCommandName.ACTIVATE,
        station: station({ status: 'ARCHIVED' }),
      });
      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe(StationLifecycleCommandOutcome.BLOCKED);
    });
  });

  describe('evaluateStationLifecycleCommand — deactivate', () => {
    it('allows active to inactive transition', () => {
      const result = evaluateStationLifecycleCommand({
        command: StationLifecycleCommandName.DEACTIVATE,
        station: station({ status: 'ACTIVE' }),
        preflight: { futurePickupCount: 0, futureReturnCount: 0 },
      });
      expect(result.allowed).toBe(true);
      expect(result.outcome).toBe(StationLifecycleCommandOutcome.APPLIED);
      expect(result.enforcedMutations).toEqual({ status: 'INACTIVE' });
    });

    it('blocks deactivate when future pickups exist', () => {
      const result = evaluateStationLifecycleCommand({
        command: StationLifecycleCommandName.DEACTIVATE,
        station: station({ status: 'ACTIVE' }),
        preflight: { futurePickupCount: 2, futureReturnCount: 0 },
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: StationLifecycleCommandIssueCode.FUTURE_PICKUPS_BLOCK_DEACTIVATE,
          }),
        ]),
      );
    });

    it('blocks deactivate when future returns exist', () => {
      const result = evaluateStationLifecycleCommand({
        command: StationLifecycleCommandName.DEACTIVATE,
        station: station({ status: 'ACTIVE' }),
        preflight: { futurePickupCount: 0, futureReturnCount: 1 },
      });
      expect(result.blockingReasons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: StationLifecycleCommandIssueCode.FUTURE_RETURNS_BLOCK_DEACTIVATE,
          }),
        ]),
      );
    });

    it('is idempotent when already inactive', () => {
      const result = evaluateStationLifecycleCommand({
        command: StationLifecycleCommandName.DEACTIVATE,
        station: station({ status: 'INACTIVE' }),
      });
      expect(result.idempotent).toBe(true);
      expect(result.warnings.some((w) => w.code === StationLifecycleWarningCode.IDEMPOTENT_DEACTIVATE)).toBe(
        true,
      );
    });

    it('warns when primary station is deactivated', () => {
      const result = evaluateStationLifecycleCommand({
        command: StationLifecycleCommandName.DEACTIVATE,
        station: station({ status: 'ACTIVE', isPrimary: true }),
        preflight: { futurePickupCount: 0, futureReturnCount: 0 },
      });
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: StationLifecycleCommandIssueCode.PRIMARY_REMAINS_WHILE_INACTIVE,
          }),
        ]),
      );
    });
  });

  describe('buildStationLifecycleCommandAudit', () => {
    it('prepares audit payload for downstream trail', () => {
      const audit = buildStationLifecycleCommandAudit(
        {
          command: StationLifecycleCommandName.DEACTIVATE,
          stationId: 'station-1',
          organizationId: 'org-1',
          previousStatus: 'ACTIVE',
          nextStatus: 'INACTIVE',
          idempotent: false,
          preflight: { futurePickupCount: 0, futureReturnCount: 0 },
        },
        new Date('2026-07-18T00:00:00.000Z'),
      );
      expect(audit).toMatchObject({
        command: StationLifecycleCommandName.DEACTIVATE,
        stationId: 'station-1',
        organizationId: 'org-1',
        previousStatus: 'ACTIVE',
        nextStatus: 'INACTIVE',
        idempotent: false,
        futurePickupCount: 0,
        futureReturnCount: 0,
      });
    });
  });
});
