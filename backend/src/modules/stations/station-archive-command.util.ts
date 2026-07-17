import { StationStatus } from '@prisma/client';
import {
  StationArchiveCommandIssueCode,
  StationArchiveCommandName,
  StationArchiveCommandOutcome,
  type EvaluateStationArchiveCommandInput,
  type StationArchiveCommandEvaluation,
  type StationArchiveCommandIssue,
  type StationArchivedCapabilitiesSnapshot,
} from './station-archive-command.types';

function issue(code: string, message: string): StationArchiveCommandIssue {
  return { code, message };
}

function mapPreviewIssues(
  items: Array<{ code: string; message: string }>,
): StationArchiveCommandIssue[] {
  return items.map((item) => ({ code: item.code, message: item.message }));
}

export function evaluateStationArchiveCommand(
  input: EvaluateStationArchiveCommandInput,
): StationArchiveCommandEvaluation {
  const { preview, options, station, successorPrimaryStationStatus } = input;

  const blockingReasons = mapPreviewIssues(preview.blockingReasons);
  const warnings = mapPreviewIssues(preview.warnings);
  const requiredActions = mapPreviewIssues(preview.requiredFollowUpActions);

  const futurePickupCount = preview.affectedCounts.futurePickupBookings;
  const futureReturnCount = preview.affectedCounts.futureReturnBookings;
  const hasFutureBookings = futurePickupCount > 0 || futureReturnCount > 0;

  if (station.isPrimary && station.status !== 'ARCHIVED') {
    const successorId = options.successorPrimaryStationId?.trim();
    if (!successorId) {
      blockingReasons.push(
        issue(
          StationArchiveCommandIssueCode.PRIMARY_ARCHIVE_REQUIRES_SUCCESSOR,
          'Primary station cannot be archived without successorPrimaryStationId.',
        ),
      );
    } else if (successorId === station.id) {
      blockingReasons.push(
        issue(
          StationArchiveCommandIssueCode.SUCCESSOR_PRIMARY_IS_SELF,
          'Successor primary station must be a different station.',
        ),
      );
    } else if (successorPrimaryStationStatus && successorPrimaryStationStatus !== 'ACTIVE') {
      blockingReasons.push(
        issue(
          StationArchiveCommandIssueCode.SUCCESSOR_PRIMARY_NOT_ACTIVE,
          'Successor primary station must be ACTIVE.',
        ),
      );
    }
  }

  if (hasFutureBookings && !options.acknowledgeFutureBookings && station.status !== 'ARCHIVED') {
    if (futurePickupCount > 0) {
      blockingReasons.push(
        issue(
          StationArchiveCommandIssueCode.FUTURE_PICKUPS_BLOCK_ARCHIVE,
          `Station has ${futurePickupCount} future pickup booking(s).`,
        ),
      );
    }
    if (futureReturnCount > 0) {
      blockingReasons.push(
        issue(
          StationArchiveCommandIssueCode.FUTURE_RETURNS_BLOCK_ARCHIVE,
          `Station has ${futureReturnCount} future return booking(s).`,
        ),
      );
    }
    requiredActions.push(
      issue(
        StationArchiveCommandIssueCode.FUTURE_BOOKINGS_ACKNOWLEDGEMENT_REQUIRED,
        'Set acknowledgeFutureBookings=true after reviewing future bookings.',
      ),
    );
  }

  if (hasFutureBookings && options.acknowledgeFutureBookings) {
    warnings.push(
      issue(
        StationArchiveCommandIssueCode.ACKNOWLEDGED_FUTURE_BOOKINGS,
        'Future bookings acknowledged; historical references will remain.',
      ),
    );
  }

  const dedupedBlocking = dedupeIssues(blockingReasons);
  const idempotent = preview.idempotent;
  const allowed = !idempotent && dedupedBlocking.length === 0;

  return {
    outcome: idempotent
      ? StationArchiveCommandOutcome.IDEMPOTENT
      : allowed
        ? StationArchiveCommandOutcome.APPLIED
        : StationArchiveCommandOutcome.BLOCKED,
    allowed: idempotent || allowed,
    idempotent,
    blockingReasons: dedupedBlocking,
    warnings: dedupeIssues(warnings),
    requiredActions: dedupeIssues(requiredActions),
  };
}

function dedupeIssues(items: StationArchiveCommandIssue[]): StationArchiveCommandIssue[] {
  const seen = new Set<string>();
  const result: StationArchiveCommandIssue[] = [];
  for (const item of items) {
    const key = `${item.code}::${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function buildArchivedCapabilitiesSnapshot(input: {
  pickupEnabled: boolean;
  returnEnabled: boolean;
  afterHoursReturnEnabled: boolean;
  keyBoxAvailable: boolean;
  isPrimary: boolean;
  archivedAt: Date;
  archivedByUserId: string | null;
  reason?: string | null;
}) {
  return {
    pickupEnabled: input.pickupEnabled,
    returnEnabled: input.returnEnabled,
    afterHoursReturnEnabled: input.afterHoursReturnEnabled,
    keyBoxAvailable: input.keyBoxAvailable,
    isPrimary: input.isPrimary,
    archivedAt: input.archivedAt.toISOString(),
    archivedByUserId: input.archivedByUserId,
    ...(input.reason ? { reason: input.reason } : {}),
  };
}

export function buildStationArchiveCommandAudit(
  input: {
    stationId: string;
    organizationId: string;
    previousStatus: StationStatus;
    nextStatus: StationStatus;
    performedByUserId: string | null;
    idempotent: boolean;
    successorPrimaryStationId?: string | null;
    acknowledgedFutureBookings?: boolean;
    archivedCapabilitiesSnapshot?: StationArchivedCapabilitiesSnapshot;
    futurePickupCount?: number;
    futureReturnCount?: number;
  },
  performedAt: Date = new Date(),
) {
  return {
    command: StationArchiveCommandName.ARCHIVE,
    stationId: input.stationId,
    organizationId: input.organizationId,
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    performedAt: performedAt.toISOString(),
    performedByUserId: input.performedByUserId,
    idempotent: input.idempotent,
    successorPrimaryStationId: input.successorPrimaryStationId,
    acknowledgedFutureBookings: input.acknowledgedFutureBookings,
    archivedCapabilitiesSnapshot: input.archivedCapabilitiesSnapshot,
    futurePickupCount: input.futurePickupCount,
    futureReturnCount: input.futureReturnCount,
  };
}
