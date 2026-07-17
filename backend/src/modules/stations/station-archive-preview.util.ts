import {
  evaluateStationLifecycle,
  StationLifecycleCommand,
  StationLifecycleWarningCode,
} from '@shared/stations/station-lifecycle.policy';
import type { StationLifecycleSnapshot } from '@shared/stations/station-lifecycle.policy.types';
import {
  StationArchivePreviewIssueCode,
  type StationArchivePreviewEvaluation,
  type StationArchivePreviewIssue,
  type StationArchivePreviewPreflightCounts,
  type StationArchivePreviewSnapshotInput,
} from './station-archive-preview.types';

export interface EvaluateStationArchivePreviewInput {
  snapshot: StationArchivePreviewSnapshotInput;
  counts: StationArchivePreviewPreflightCounts;
}

function issue(code: string, message: string): StationArchivePreviewIssue {
  return { code, message };
}

function mapPolicyIssues(
  items: Array<{ code: string; message: string }>,
): StationArchivePreviewIssue[] {
  return items.map((item) => ({ code: item.code, message: item.message }));
}

export function evaluateStationArchivePreview(
  input: EvaluateStationArchivePreviewInput,
): StationArchivePreviewEvaluation {
  const { snapshot, counts } = input;
  const alreadyArchived = snapshot.status === 'ARCHIVED';

  const station: StationLifecycleSnapshot = {
    id: snapshot.stationId,
    status: snapshot.status,
    isPrimary: snapshot.isPrimary,
    pickupEnabled: snapshot.pickupEnabled,
    returnEnabled: snapshot.returnEnabled,
    archivedAt: snapshot.archivedAt,
  };

  const successorCandidate = snapshot.successorCandidates[0];
  const policy = evaluateStationLifecycle({
    command: StationLifecycleCommand.ARCHIVE,
    station,
    context: {
      successorPrimaryStationId: successorCandidate?.id,
      successorPrimaryStationStatus: successorCandidate ? 'ACTIVE' : undefined,
      activeBookingCount: counts.activeBookings,
    },
  });

  const blockingReasons = mapPolicyIssues(policy.blockingReasons);
  const warnings = mapPolicyIssues(policy.warnings);
  const requiredFollowUpActions = mapPolicyIssues(policy.requiredActions);

  const idempotent = policy.warnings.some(
    (warning) => warning.code === StationLifecycleWarningCode.IDEMPOTENT_ARCHIVE,
  );

  if (counts.homeVehicles > 0) {
    warnings.push(
      issue(
        StationArchivePreviewIssueCode.HOME_VEHICLES_REMAIN,
        `${counts.homeVehicles} vehicle(s) still list this station as home.`,
      ),
    );
    if (!alreadyArchived) {
      requiredFollowUpActions.push(
        issue(
          StationArchivePreviewIssueCode.REVIEW_VEHICLE_LINKS,
          'Review home-station assignments before or after archiving.',
        ),
      );
    }
  }

  if (counts.presentVehicles > 0) {
    warnings.push(
      issue(
        StationArchivePreviewIssueCode.PRESENT_VEHICLES_REMAIN,
        `${counts.presentVehicles} vehicle(s) are currently present at this station.`,
      ),
    );
  }

  if (counts.expectedVehicles > 0) {
    warnings.push(
      issue(
        StationArchivePreviewIssueCode.EXPECTED_VEHICLES_REMAIN,
        `${counts.expectedVehicles} vehicle(s) are expected at this station.`,
      ),
    );
  }

  if (counts.plannedTransfers > 0) {
    warnings.push(
      issue(
        StationArchivePreviewIssueCode.PLANNED_TRANSFERS_REMAIN,
        `${counts.plannedTransfers} planned transfer(s) target this station.`,
      ),
    );
  }

  if (counts.futurePickupBookings > 0) {
    warnings.push(
      issue(
        StationArchivePreviewIssueCode.FUTURE_PICKUPS_REMAIN,
        `${counts.futurePickupBookings} future pickup booking(s) reference this station.`,
      ),
    );
    requiredFollowUpActions.push(
      issue(
        StationArchivePreviewIssueCode.REVIEW_BOOKINGS,
        'Review or reassign future pickup bookings before archiving.',
      ),
    );
  }

  if (counts.futureReturnBookings > 0) {
    warnings.push(
      issue(
        StationArchivePreviewIssueCode.FUTURE_RETURNS_REMAIN,
        `${counts.futureReturnBookings} future return booking(s) reference this station.`,
      ),
    );
    requiredFollowUpActions.push(
      issue(
        StationArchivePreviewIssueCode.REVIEW_BOOKINGS,
        'Review or reassign future return bookings before archiving.',
      ),
    );
  }

  if (counts.openHandovers > 0) {
    warnings.push(
      issue(
        StationArchivePreviewIssueCode.OPEN_HANDOVERS_REMAIN,
        `${counts.openHandovers} open handover(s) are linked to this station.`,
      ),
    );
  }

  if (counts.scopedStaff > 0) {
    warnings.push(
      issue(
        StationArchivePreviewIssueCode.SCOPED_STAFF_REMAINS,
        `${counts.scopedStaff} staff member(s) are scoped to this station.`,
      ),
    );
    requiredFollowUpActions.push(
      issue(
        StationArchivePreviewIssueCode.REVIEW_STAFF_SCOPE,
        'Update station scope for affected staff memberships after archiving.',
      ),
    );
  }

  if (counts.openTasks > 0) {
    warnings.push(
      issue(
        StationArchivePreviewIssueCode.OPEN_TASKS_REMAIN,
        `${counts.openTasks} open task(s) are linked to this station.`,
      ),
    );
  }

  if (
    snapshot.isPrimary &&
    snapshot.successorCandidates.length === 0 &&
    !alreadyArchived &&
    !blockingReasons.some(
      (reason) => reason.code === StationArchivePreviewIssueCode.PRIMARY_ARCHIVE_REQUIRES_SUCCESSOR,
    )
  ) {
    blockingReasons.push(
      issue(
        StationArchivePreviewIssueCode.PRIMARY_ARCHIVE_REQUIRES_SUCCESSOR,
        'Primary station cannot be archived without another active station to succeed it.',
      ),
    );
    requiredFollowUpActions.push(
      issue(
        StationArchivePreviewIssueCode.SET_SUCCESSOR_PRIMARY,
        'Designate another active station as the new primary before archiving.',
      ),
    );
  }

  const dedupedRequired = dedupeIssues(requiredFollowUpActions);
  const dedupedWarnings = dedupeIssues(warnings);
  const dedupedBlocking = dedupeIssues(blockingReasons);

  return {
    archiveAllowed: policy.allowed && dedupedBlocking.length === 0,
    idempotent,
    blockingReasons: dedupedBlocking,
    warnings: dedupedWarnings,
    requiredFollowUpActions: dedupedRequired,
    affectedCounts: { ...counts },
  };
}

function dedupeIssues(items: StationArchivePreviewIssue[]): StationArchivePreviewIssue[] {
  const seen = new Set<string>();
  const result: StationArchivePreviewIssue[] = [];
  for (const item of items) {
    const key = `${item.code}::${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function buildArchivePreviewListSection<T>(
  items: T[],
  totalCount: number,
  limit: number,
): {
  items: T[];
  totalCount: number;
  truncated: boolean;
  limit: number;
} {
  return {
    items,
    totalCount,
    truncated: totalCount > items.length,
    limit,
  };
}
