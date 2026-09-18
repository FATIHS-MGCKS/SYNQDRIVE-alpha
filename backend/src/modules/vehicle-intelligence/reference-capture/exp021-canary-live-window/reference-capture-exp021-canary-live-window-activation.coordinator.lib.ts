import { EXP021_CANARY_LIVE_WINDOW_CANARY, EXP021_CANARY_LIVE_WINDOW_TOKEN_ID } from './reference-capture-exp021-canary-live-window-activation.constants';
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
  canaryTokenId: number;
  canaryVehicleId: string;
  canaryOrganizationId: string;
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
}): CanaryLiveWindowActivationConfig | null {
  if (!input.enabled) return null;
  const activationNotBeforeMs = parseActivationNotBeforeIso(input.activationNotBeforeIso);
  if (activationNotBeforeMs == null) return null;
  return {
    enabled: true,
    activationNotBeforeMs,
    canaryTokenId: EXP021_CANARY_LIVE_WINDOW_TOKEN_ID,
    canaryVehicleId: EXP021_CANARY_LIVE_WINDOW_CANARY.vehicleId,
    canaryOrganizationId: EXP021_CANARY_LIVE_WINDOW_CANARY.organizationId,
  };
}

export function isCanaryTripIdentity(trip: CanaryLiveWindowTripSnapshot, config: CanaryLiveWindowActivationConfig): boolean {
  return (
    trip.tokenId === config.canaryTokenId &&
    trip.vehicleId === config.canaryVehicleId &&
    trip.organizationId === config.canaryOrganizationId
  );
}

export function isFutureWindowTrip(trip: CanaryLiveWindowTripSnapshot, config: CanaryLiveWindowActivationConfig): boolean {
  return trip.startTimeMs >= config.activationNotBeforeMs;
}

export async function runCanaryLiveWindowActivationCoordinatorTick(args: {
  config: CanaryLiveWindowActivationConfig;
  ongoingTrips: CanaryLiveWindowTripSnapshot[];
  completedTrips: CanaryLiveWindowTripSnapshot[];
  ledgerByTripId: Map<string, CanaryLiveWindowLedgerSnapshot>;
  activeBlockingSessionId: string | null;
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
    if (
      isForeignBlockingReferenceCaptureSession({
        activeBlockingSessionId: args.activeBlockingSessionId,
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
