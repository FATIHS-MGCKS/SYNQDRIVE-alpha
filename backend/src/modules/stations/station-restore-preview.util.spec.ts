import { StationLifecycleWarningCode } from '@shared/stations/station-lifecycle.policy';
import { StationRestorePreviewIssueCode } from './station-restore-preview.types';
import {
  buildSuggestedRestoreCapabilities,
  evaluateOpeningHoursRestoreWarnings,
  evaluateStationRestorePreview,
  parseArchivedCapabilitiesSnapshot,
} from './station-restore-preview.util';

const STATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG = 'org-restore-preview';

describe('parseArchivedCapabilitiesSnapshot', () => {
  it('parses valid snapshot payload', () => {
    const snapshot = parseArchivedCapabilitiesSnapshot({
      pickupEnabled: true,
      returnEnabled: false,
      afterHoursReturnEnabled: true,
      keyBoxAvailable: false,
      isPrimary: true,
      archivedAt: '2026-07-01T00:00:00.000Z',
      archivedByUserId: 'user-1',
      reason: 'test',
    });

    expect(snapshot).toEqual({
      pickupEnabled: true,
      returnEnabled: false,
      afterHoursReturnEnabled: true,
      keyBoxAvailable: false,
      isPrimary: true,
      archivedAt: '2026-07-01T00:00:00.000Z',
      archivedByUserId: 'user-1',
      reason: 'test',
    });
  });

  it('returns null for invalid snapshot payload', () => {
    expect(parseArchivedCapabilitiesSnapshot(null)).toBeNull();
    expect(parseArchivedCapabilitiesSnapshot({ pickupEnabled: true })).toBeNull();
  });
});

describe('buildSuggestedRestoreCapabilities', () => {
  const station = {
    id: STATION_ID,
    organizationId: ORG,
    status: 'ARCHIVED' as const,
    isPrimary: false,
    archivedAt: new Date('2026-07-01T00:00:00.000Z'),
    pickupEnabled: false,
    returnEnabled: false,
    afterHoursReturnEnabled: false,
    keyBoxAvailable: false,
    openingHours: null,
  };

  it('prefers archived snapshot as suggestion source', () => {
    const suggested = buildSuggestedRestoreCapabilities(station, {
      pickupEnabled: true,
      returnEnabled: true,
      afterHoursReturnEnabled: true,
      keyBoxAvailable: true,
      isPrimary: true,
      archivedAt: '2026-07-01T00:00:00.000Z',
      archivedByUserId: null,
      reason: null,
    });

    expect(suggested).toEqual({
      pickupEnabled: true,
      returnEnabled: true,
      afterHoursReturnEnabled: true,
      keyBoxAvailable: true,
      source: 'archived_snapshot',
    });
  });

  it('falls back to current station when snapshot is missing', () => {
    const suggested = buildSuggestedRestoreCapabilities(
      {
        ...station,
        pickupEnabled: false,
        returnEnabled: true,
        afterHoursReturnEnabled: true,
        keyBoxAvailable: true,
      },
      null,
    );

    expect(suggested.source).toBe('current_station');
    expect(suggested.returnEnabled).toBe(true);
  });
});

describe('evaluateOpeningHoursRestoreWarnings', () => {
  it('warns when opening hours are missing', () => {
    const warnings = evaluateOpeningHoursRestoreWarnings(null);
    expect(warnings).toEqual([
      expect.objectContaining({
        code: StationRestorePreviewIssueCode.MISSING_OPENING_HOURS,
      }),
    ]);
  });

  it('warns when opening hours are invalid', () => {
    const warnings = evaluateOpeningHoursRestoreWarnings({ monday: 'invalid' });
    expect(warnings).toEqual([
      expect.objectContaining({
        code: StationRestorePreviewIssueCode.INVALID_OR_OUTDATED_OPENING_HOURS,
      }),
    ]);
  });
});

describe('evaluateStationRestorePreview', () => {
  const emptyCounts = {
    homeVehicles: 0,
    presentVehicles: 0,
    expectedVehicles: 0,
    historicalBookings: 0,
    scopedStaff: 0,
  };

  const archivedStation = {
    id: STATION_ID,
    organizationId: ORG,
    status: 'ARCHIVED' as const,
    isPrimary: false,
    archivedAt: new Date('2026-07-01T00:00:00.000Z'),
    pickupEnabled: false,
    returnEnabled: false,
    afterHoursReturnEnabled: false,
    keyBoxAvailable: false,
    openingHours: null,
  };

  it('returns idempotent preview for active station', () => {
    const result = evaluateStationRestorePreview({
      station: { ...archivedStation, status: 'ACTIVE', archivedAt: null },
      archivedCapabilitiesSnapshot: null,
      counts: emptyCounts,
    });

    expect(result.restoreAllowed).toBe(true);
    expect(result.idempotent).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: StationRestorePreviewIssueCode.ALREADY_ACTIVE }),
      ]),
    );
  });

  it('allows restore preview for archived station with capability confirmation follow-up', () => {
    const result = evaluateStationRestorePreview({
      station: archivedStation,
      archivedCapabilitiesSnapshot: {
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

    expect(result.restoreAllowed).toBe(true);
    expect(result.idempotent).toBe(false);
    expect(result.suggestedCapabilities.pickupEnabled).toBe(true);
    expect(result.requiredFollowUpActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: StationRestorePreviewIssueCode.CONFIRM_CAPABILITIES_REQUIRED,
        }),
      ]),
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: StationLifecycleWarningCode.RESTORE_DOES_NOT_REENABLE_CAPABILITIES,
        }),
      ]),
    );
  });

  it('warns when station was primary and scoped staff remain linked', () => {
    const result = evaluateStationRestorePreview({
      station: archivedStation,
      archivedCapabilitiesSnapshot: {
        pickupEnabled: true,
        returnEnabled: true,
        afterHoursReturnEnabled: false,
        keyBoxAvailable: false,
        isPrimary: true,
        archivedAt: '2026-07-01T00:00:00.000Z',
        archivedByUserId: null,
        reason: null,
      },
      counts: { ...emptyCounts, scopedStaff: 2, homeVehicles: 1, historicalBookings: 3 },
    });

    expect(result.wasPrimary).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: StationRestorePreviewIssueCode.WAS_PRIMARY_NOT_RESTORED,
        }),
        expect.objectContaining({
          code: StationRestorePreviewIssueCode.SCOPED_STAFF_NOT_AUTO_REACTIVATED,
        }),
        expect.objectContaining({
          code: StationRestorePreviewIssueCode.VEHICLE_LINKS_UNCHANGED,
        }),
        expect.objectContaining({
          code: StationRestorePreviewIssueCode.HISTORICAL_BOOKINGS_UNCHANGED,
        }),
      ]),
    );
  });
});
