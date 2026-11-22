import type { Prisma } from '@prisma/client';
import type { OrganizationOffboardingExecutionPhase } from './organization-offboarding-execution.phases';

export type ProviderFinalizationState =
  | 'NO_EXTERNAL_PROVIDER_DEPENDENCY'
  | 'LOCAL_QUIESCE_CONFIRMED'
  | 'EXTERNAL_DISCONNECT_PENDING'
  | 'EXTERNAL_DISCONNECT_CONFIRMED';

export type OrganizationOffboardingExecutionProgress = {
  phasesCompleted: OrganizationOffboardingExecutionPhase[];
  execution?: {
    idempotencyKey: string;
    claimedAt: string;
    actorUserId: string | null;
    lastRunAt?: string;
  };
  executionLease?: {
    token: string;
    fence: number;
    expiresAt: string;
    executionIdempotencyKey: string;
  };
  suspend?: { completedAt: string; priorStatus: string };
  sessions?: {
    completedAt: string;
    revokedRefreshTokenCount: number;
    membershipVersionsBumped: number;
  };
  vehicleBatch?: {
    processedVehicleIds: string[];
    blockedVehicleId?: string;
    blockedReasonCode?: string;
  };
  providerQuiesce?: {
    activeProviderConsentCount: number;
    connectedDimoVehicleCount: number;
    historicalProviderConsentCount: number;
    everHadDimoVehicleLink: boolean;
    finalizationState: ProviderFinalizationState;
    providerEvidence?: {
      dimo: unknown;
      hm: unknown;
      assessedAt: string;
    };
  };
  readyForArchive?: { markedAt: string };
  finalize?: {
    idempotencyKey: string;
    claimedAt: string;
    actorUserId: string | null;
    inProgress?: boolean;
    completedAt?: string;
    lastErrorCode?: string;
    lastBlockedDetail?: string;
  };
  finalizeLease?: {
    token: string;
    fence: number;
    expiresAt: string;
    finalizeIdempotencyKey: string;
  };
  archived?: {
    organizationStatus: string;
    archivedAt: string;
    auditActivityLogId?: string;
  };
};

export function parseExecutionProgress(raw: unknown): OrganizationOffboardingExecutionProgress {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { phasesCompleted: [] };
  }
  const record = raw as Record<string, unknown>;
  const phasesCompleted = Array.isArray(record.phasesCompleted)
    ? record.phasesCompleted.filter((p): p is OrganizationOffboardingExecutionPhase => typeof p === 'string')
    : [];
  return {
    phasesCompleted,
    ...(record.execution && typeof record.execution === 'object'
      ? { execution: record.execution as OrganizationOffboardingExecutionProgress['execution'] }
      : {}),
    ...(record.executionLease && typeof record.executionLease === 'object'
      ? {
          executionLease:
            record.executionLease as OrganizationOffboardingExecutionProgress['executionLease'],
        }
      : {}),
    ...(record.suspend && typeof record.suspend === 'object'
      ? { suspend: record.suspend as OrganizationOffboardingExecutionProgress['suspend'] }
      : {}),
    ...(record.sessions && typeof record.sessions === 'object'
      ? { sessions: record.sessions as OrganizationOffboardingExecutionProgress['sessions'] }
      : {}),
    ...(record.vehicleBatch && typeof record.vehicleBatch === 'object'
      ? { vehicleBatch: record.vehicleBatch as OrganizationOffboardingExecutionProgress['vehicleBatch'] }
      : {}),
    ...(record.providerQuiesce && typeof record.providerQuiesce === 'object'
      ? { providerQuiesce: record.providerQuiesce as OrganizationOffboardingExecutionProgress['providerQuiesce'] }
      : {}),
    ...(record.readyForArchive && typeof record.readyForArchive === 'object'
      ? { readyForArchive: record.readyForArchive as OrganizationOffboardingExecutionProgress['readyForArchive'] }
      : {}),
    ...(record.finalize && typeof record.finalize === 'object'
      ? { finalize: record.finalize as OrganizationOffboardingExecutionProgress['finalize'] }
      : {}),
    ...(record.finalizeLease && typeof record.finalizeLease === 'object'
      ? {
          finalizeLease:
            record.finalizeLease as OrganizationOffboardingExecutionProgress['finalizeLease'],
        }
      : {}),
    ...(record.archived && typeof record.archived === 'object'
      ? { archived: record.archived as OrganizationOffboardingExecutionProgress['archived'] }
      : {}),
  };
}

export function toProgressJson(
  progress: OrganizationOffboardingExecutionProgress,
): Prisma.InputJsonValue {
  return progress as unknown as Prisma.InputJsonValue;
}