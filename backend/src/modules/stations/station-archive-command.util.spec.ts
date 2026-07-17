import { StationArchivePreviewIssueCode } from './station-archive-preview.types';
import { evaluateStationArchivePreview } from './station-archive-preview.util';
import { StationArchiveCommandIssueCode } from './station-archive-command.types';
import { evaluateStationArchiveCommand } from './station-archive-command.util';

describe('evaluateStationArchiveCommand', () => {
  const emptyCounts = {
    homeVehicles: 0,
    presentVehicles: 0,
    expectedVehicles: 0,
    futurePickupBookings: 0,
    futureReturnBookings: 0,
    openHandovers: 0,
    scopedStaff: 0,
    openTasks: 0,
    plannedTransfers: 0,
    activeBookings: 0,
  };

  function buildPreview(
    overrides: {
      snapshot?: Partial<Parameters<typeof evaluateStationArchivePreview>[0]['snapshot']>;
      counts?: Partial<Parameters<typeof evaluateStationArchivePreview>[0]['counts']>;
    } = {},
  ) {
    return evaluateStationArchivePreview({
      snapshot: {
        stationId: 'station-a',
        organizationId: 'org-a',
        status: 'ACTIVE',
        isPrimary: false,
        archivedAt: null,
        pickupEnabled: true,
        returnEnabled: true,
        afterHoursReturnEnabled: false,
        keyBoxAvailable: false,
        successorCandidates: [],
        ...(overrides.snapshot ?? {}),
      },
      counts: { ...emptyCounts, ...(overrides.counts ?? {}) },
    });
  }

  it('allows archive for empty active station', () => {
    const result = evaluateStationArchiveCommand({
      preview: buildPreview(),
      options: {},
      station: { id: 'station-a', status: 'ACTIVE', isPrimary: false },
    });

    expect(result.allowed).toBe(true);
    expect(result.idempotent).toBe(false);
    expect(result.blockingReasons).toHaveLength(0);
  });

  it('blocks primary archive without successorPrimaryStationId', () => {
    const result = evaluateStationArchiveCommand({
      preview: buildPreview({ snapshot: { isPrimary: true, successorCandidates: [{ id: 'b', name: 'B', code: null }] } }),
      options: {},
      station: { id: 'station-a', status: 'ACTIVE', isPrimary: true },
    });

    expect(result.allowed).toBe(false);
    expect(result.blockingReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: StationArchiveCommandIssueCode.PRIMARY_ARCHIVE_REQUIRES_SUCCESSOR,
        }),
      ]),
    );
  });

  it('blocks future bookings unless acknowledgeFutureBookings is set', () => {
    const preview = buildPreview({
      counts: { futurePickupBookings: 2, futureReturnBookings: 1 },
    });

    const blocked = evaluateStationArchiveCommand({
      preview,
      options: {},
      station: { id: 'station-a', status: 'ACTIVE', isPrimary: false },
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockingReasons.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        StationArchiveCommandIssueCode.FUTURE_PICKUPS_BLOCK_ARCHIVE,
        StationArchiveCommandIssueCode.FUTURE_RETURNS_BLOCK_ARCHIVE,
      ]),
    );

    const acknowledged = evaluateStationArchiveCommand({
      preview,
      options: { acknowledgeFutureBookings: true },
      station: { id: 'station-a', status: 'ACTIVE', isPrimary: false },
    });
    expect(acknowledged.allowed).toBe(true);
    expect(acknowledged.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: StationArchiveCommandIssueCode.ACKNOWLEDGED_FUTURE_BOOKINGS,
        }),
      ]),
    );
  });

  it('returns idempotent evaluation for archived station', () => {
    const preview = buildPreview({
      snapshot: {
        status: 'ARCHIVED',
        archivedAt: new Date('2026-07-01T00:00:00.000Z'),
        pickupEnabled: false,
        returnEnabled: false,
      },
    });

    const result = evaluateStationArchiveCommand({
      preview,
      options: {},
      station: { id: 'station-a', status: 'ARCHIVED', isPrimary: false },
    });

    expect(result.idempotent).toBe(true);
    expect(result.allowed).toBe(true);
    expect(result.blockingReasons).toHaveLength(0);
  });

  it('merges preview primary blocker codes', () => {
    const preview = buildPreview({
      snapshot: { isPrimary: true, successorCandidates: [] },
    });

    const result = evaluateStationArchiveCommand({
      preview,
      options: {},
      station: { id: 'station-a', status: 'ACTIVE', isPrimary: true },
    });

    expect(result.blockingReasons.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        StationArchivePreviewIssueCode.PRIMARY_ARCHIVE_REQUIRES_SUCCESSOR,
        StationArchiveCommandIssueCode.PRIMARY_ARCHIVE_REQUIRES_SUCCESSOR,
      ]),
    );
  });
});
