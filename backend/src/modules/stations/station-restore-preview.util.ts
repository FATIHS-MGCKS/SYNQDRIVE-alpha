import { Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import {
  evaluateStationLifecycle,
  StationLifecycleCommand,
  StationLifecycleReasonCode,
  StationLifecycleWarningCode,
} from '@shared/stations/station-lifecycle.policy';
import type { StationLifecycleSnapshot } from '@shared/stations/station-lifecycle.policy.types';
import { assertValidOpeningHours } from './station-create-validation.util';
import { openingHoursIsMissing } from './station.types';
import type { StationArchivedCapabilitiesSnapshot } from './station-archive-command.types';
import {
  StationRestorePreviewIssueCode,
  type StationRestorePreviewEvaluation,
  type StationRestorePreviewIssue,
  type StationRestoreSuggestedCapabilities,
} from './station-restore-preview.types';

export interface EvaluateStationRestorePreviewInput {
  station: StationLifecycleSnapshot & {
    id: string;
    organizationId: string;
    afterHoursReturnEnabled: boolean;
    keyBoxAvailable: boolean;
    openingHours: Prisma.JsonValue | null;
  };
  archivedCapabilitiesSnapshot: StationArchivedCapabilitiesSnapshot | null;
  counts: {
    homeVehicles: number;
    presentVehicles: number;
    expectedVehicles: number;
    historicalBookings: number;
    scopedStaff: number;
  };
}

function issue(code: string, message: string): StationRestorePreviewIssue {
  return { code, message };
}

function mapPolicyIssues(
  items: Array<{ code: string; message: string }>,
): StationRestorePreviewIssue[] {
  return items.map((item) => ({ code: item.code, message: item.message }));
}

export function parseArchivedCapabilitiesSnapshot(
  raw: Prisma.JsonValue | null | undefined,
): StationArchivedCapabilitiesSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const snapshot = raw as Record<string, unknown>;
  if (
    typeof snapshot.pickupEnabled !== 'boolean' ||
    typeof snapshot.returnEnabled !== 'boolean'
  ) {
    return null;
  }
  return {
    pickupEnabled: snapshot.pickupEnabled,
    returnEnabled: snapshot.returnEnabled,
    afterHoursReturnEnabled:
      typeof snapshot.afterHoursReturnEnabled === 'boolean'
        ? snapshot.afterHoursReturnEnabled
        : false,
    keyBoxAvailable:
      typeof snapshot.keyBoxAvailable === 'boolean' ? snapshot.keyBoxAvailable : false,
    isPrimary: typeof snapshot.isPrimary === 'boolean' ? snapshot.isPrimary : false,
    archivedAt:
      typeof snapshot.archivedAt === 'string'
        ? snapshot.archivedAt
        : new Date().toISOString(),
    archivedByUserId:
      typeof snapshot.archivedByUserId === 'string' ? snapshot.archivedByUserId : null,
    reason: typeof snapshot.reason === 'string' ? snapshot.reason : null,
  };
}

export function buildSuggestedRestoreCapabilities(
  station: EvaluateStationRestorePreviewInput['station'],
  snapshot: StationArchivedCapabilitiesSnapshot | null,
): StationRestoreSuggestedCapabilities {
  if (snapshot) {
    return {
      pickupEnabled: snapshot.pickupEnabled,
      returnEnabled: snapshot.returnEnabled,
      afterHoursReturnEnabled: snapshot.afterHoursReturnEnabled,
      keyBoxAvailable: snapshot.keyBoxAvailable,
      source: 'archived_snapshot',
    };
  }

  return {
    pickupEnabled: station.pickupEnabled,
    returnEnabled: station.returnEnabled,
    afterHoursReturnEnabled: station.afterHoursReturnEnabled,
    keyBoxAvailable: station.keyBoxAvailable,
    source: 'current_station',
  };
}

export function evaluateOpeningHoursRestoreWarnings(
  openingHours: Prisma.JsonValue | null,
): StationRestorePreviewIssue[] {
  if (openingHoursIsMissing(openingHours)) {
    return [
      issue(
        StationRestorePreviewIssueCode.MISSING_OPENING_HOURS,
        'Opening hours are missing; review before re-enabling operations.',
      ),
    ];
  }

  try {
    assertValidOpeningHours(openingHours as Record<string, unknown> | string | null);
    return [];
  } catch (error) {
    if (error instanceof BadRequestException) {
      return [
        issue(
          StationRestorePreviewIssueCode.INVALID_OR_OUTDATED_OPENING_HOURS,
          'Opening hours appear invalid or outdated; review before restore.',
        ),
      ];
    }
    throw error;
  }
}

export function evaluateStationRestorePreview(
  input: EvaluateStationRestorePreviewInput,
): StationRestorePreviewEvaluation {
  const { station, archivedCapabilitiesSnapshot, counts } = input;
  const suggestedCapabilities = buildSuggestedRestoreCapabilities(
    station,
    archivedCapabilitiesSnapshot,
  );
  const wasPrimary = archivedCapabilitiesSnapshot?.isPrimary ?? false;

  if (station.status === 'ACTIVE') {
    return {
      restoreAllowed: true,
      idempotent: true,
      blockingReasons: [],
      warnings: [
        issue(
          StationRestorePreviewIssueCode.ALREADY_ACTIVE,
          'Station is already active.',
        ),
      ],
      requiredFollowUpActions: [],
      affectedCounts: counts,
      suggestedCapabilities,
      wasPrimary,
      archivedCapabilitiesSnapshot,
    };
  }

  const policy = evaluateStationLifecycle({
    command: StationLifecycleCommand.RESTORE,
    station,
    context: {
      restorePickupEnabled: suggestedCapabilities.pickupEnabled,
      restoreReturnEnabled: suggestedCapabilities.returnEnabled,
    },
  });

  const blockingReasons = mapPolicyIssues(policy.blockingReasons);
  const warnings = mapPolicyIssues(policy.warnings);
  const requiredFollowUpActions = mapPolicyIssues(policy.requiredActions);

  warnings.push(
    issue(
      StationRestorePreviewIssueCode.CONFIRM_CAPABILITIES_REQUIRED,
      'Confirm desired pickup/return capabilities in the restore request body.',
    ),
  );
  requiredFollowUpActions.push(
    issue(
      StationRestorePreviewIssueCode.CONFIRM_CAPABILITIES_REQUIRED,
      'Submit explicit pickupEnabled and returnEnabled values when restoring.',
    ),
  );

  if (wasPrimary) {
    warnings.push(
      issue(
        StationRestorePreviewIssueCode.WAS_PRIMARY_NOT_RESTORED,
        'Previous primary status will not be restored automatically.',
      ),
    );
  }

  if (counts.scopedStaff > 0) {
    warnings.push(
      issue(
        StationRestorePreviewIssueCode.SCOPED_STAFF_NOT_AUTO_REACTIVATED,
        `${counts.scopedStaff} staff membership(s) remain scoped to this station but are not auto-reactivated.`,
      ),
    );
  }

  if (counts.homeVehicles > 0 || counts.presentVehicles > 0 || counts.expectedVehicles > 0) {
    warnings.push(
      issue(
        StationRestorePreviewIssueCode.VEHICLE_LINKS_UNCHANGED,
        'Vehicle home/current/expected links remain unchanged by restore.',
      ),
    );
  }

  if (counts.historicalBookings > 0) {
    warnings.push(
      issue(
        StationRestorePreviewIssueCode.HISTORICAL_BOOKINGS_UNCHANGED,
        'Historical bookings referencing this station remain unchanged.',
      ),
    );
  }

  warnings.push(...evaluateOpeningHoursRestoreWarnings(station.openingHours));

  const idempotent = false;
  const restoreAllowed =
    station.status === 'ARCHIVED' &&
    policy.allowed &&
    !blockingReasons.some((r) => r.code === StationLifecycleReasonCode.NOT_ARCHIVED);

  if (
    station.status !== 'ARCHIVED' &&
    !blockingReasons.some((r) => r.code === StationLifecycleReasonCode.NOT_ARCHIVED)
  ) {
    blockingReasons.push(
      issue(
        StationRestorePreviewIssueCode.NOT_ARCHIVED,
        'Only archived stations can be restored.',
      ),
    );
  }

  const dedupedWarnings = dedupeIssues(warnings);
  if (
    dedupedWarnings.some(
      (w) => w.code === StationLifecycleWarningCode.RESTORE_DOES_NOT_REENABLE_CAPABILITIES,
    ) === false &&
    station.status === 'ARCHIVED'
  ) {
    dedupedWarnings.unshift(
      issue(
        StationLifecycleWarningCode.RESTORE_DOES_NOT_REENABLE_CAPABILITIES,
        'Restore does not blindly re-enable pickup/return capabilities.',
      ),
    );
  }

  return {
    restoreAllowed,
    idempotent,
    blockingReasons: dedupeIssues(blockingReasons),
    warnings: dedupedWarnings,
    requiredFollowUpActions: dedupeIssues(requiredFollowUpActions),
    affectedCounts: counts,
    suggestedCapabilities,
    wasPrimary,
    archivedCapabilitiesSnapshot,
  };
}

function dedupeIssues(items: StationRestorePreviewIssue[]): StationRestorePreviewIssue[] {
  const seen = new Set<string>();
  const result: StationRestorePreviewIssue[] = [];
  for (const item of items) {
    const key = `${item.code}::${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
