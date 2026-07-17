import { StationRestoreCommandIssueCode, StationRestoreCommandOutcome } from './station-restore-command.types';
import {
  buildStationRestoreCommandAudit,
  evaluateStationRestoreCommand,
} from './station-restore-command.util';
import { evaluateStationRestorePreview } from './station-restore-preview.util';

describe('evaluateStationRestoreCommand', () => {
  const emptyCounts = {
    homeVehicles: 0,
    presentVehicles: 0,
    expectedVehicles: 0,
    historicalBookings: 0,
    scopedStaff: 0,
  };

  function buildPreview(
    overrides: {
      station?: Partial<Parameters<typeof evaluateStationRestorePreview>[0]['station']>;
      snapshot?: Parameters<typeof evaluateStationRestorePreview>[0]['archivedCapabilitiesSnapshot'];
    } = {},
  ) {
    return evaluateStationRestorePreview({
      station: {
        id: 'station-a',
        organizationId: 'org-a',
        status: 'ARCHIVED',
        isPrimary: false,
        archivedAt: new Date('2026-07-01T00:00:00.000Z'),
        pickupEnabled: false,
        returnEnabled: false,
        afterHoursReturnEnabled: false,
        keyBoxAvailable: false,
        openingHours: null,
        ...(overrides.station ?? {}),
      },
      archivedCapabilitiesSnapshot: overrides.snapshot ?? {
        pickupEnabled: true,
        returnEnabled: true,
        afterHoursReturnEnabled: false,
        keyBoxAvailable: false,
        isPrimary: false,
        archivedAt: '2026-07-01T00:00:00.000Z',
        archivedByUserId: null,
        reason: null,
      },
      counts: emptyCounts,
    });
  }

  it('returns idempotent outcome for already active station', () => {
    const preview = buildPreview({
      station: { status: 'ACTIVE', archivedAt: null },
    });

    const result = evaluateStationRestoreCommand({
      preview,
      options: { pickupEnabled: false, returnEnabled: false },
      stationStatus: 'ACTIVE',
    });

    expect(result.outcome).toBe(StationRestoreCommandOutcome.IDEMPOTENT);
    expect(result.allowed).toBe(true);
    expect(result.idempotent).toBe(true);
  });

  it('blocks restore without explicit capability confirmation', () => {
    const result = evaluateStationRestoreCommand({
      preview: buildPreview(),
      options: {} as never,
      stationStatus: 'ARCHIVED',
    });

    expect(result.allowed).toBe(false);
    expect(result.blockingReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: StationRestoreCommandIssueCode.CAPABILITIES_CONFIRMATION_REQUIRED,
        }),
      ]),
    );
  });

  it('allows restore with explicit capabilities', () => {
    const result = evaluateStationRestoreCommand({
      preview: buildPreview(),
      options: { pickupEnabled: true, returnEnabled: false },
      stationStatus: 'ARCHIVED',
    });

    expect(result.allowed).toBe(true);
    expect(result.outcome).toBe(StationRestoreCommandOutcome.APPLIED);
  });

  it('blocks after-hours return when return is disabled', () => {
    const result = evaluateStationRestoreCommand({
      preview: buildPreview(),
      options: {
        pickupEnabled: true,
        returnEnabled: false,
        afterHoursReturnEnabled: true,
      },
      stationStatus: 'ARCHIVED',
    });

    expect(result.allowed).toBe(false);
    expect(result.blockingReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: StationRestoreCommandIssueCode.AFTER_HOURS_WITHOUT_RETURN,
        }),
      ]),
    );
  });
});

describe('buildStationRestoreCommandAudit', () => {
  it('captures applied and suggested capabilities', () => {
    const audit = buildStationRestoreCommandAudit({
      stationId: 'station-a',
      organizationId: 'org-a',
      previousStatus: 'ARCHIVED',
      nextStatus: 'ACTIVE',
      performedByUserId: 'user-1',
      idempotent: false,
      appliedCapabilities: { pickupEnabled: true, returnEnabled: false },
      suggestedCapabilities: {
        pickupEnabled: true,
        returnEnabled: true,
        afterHoursReturnEnabled: false,
        keyBoxAvailable: false,
        source: 'archived_snapshot',
      },
    });

    expect(audit).toEqual(
      expect.objectContaining({
        command: 'RestoreStation',
        stationId: 'station-a',
        appliedCapabilities: { pickupEnabled: true, returnEnabled: false },
        suggestedCapabilities: expect.objectContaining({ source: 'archived_snapshot' }),
      }),
    );
  });
});
