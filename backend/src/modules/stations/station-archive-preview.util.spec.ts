import { StationArchivePreviewIssueCode } from './station-archive-preview.types';
import { evaluateStationArchivePreview } from './station-archive-preview.util';

const STATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG = 'org-preview';

describe('evaluateStationArchivePreview', () => {
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

  it('allows archive for empty active station', () => {
    const result = evaluateStationArchivePreview({
      snapshot: {
        stationId: STATION_ID,
        organizationId: ORG,
        status: 'ACTIVE',
        isPrimary: false,
        archivedAt: null,
        pickupEnabled: true,
        returnEnabled: true,
        afterHoursReturnEnabled: false,
        keyBoxAvailable: false,
        successorCandidates: [],
      },
      counts: emptyCounts,
    });

    expect(result.archiveAllowed).toBe(true);
    expect(result.idempotent).toBe(false);
    expect(result.blockingReasons).toHaveLength(0);
    expect(result.affectedCounts).toEqual(emptyCounts);
  });

  it('returns idempotent preview for archived station', () => {
    const result = evaluateStationArchivePreview({
      snapshot: {
        stationId: STATION_ID,
        organizationId: ORG,
        status: 'ARCHIVED',
        isPrimary: false,
        archivedAt: new Date('2026-07-01T00:00:00.000Z'),
        pickupEnabled: false,
        returnEnabled: false,
        afterHoursReturnEnabled: false,
        keyBoxAvailable: false,
        successorCandidates: [],
      },
      counts: emptyCounts,
    });

    expect(result.archiveAllowed).toBe(true);
    expect(result.idempotent).toBe(true);
    expect(result.warnings.some((w) => w.code === 'IDEMPOTENT_ARCHIVE')).toBe(true);
  });

  it('blocks primary archive without successor candidate', () => {
    const result = evaluateStationArchivePreview({
      snapshot: {
        stationId: STATION_ID,
        organizationId: ORG,
        status: 'ACTIVE',
        isPrimary: true,
        archivedAt: null,
        pickupEnabled: true,
        returnEnabled: true,
        afterHoursReturnEnabled: false,
        keyBoxAvailable: false,
        successorCandidates: [],
      },
      counts: emptyCounts,
    });

    expect(result.archiveAllowed).toBe(false);
    expect(result.blockingReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: StationArchivePreviewIssueCode.PRIMARY_ARCHIVE_REQUIRES_SUCCESSOR,
        }),
      ]),
    );
    expect(result.requiredFollowUpActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: StationArchivePreviewIssueCode.SET_SUCCESSOR_PRIMARY,
        }),
      ]),
    );
  });

  it('warns on linked vehicles, bookings, staff, and tasks', () => {
    const result = evaluateStationArchivePreview({
      snapshot: {
        stationId: STATION_ID,
        organizationId: ORG,
        status: 'INACTIVE',
        isPrimary: false,
        archivedAt: null,
        pickupEnabled: false,
        returnEnabled: false,
        afterHoursReturnEnabled: false,
        keyBoxAvailable: false,
        successorCandidates: [],
      },
      counts: {
        homeVehicles: 2,
        presentVehicles: 1,
        expectedVehicles: 3,
        futurePickupBookings: 4,
        futureReturnBookings: 5,
        openHandovers: 1,
        scopedStaff: 2,
        openTasks: 6,
        plannedTransfers: 2,
        activeBookings: 1,
      },
    });

    expect(result.archiveAllowed).toBe(true);
    expect(result.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining([
        StationArchivePreviewIssueCode.HOME_VEHICLES_REMAIN,
        StationArchivePreviewIssueCode.PRESENT_VEHICLES_REMAIN,
        StationArchivePreviewIssueCode.EXPECTED_VEHICLES_REMAIN,
        StationArchivePreviewIssueCode.PLANNED_TRANSFERS_REMAIN,
        StationArchivePreviewIssueCode.FUTURE_PICKUPS_REMAIN,
        StationArchivePreviewIssueCode.FUTURE_RETURNS_REMAIN,
        StationArchivePreviewIssueCode.OPEN_HANDOVERS_REMAIN,
        StationArchivePreviewIssueCode.SCOPED_STAFF_REMAINS,
        StationArchivePreviewIssueCode.OPEN_TASKS_REMAIN,
        'ACTIVE_BOOKINGS_ON_ARCHIVE',
      ]),
    );
    expect(result.requiredFollowUpActions.map((a) => a.code)).toEqual(
      expect.arrayContaining([
        StationArchivePreviewIssueCode.APPLY_ARCHIVED_INVARIANTS,
        StationArchivePreviewIssueCode.REVIEW_VEHICLE_LINKS,
        StationArchivePreviewIssueCode.REVIEW_BOOKINGS,
        StationArchivePreviewIssueCode.REVIEW_STAFF_SCOPE,
      ]),
    );
  });
});
