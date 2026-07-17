import { StationStatus } from '@prisma/client';
import {
  evaluateStationLifecycle,
  StationLifecycleCommand,
  StationLifecycleWarningCode,
  type StationLifecycleSnapshot,
} from '@shared/stations/station-lifecycle.policy';
import {
  StationLifecycleCommandIssue,
  StationLifecycleCommandIssueCode,
  StationLifecycleCommandName,
  StationLifecycleCommandOutcome,
  type StationDeactivatePreflightCounts,
} from './station-lifecycle-command.types';

export interface StationLifecycleCommandEvaluationInput {
  command: typeof StationLifecycleCommandName.ACTIVATE | typeof StationLifecycleCommandName.DEACTIVATE;
  station: StationLifecycleSnapshot;
  preflight?: StationDeactivatePreflightCounts;
}

export interface StationLifecycleCommandEvaluation {
  outcome: StationLifecycleCommandOutcome;
  allowed: boolean;
  blockingReasons: StationLifecycleCommandIssue[];
  warnings: StationLifecycleCommandIssue[];
  requiredActions: StationLifecycleCommandIssue[];
  enforcedMutations?: { status?: StationStatus };
  idempotent: boolean;
}

function mapPolicyIssues(
  items: Array<{ code: string; message: string }>,
): StationLifecycleCommandIssue[] {
  return items.map((item) => ({ code: item.code, message: item.message }));
}

function evaluateActivateCommand(
  station: StationLifecycleSnapshot,
): StationLifecycleCommandEvaluation {
  const policy = evaluateStationLifecycle({
    command: StationLifecycleCommand.ACTIVATE,
    station,
  });

  const idempotent = policy.warnings.some(
    (w) => w.code === StationLifecycleWarningCode.IDEMPOTENT_ACTIVATE,
  );

  const warnings = mapPolicyIssues(policy.warnings);
  if (!idempotent && (!station.pickupEnabled || !station.returnEnabled)) {
    warnings.push({
      code: StationLifecycleCommandIssueCode.CAPABILITIES_UNCHANGED_ON_ACTIVATE,
      message: 'Activation does not automatically re-enable pickup or return capabilities.',
    });
  }

  return {
    outcome: policy.allowed
      ? idempotent
        ? StationLifecycleCommandOutcome.IDEMPOTENT
        : StationLifecycleCommandOutcome.APPLIED
      : StationLifecycleCommandOutcome.BLOCKED,
    allowed: policy.allowed,
    blockingReasons: mapPolicyIssues(policy.blockingReasons),
    warnings,
    requiredActions: mapPolicyIssues(policy.requiredActions),
    enforcedMutations: policy.enforcedMutations,
    idempotent,
  };
}

function evaluateDeactivateCommand(
  station: StationLifecycleSnapshot,
  preflight: StationDeactivatePreflightCounts,
): StationLifecycleCommandEvaluation {
  const policy = evaluateStationLifecycle({
    command: StationLifecycleCommand.DEACTIVATE,
    station,
  });

  const blockingReasons = mapPolicyIssues(policy.blockingReasons);
  const warnings = mapPolicyIssues(policy.warnings);

  if (preflight.futurePickupCount > 0) {
    blockingReasons.push({
      code: StationLifecycleCommandIssueCode.FUTURE_PICKUPS_BLOCK_DEACTIVATE,
      message: `Station has ${preflight.futurePickupCount} future pickup booking(s).`,
    });
  }
  if (preflight.futureReturnCount > 0) {
    blockingReasons.push({
      code: StationLifecycleCommandIssueCode.FUTURE_RETURNS_BLOCK_DEACTIVATE,
      message: `Station has ${preflight.futureReturnCount} future return booking(s).`,
    });
  }

  const idempotent = policy.warnings.some(
    (w) => w.code === StationLifecycleWarningCode.IDEMPOTENT_DEACTIVATE,
  );

  if (station.isPrimary && policy.allowed && blockingReasons.length === 0) {
    warnings.push({
      code: StationLifecycleCommandIssueCode.PRIMARY_REMAINS_WHILE_INACTIVE,
      message: 'Station remains marked as primary while inactive; consider transferring primary.',
    });
  }

  const allowed = policy.allowed && blockingReasons.length === 0;

  return {
    outcome: allowed
      ? idempotent
        ? StationLifecycleCommandOutcome.IDEMPOTENT
        : StationLifecycleCommandOutcome.APPLIED
      : StationLifecycleCommandOutcome.BLOCKED,
    allowed,
    blockingReasons,
    warnings,
    requiredActions: mapPolicyIssues(policy.requiredActions),
    enforcedMutations: allowed ? policy.enforcedMutations : undefined,
    idempotent,
  };
}

export function evaluateStationLifecycleCommand(
  input: StationLifecycleCommandEvaluationInput,
): StationLifecycleCommandEvaluation {
  if (input.command === StationLifecycleCommandName.ACTIVATE) {
    return evaluateActivateCommand(input.station);
  }
  return evaluateDeactivateCommand(input.station, input.preflight ?? {
    futurePickupCount: 0,
    futureReturnCount: 0,
  });
}

export function buildStationLifecycleCommandAudit(
  input: {
    command: StationLifecycleCommandName;
    stationId: string;
    organizationId: string;
    previousStatus: StationLifecycleSnapshot['status'];
    nextStatus: StationLifecycleSnapshot['status'];
    idempotent: boolean;
    preflight?: StationDeactivatePreflightCounts;
  },
  performedAt: Date = new Date(),
) {
  return {
    command: input.command,
    stationId: input.stationId,
    organizationId: input.organizationId,
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    performedAt: performedAt.toISOString(),
    idempotent: input.idempotent,
    futurePickupCount: input.preflight?.futurePickupCount,
    futureReturnCount: input.preflight?.futureReturnCount,
  };
}
