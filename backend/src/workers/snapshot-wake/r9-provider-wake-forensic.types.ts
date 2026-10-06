import {
  R9ProviderWakeForensicClassification,
  R9ProviderWakeForensicLineageRole,
  R9ProviderWakeForensicSnapshotStatus,
  TripDetectionState,
} from '@prisma/client';

import type { R9ProviderWakeCorrelationContext } from './r9-provider-wake-correlation.types';
import type { SnapshotWakeOutcome } from './snapshot-wake.types';

export {
  R9ProviderWakeForensicClassification,
  R9ProviderWakeForensicLineageRole,
  R9ProviderWakeForensicSnapshotStatus,
};

export class R9ProviderWakeForensicTenantConflictError extends Error {
  constructor(
    public readonly wakeCorrelationId: string,
    message: string,
  ) {
    super(message);
    this.name = 'R9ProviderWakeForensicTenantConflictError';
  }
}

export function mapSnapshotWakeOutcomeToForensicClassification(
  outcome: SnapshotWakeOutcome | 'INVALID_SIGNAL' | 'IGNORED_INELIGIBLE',
): R9ProviderWakeForensicClassification {
  switch (outcome) {
    case 'ENQUEUED':
    case 'RECOVERED_TERMINAL':
      return R9ProviderWakeForensicClassification.ADMITTED;
    case 'COALESCED':
      return R9ProviderWakeForensicClassification.COALESCED;
    case 'ALREADY_COVERED':
      return R9ProviderWakeForensicClassification.ALREADY_COVERED;
    case 'IGNORED_FSM_ACTIVE':
      return R9ProviderWakeForensicClassification.IGNORED_FSM_ACTIVE;
    case 'IGNORED_INELIGIBLE':
      return R9ProviderWakeForensicClassification.IGNORED_BINDING;
    case 'INVALID_SIGNAL':
      return R9ProviderWakeForensicClassification.IGNORED_SIGNAL;
    case 'QUEUE_FAILED':
      return R9ProviderWakeForensicClassification.QUEUE_FAILED;
    case 'PERSIST_FAILED':
      return R9ProviderWakeForensicClassification.PERSIST_FAILED;
    default:
      return R9ProviderWakeForensicClassification.OTHER;
  }
}

export interface R9ProviderWakeForensicIntakeRecord {
  correlation: R9ProviderWakeCorrelationContext;
  classification: R9ProviderWakeForensicClassification;
  fsmStateAtIntake?: TripDetectionState | null;
  lineageRole?: R9ProviderWakeForensicLineageRole | null;
}

export interface R9ProviderWakeForensicSnapshotLineageUpdate {
  wakeCorrelationId: string;
  organizationId: string;
  vehicleId: string;
  snapshotJobId?: string | null;
  snapshotRequestedAt?: Date | null;
  snapshotStartedAt?: Date | null;
  snapshotFinishedAt?: Date | null;
  providerFetchedAt?: Date | null;
  snapshotSourceTimestamp?: Date | null;
  snapshotStatus?: R9ProviderWakeForensicSnapshotStatus | null;
  lineageRole?: R9ProviderWakeForensicLineageRole | null;
}

export interface R9ProviderWakeForensicTripLineageUpdate {
  wakeCorrelationId: string;
  organizationId: string;
  vehicleId: string;
  fsmStateAfterEvaluation?: TripDetectionState | null;
  tripEvaluationResult?: string | null;
  possibleStartAt?: Date | null;
  activeTripAt?: Date | null;
  vehicleTripId?: string | null;
}
