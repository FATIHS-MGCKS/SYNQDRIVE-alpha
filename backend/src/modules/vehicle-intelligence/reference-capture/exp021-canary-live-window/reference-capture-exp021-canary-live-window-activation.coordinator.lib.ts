import type { Exp021CanaryCohortAuthority, Exp021CanaryCohortMember } from './reference-capture-exp021-canary-live-window-cohort.lib';
import { isForensicExcludedVehicleTrip, resolveCohortMemberForTripIdentity } from './reference-capture-exp021-canary-live-window-cohort.lib';
import {
  CanaryLiveWindowLedgerState,
  isCanaryLedgerArmComplete,
  isCanaryLedgerArmInProgress,
  isCanaryLedgerFinalizeEligible,
  isForeignBlockingReferenceCaptureSession,
} from './reference-capture-exp021-canary-live-window-activation.claim.lib';

export type CanaryLiveWindowTripSnapshot = {
  tripId: string;
  vehicleId: string;
  organizationId: string;
  tokenId: number;
  tripStatus: 'ONGOING' | 'COMPLETED';
  startTimeMs: number;
  endTimeMs: number | null;
};

export type CanaryLiveWindowLedgerSnapshot = {
  vehicleTripId: string;
  state: CanaryLiveWindowLedgerState;
  sessionId: string | null;
};

export type CanaryLiveWindowActivationConfig = {
  enabled: boolean;
  activationNotBeforeMs: number;
  cohort: Exp021CanaryCohortAuthority;
};

export type CanaryLiveWindowActivationPorts = {
  armOngoingTrip: (trip: CanaryLiveWindowTripSnapshot) => Promise<{
    sessionId: string;
    studyRunId: string;
  }>;
  finalizeCompletedTrip: (args: {
    trip: CanaryLiveWindowTripSnapshot;
    ledger: CanaryLiveWindowLedgerSnapshot;
  }) => Promise<void>;
};

export type CanaryLiveWindowCoordinatorTickResult = {
  armedTripIds: string[];
  finalizedTripIds: string[];
  skippedReasons: Array<{ tripId: string; reason: string }>;
};

export function parseActivationNotBeforeIso(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const ms = Date.parse(value.trim());
  return Number.isFinite(ms) ? ms : null;
}

export function buildCanaryLiveWindowActivationConfig(input: {
  enabled: boolean;
  activationNotBeforeIso: string | undefined;
  cohort: Exp021CanaryCohortAuthority | null;
}): CanaryLiveWindowActivationConfig | null {
  if (!input.enabled) return null;
  const activationNotBeforeMs = parseActivationNotBeforeIso(input.activationNotBeforeIso);
  if (activationNotBeforeMs == null) return null;
  if (!input.cohort || input.cohort.members.length === 0) return null;
  return {
    enabled: true,
    activationNotBeforeMs,
    cohort: input.cohort,
  };
}

export function resolveCohortMemberForTrip(
  trip: CanaryLiveWindowTripSnapshot,
  config: CanaryLiveWindowActivationConfig,
): Exp021CanaryCohortMember | null {
  if (isForensicExcludedVehicleTrip(trip.tripId)) return null;
  return resolveCohortMemberForTripIdentity({
    organizationId: trip.organizationId,
    vehicleId: trip.vehicleId,
    tokenId: trip.tokenId,
    cohort: config.cohort,
  });
}

export function isCanaryTripIdentity(
  trip: CanaryLiveWindowTripSnapshot,
  config: CanaryLiveWindowActivationConfig,
): boolean {
  return resolveCohortMemberForTrip(trip, config) != null;
}

export function isFutureWindowTrip(trip: CanaryLiveWindowTripSnapshot, config: CanaryLiveWindowActivationConfig): boolean {
  return trip.startTimeMs >= config.activationNotBeforeMs;
}

export async function runCanaryLiveWindowActivationCoordinatorTick(args: {
  config: CanaryLiveWindowActivationConfig;
  ongoingTrips: CanaryLiveWindowTripSnapshot[];
  completedTrips: CanaryLiveWindowTripSnapshot[];
  ledgerByTripId: Map<string, CanaryLiveWindowLedgerSnapshot>;
  activeBlockingSessionByVehicleId: Map<string, string>;
  ports: CanaryLiveWindowActivationPorts;
}): Promise<CanaryLiveWindowCoordinatorTickResult> {
  const result: CanaryLiveWindowCoordinatorTickResult = {
    armedTripIds: [],
    finalizedTripIds: [],
    skippedReasons: [],
  };

  for (const trip of args.ongoingTrips) {
    if (!isCanaryTripIdentity(trip, args.config)) {
      result.skippedReasons.push({ tripId: trip.tripId, reason: 'NON_CANARY_TOKEN_OR_VEHICLE' });
      continue;
    }
    if (!isFutureWindowTrip(trip, args.config)) {
      result.skippedReasons.push({ tripId: trip.tripId, reason: 'HISTORICAL_TRIP_BEFORE_ACTIVATION_T0' });
      continue;
    }

    const ledger = args.ledgerByTripId.get(trip.tripId);
    if (ledger && isCanaryLedgerArmComplete(ledger.state)) {
      result.skippedReasons.push({ tripId: trip.tripId, reason: 'LEDGER_ARM_ALREADY_COMPLETE' });
      continue;
    }
    if (ledger?.state === 'FAILED') {
      result.skippedReasons.push({ tripId: trip.tripId, reason: 'LEDGER_FAILED' });
      continue;
    }

    const resumeInProgress = ledger != null && isCanaryLedgerArmInProgress(ledger.state);
    const activeBlockingSessionId =
      args.activeBlockingSessionByVehicleId.get(trip.vehicleId) ?? null;
    if (
      isForeignBlockingReferenceCaptureSession({
        activeBlockingSessionId,
        ledgerForTrip: ledger,
      }) &&
      !resumeInProgress
    ) {
      result.skippedReasons.push({ tripId: trip.tripId, reason: 'ACTIVE_REFERENCE_CAPTURE_SESSION' });
      continue;
    }

    await args.ports.armOngoingTrip(trip);
    result.armedTripIds.push(trip.tripId);
  }

  for (const trip of args.completedTrips) {
    if (!isCanaryTripIdentity(trip, args.config)) continue;
    if (!isFutureWindowTrip(trip, args.config)) continue;
    const ledger = args.ledgerByTripId.get(trip.tripId);
    if (!ledger) {
      result.skippedReasons.push({ tripId: trip.tripId, reason: 'NO_LEDGER_MISS_NO_BACKFILL' });
      continue;
    }
    if (ledger.state === 'TRIP_COMPLETED_SEEN' || ledger.state === 'FINALIZED' || ledger.state === 'FAILED') {
      continue;
    }
    if (!ledger.sessionId) {
      result.skippedReasons.push({ tripId: trip.tripId, reason: 'LEDGER_WITHOUT_SESSION' });
      continue;
    }
    if (!isCanaryLedgerFinalizeEligible(ledger.state)) {
      result.skippedReasons.push({ tripId: trip.tripId, reason: 'LEDGER_NOT_READY_FOR_FINALIZE' });
      continue;
    }
    await args.ports.finalizeCompletedTrip({ trip, ledger });
    result.finalizedTripIds.push(trip.tripId);
  }

  return result;
}
