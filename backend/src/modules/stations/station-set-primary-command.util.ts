import { Prisma } from '@prisma/client';
import {
  evaluateStationLifecycle,
  StationLifecycleCommand,
  StationLifecycleWarningCode,
} from '@shared/stations/station-lifecycle.policy';
import type { StationLifecycleSnapshot } from '@shared/stations/station-lifecycle.policy.types';
import {
  StationSetPrimaryCommandIssueCode,
  StationSetPrimaryCommandName,
  StationSetPrimaryCommandOutcome,
  type StationSetPrimaryCommandAuditData,
  type StationSetPrimaryCommandEvaluation,
  type StationSetPrimaryCommandIssue,
  type StationSetPrimaryPreflightSnapshot,
} from './station-set-primary-command.types';

export const STATION_PRIMARY_UNIQUE_INDEX = 'stations_one_primary_per_org';

function issue(code: string, message: string): StationSetPrimaryCommandIssue {
  return { code, message };
}

function mapPolicyIssues(
  items: Array<{ code: string; message: string }>,
): StationSetPrimaryCommandIssue[] {
  return items.map((item) => ({ code: item.code, message: item.message }));
}

export function isStationPrimaryUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2002') return false;
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.some(
      (entry) =>
        typeof entry === 'string' &&
        (entry === STATION_PRIMARY_UNIQUE_INDEX || entry.includes('one_primary')),
    );
  }
  if (typeof target === 'string') {
    return target.includes(STATION_PRIMARY_UNIQUE_INDEX) || target.includes('one_primary');
  }
  return false;
}

export function evaluateStationSetPrimaryCommand(input: {
  station: StationLifecycleSnapshot;
  preflight: StationSetPrimaryPreflightSnapshot;
}): StationSetPrimaryCommandEvaluation {
  const policy = evaluateStationLifecycle({
    command: StationLifecycleCommand.SET_PRIMARY,
    station: input.station,
  });

  const blockingReasons = mapPolicyIssues(policy.blockingReasons);
  const warnings = mapPolicyIssues(policy.warnings);
  const requiredActions = mapPolicyIssues(policy.requiredActions);

  const solePrimary =
    input.station.isPrimary &&
    input.station.status === 'ACTIVE' &&
    input.preflight.nonArchivedPrimaryCount === 1 &&
    input.preflight.otherPrimaryStationIds.length === 0;

  const idempotent =
    solePrimary &&
    policy.allowed &&
    policy.warnings.some((w) => w.code === StationLifecycleWarningCode.IDEMPOTENT_SET_PRIMARY);

  if (idempotent) {
    return {
      outcome: StationSetPrimaryCommandOutcome.IDEMPOTENT,
      allowed: true,
      idempotent: true,
      blockingReasons: [],
      warnings,
      requiredActions,
    };
  }

  const allowed = policy.allowed && blockingReasons.length === 0;

  return {
    outcome: allowed
      ? StationSetPrimaryCommandOutcome.APPLIED
      : StationSetPrimaryCommandOutcome.BLOCKED,
    allowed,
    idempotent: false,
    blockingReasons,
    warnings,
    requiredActions,
  };
}

export function buildStationSetPrimaryConflictIssue(): StationSetPrimaryCommandIssue {
  return issue(
    StationSetPrimaryCommandIssueCode.PRIMARY_CONFLICT,
    'Another request updated the primary station concurrently. Retry SetPrimaryStation.',
  );
}

export function buildStationSetPrimaryCommandAudit(
  input: {
    stationId: string;
    organizationId: string;
    previousIsPrimary: boolean;
    nextIsPrimary: boolean;
    previousStatus: StationLifecycleSnapshot['status'];
    nextStatus: StationLifecycleSnapshot['status'];
    performedByUserId: string | null;
    idempotent: boolean;
    demotedPrimaryStationIds: string[];
  },
  performedAt: Date = new Date(),
): StationSetPrimaryCommandAuditData {
  return {
    command: StationSetPrimaryCommandName.SET_PRIMARY,
    stationId: input.stationId,
    organizationId: input.organizationId,
    previousIsPrimary: input.previousIsPrimary,
    nextIsPrimary: input.nextIsPrimary,
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    performedAt: performedAt.toISOString(),
    performedByUserId: input.performedByUserId,
    idempotent: input.idempotent,
    demotedPrimaryStationIds: input.demotedPrimaryStationIds,
  };
}
