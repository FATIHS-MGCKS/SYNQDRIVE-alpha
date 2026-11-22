import type { Prisma } from '@prisma/client';
import type { OrganizationOffboardingExecutionPhase } from './organization-offboarding-execution.phases';

export type OrganizationOffboardingExecutionProgress = {
  phasesCompleted: OrganizationOffboardingExecutionPhase[];
  execution?: {
    idempotencyKey: string;
    claimedAt: string;
    actorUserId: string | null;
    lastRunAt?: string;
  };
  suspend?: { completedAt: string; priorStatus: string };
  sessions?: { revokedRefreshTokenCount: number; membershipVersionsBumped: number };
  vehicleBatch?: {
    processedVehicleIds: string[];
    blockedVehicleId?: string;
    blockedReasonCode?: string;
  };
  providerQuiesce?: {
    activeProviderConsentCount: number;
    connectedDimoVehicleCount: number;
    externalProviderDisconnect: 'NOT_AVAILABLE_P6D3';
    localQuiesceIncomplete: boolean;
  };
  readyForArchive?: { markedAt: string };
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
  };
}

export function toProgressJson(
  progress: OrganizationOffboardingExecutionProgress,
): Prisma.InputJsonValue {
  return progress as unknown as Prisma.InputJsonValue;
}