import type { DeviceConnectionEpisode } from '@prisma/client';
import { DimoConnectionStatus } from '@prisma/client';
import {
  isPhysicalObdHardware,
  isPhysicalObdSnapshotSource,
} from './device-connection-episode-resolution.snapshot-evaluator';
import type {
  TelemetryRecoveryPolicy,
  TelemetryRecoveryPolicyVariant,
} from './device-connection-telemetry-recovery.policy';

export type TelemetryRecoveryRejectReason =
  | 'obd_false'
  | 'no_open_episode'
  | 'already_resolved'
  | 'same_snapshot_already_applied'
  | 'binding_mismatch'
  | 'provider_mismatch'
  | 'organization_mismatch'
  | 'observed_before_unplug'
  | 'received_before_unplug'
  | 'backfill_replay'
  | 'non_physical_obd_hardware'
  | 'non_physical_snapshot_source'
  | 'synthetic_snapshot_source'
  | 'oem_only_snapshot_source'
  | 'missing_provider_observed_at'
  | 'no_operational_signal'
  | 'telemetry_not_sustained';

export type TelemetryRecoveryGuardOutcome =
  | { action: 'record'; providerObservedAt: Date }
  | { action: 'reject'; reason: TelemetryRecoveryRejectReason }
  | { action: 'noop'; reason: 'already_resolved' | 'same_snapshot_already_applied' };

export interface TelemetryRecoverySignalInput {
  organizationId: string;
  vehicleId: string;
  provider: string;
  hardwareType: string | null;
  obdIsPluggedIn: boolean | null;
  providerObservedAt: Date | null;
  receivedAt: Date;
  snapshotSource: string | null;
  sourceSubtype: string | null;
  providerBindingId: string | null;
  snapshotReferenceId: string;
  providerConnectionStatus: string | null;
  hasOperationalSignal: boolean;
}

export interface TelemetryRecoveryObservationRow {
  providerObservedAt: Date;
  receivedAt: Date;
  hasOperationalSignal: boolean;
  connectionStatusActive: boolean;
}

export interface SustainedTelemetryEvaluation {
  satisfied: boolean;
  variant: TelemetryRecoveryPolicyVariant | null;
  evidenceAt: Date | null;
  observationCount: number;
}

export function buildTelemetrySnapshotReferenceId(input: {
  vehicleLatestStateId: string;
  providerObservedAt: Date;
}): string {
  return `vls:${input.vehicleLatestStateId}:tel:${input.providerObservedAt.toISOString()}`;
}

export function isProviderConnectionStatusActive(
  status: string | null | undefined,
): boolean {
  return (status ?? '').trim().toUpperCase() === DimoConnectionStatus.CONNECTED;
}

export function isBackfillReplay(
  input: Pick<TelemetryRecoverySignalInput, 'providerObservedAt' | 'receivedAt'>,
  policy: TelemetryRecoveryPolicy,
): boolean {
  if (!input.providerObservedAt) return true;
  const lagMs = input.receivedAt.getTime() - input.providerObservedAt.getTime();
  return lagMs > policy.maxBackfillLagMs;
}

export function evaluateTelemetryObservationGuard(
  input: TelemetryRecoverySignalInput,
  episode: DeviceConnectionEpisode | null,
  policy: TelemetryRecoveryPolicy,
): TelemetryRecoveryGuardOutcome {
  if (input.obdIsPluggedIn === false) {
    return { action: 'reject', reason: 'obd_false' };
  }

  if (!episode) {
    return { action: 'reject', reason: 'no_open_episode' };
  }

  if (episode.organizationId !== input.organizationId) {
    return { action: 'reject', reason: 'organization_mismatch' };
  }

  if (episode.vehicleId !== input.vehicleId || episode.provider !== input.provider) {
    return { action: 'reject', reason: 'provider_mismatch' };
  }

  if (episode.status !== 'OPEN') {
    if (episode.resolutionSnapshotId === input.snapshotReferenceId) {
      return { action: 'noop', reason: 'same_snapshot_already_applied' };
    }
    return { action: 'noop', reason: 'already_resolved' };
  }

  if (!isPhysicalObdHardware(input.hardwareType)) {
    return { action: 'reject', reason: 'non_physical_obd_hardware' };
  }

  const subtype = (input.sourceSubtype ?? '').trim().toUpperCase();
  if (subtype.includes('SYNTHETIC')) {
    return { action: 'reject', reason: 'synthetic_snapshot_source' };
  }
  if (subtype.includes('OEM') && !subtype.includes('OBD')) {
    return { action: 'reject', reason: 'oem_only_snapshot_source' };
  }
  if (!isPhysicalObdSnapshotSource(input)) {
    return { action: 'reject', reason: 'non_physical_snapshot_source' };
  }

  if (
    episode.deviceBindingId != null &&
    input.providerBindingId != null &&
    episode.deviceBindingId !== input.providerBindingId
  ) {
    return { action: 'reject', reason: 'binding_mismatch' };
  }

  if (!input.providerObservedAt) {
    return { action: 'reject', reason: 'missing_provider_observed_at' };
  }

  if (input.providerObservedAt.getTime() <= episode.openedAt.getTime()) {
    return { action: 'reject', reason: 'observed_before_unplug' };
  }

  if (input.receivedAt.getTime() <= episode.openedAt.getTime()) {
    return { action: 'reject', reason: 'received_before_unplug' };
  }

  if (isBackfillReplay(input, policy)) {
    return { action: 'reject', reason: 'backfill_replay' };
  }

  if (policy.requireOperationalSignal && !input.hasOperationalSignal) {
    return { action: 'reject', reason: 'no_operational_signal' };
  }

  return { action: 'record', providerObservedAt: input.providerObservedAt };
}

function operationalObservations(
  observations: TelemetryRecoveryObservationRow[],
  policy: TelemetryRecoveryPolicy,
): TelemetryRecoveryObservationRow[] {
  if (!policy.requireOperationalSignal) return observations;
  return observations.filter((row) => row.hasOperationalSignal);
}

function evaluateSpanVariant(
  observations: TelemetryRecoveryObservationRow[],
  policy: TelemetryRecoveryPolicy,
): SustainedTelemetryEvaluation {
  const ops = operationalObservations(observations, policy);
  if (ops.length < policy.minSnapshotsForSpan) {
    return {
      satisfied: false,
      variant: null,
      evidenceAt: null,
      observationCount: ops.length,
    };
  }

  const sorted = [...ops].sort(
    (a, b) => a.providerObservedAt.getTime() - b.providerObservedAt.getTime(),
  );

  for (let i = 1; i < sorted.length; i += 1) {
    const gap =
      sorted[i].providerObservedAt.getTime() -
      sorted[i - 1].providerObservedAt.getTime();
    if (gap > policy.maxGapBetweenSnapshotsMs) {
      return {
        satisfied: false,
        variant: null,
        evidenceAt: null,
        observationCount: ops.length,
      };
    }
  }

  const spanMs =
    sorted[sorted.length - 1].providerObservedAt.getTime() -
    sorted[0].providerObservedAt.getTime();

  if (spanMs < policy.minSpanMs) {
    return {
      satisfied: false,
      variant: null,
      evidenceAt: null,
      observationCount: ops.length,
    };
  }

  return {
    satisfied: true,
    variant: 'SPAN',
    evidenceAt: sorted[sorted.length - 1].providerObservedAt,
    observationCount: ops.length,
  };
}

function evaluateTripVariant(
  observations: TelemetryRecoveryObservationRow[],
  tripStartedOrCompletedAfterUnplug: boolean,
  policy: TelemetryRecoveryPolicy,
): SustainedTelemetryEvaluation {
  const ops = operationalObservations(observations, policy);
  if (!tripStartedOrCompletedAfterUnplug || ops.length < 1) {
    return {
      satisfied: false,
      variant: null,
      evidenceAt: null,
      observationCount: ops.length,
    };
  }

  const latest = [...ops].sort(
    (a, b) => b.providerObservedAt.getTime() - a.providerObservedAt.getTime(),
  )[0];

  return {
    satisfied: true,
    variant: 'TRIP',
    evidenceAt: latest.providerObservedAt,
    observationCount: ops.length,
  };
}

function evaluateConnectionStatusVariant(
  observations: TelemetryRecoveryObservationRow[],
  referenceReceivedAt: Date,
  policy: TelemetryRecoveryPolicy,
): SustainedTelemetryEvaluation {
  const freshOperational = operationalObservations(observations, policy).filter(
    (row) => {
      if (!row.connectionStatusActive) return false;
      const ageMs = referenceReceivedAt.getTime() - row.providerObservedAt.getTime();
      return ageMs >= 0 && ageMs <= policy.connectionStatusFreshWindowMs;
    },
  );

  if (freshOperational.length < policy.minFreshSnapshotsWithConnection) {
    return {
      satisfied: false,
      variant: null,
      evidenceAt: null,
      observationCount: freshOperational.length,
    };
  }

  const latest = [...freshOperational].sort(
    (a, b) => b.providerObservedAt.getTime() - a.providerObservedAt.getTime(),
  )[0];

  return {
    satisfied: true,
    variant: 'CONNECTION_STATUS',
    evidenceAt: latest.providerObservedAt,
    observationCount: freshOperational.length,
  };
}

export function evaluateSustainedTelemetryPolicy(input: {
  observations: TelemetryRecoveryObservationRow[];
  tripStartedOrCompletedAfterUnplug: boolean;
  referenceReceivedAt: Date;
  policy: TelemetryRecoveryPolicy;
}): SustainedTelemetryEvaluation {
  const span = evaluateSpanVariant(input.observations, input.policy);
  if (span.satisfied) return span;

  const trip = evaluateTripVariant(
    input.observations,
    input.tripStartedOrCompletedAfterUnplug,
    input.policy,
  );
  if (trip.satisfied) return trip;

  const connection = evaluateConnectionStatusVariant(
    input.observations,
    input.referenceReceivedAt,
    input.policy,
  );
  if (connection.satisfied) return connection;

  return {
    satisfied: false,
    variant: null,
    evidenceAt: null,
    observationCount: input.observations.length,
  };
}
