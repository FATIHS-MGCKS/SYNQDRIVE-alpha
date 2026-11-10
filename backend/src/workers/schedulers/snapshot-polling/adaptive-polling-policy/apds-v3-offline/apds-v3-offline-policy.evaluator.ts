import {
  evaluateP25ApdB2V1Core,
  evaluateP25ApdB4V1Core,
} from '../p25-apd-policy-engine';
import type { P25ApdShadowPrePollInput } from '../p25-apd-shadow-decision.types';
import {
  APDS_V3_OFFLINE_POLICY_VERSION,
  type ApdsV3OfflinePolicyDecision,
  type ApdsV3OfflinePolicyInput,
} from './apds-v3-offline.types';
import {
  estimateVsiInformationGain,
  hardestUnmetSnapshotConsumer,
} from './vsi-information-gain.v1';
import { listSnapshotBackedConsumers } from './consumer-demand-registry.v1';

const MAX_PHYSICAL_POLL_AGE_WATCHDOG_MS = 3_600_000;
const BACKOFF_SKIP_GAIN_THRESHOLD = 0.15;
const HYSTERESIS_MIN_POLL_GAP_MS = 60_000;

export function buildP25ShadowInputFromOffline(
  input: ApdsV3OfflinePolicyInput,
): P25ApdShadowPrePollInput {
  return {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    decisionAtMs: input.decisionAtMs,
    reconciliation: input.reconciliation,
    lastAllowedReconciliationPollMs: input.lastPhysicalPollMs ?? 0,
    lastTrustworthyLvSourceMs: input.lastLvProviderSourceMs,
    lastProviderFetchedAtMs: input.lastProviderFetchedAtMs,
    profileClass: input.profileClass,
    profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
    medianIntervalMs: input.medianIntervalMs,
    tripFsmActive: input.tripFsmState === 'ACTIVE',
    providerGapOpen: input.providerGapOpen,
    r9WakePending: input.providerWakeOrReconnect,
  };
}

/**
 * Pure offline V3 policy — no side effects; does not call BullMQ or schedulers.
 */
export function evaluateApdsV3OfflinePolicy(
  input: ApdsV3OfflinePolicyInput,
): ApdsV3OfflinePolicyDecision {
  if (input.excludeFromOptimizationCalibration) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'NOT_ASSESSABLE',
      reason: 'KS_MX_2024_EXCLUDED_FROM_CALIBRATION',
      expectedInformationGain: null,
      heuristic: false,
      hardSafetyTriggered: false,
    };
  }

  if (!input.reconciliation || input.tripFsmState === 'ACTIVE') {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'FORCED_SAFETY_POLL',
      reason: 'TRIP_ACTIVE_OR_RECONCILIATION_OFF',
      expectedInformationGain: null,
      heuristic: false,
      hardSafetyTriggered: true,
    };
  }

  if (input.providerWakeOrReconnect || input.providerGapOpen) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'FORCED_SAFETY_POLL',
      reason: input.providerWakeOrReconnect
        ? 'WAKE_OR_RECONNECT_OVERRIDE'
        : 'PROVIDER_GAP_OVERRIDE',
      expectedInformationGain: null,
      heuristic: false,
      hardSafetyTriggered: true,
    };
  }

  if (input.sourceLinkInvalidated) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'FORCED_SAFETY_POLL',
      reason: 'SOURCE_LINK_INVALIDATION',
      expectedInformationGain: null,
      heuristic: false,
      hardSafetyTriggered: true,
    };
  }

  if (input.tripFsmState === 'UNKNOWN') {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'INSUFFICIENT_EVIDENCE',
      reason: 'TRIP_FSM_UNKNOWN',
      expectedInformationGain: null,
      heuristic: false,
      hardSafetyTriggered: false,
    };
  }

  const gainInput = {
    decisionAtMs: input.decisionAtMs,
    lastLvProviderSourceMs: input.lastLvProviderSourceMs,
    lastTopLevelProviderSourceMs: input.lastTopLevelProviderSourceMs,
    lastPhysicalPollMs: input.lastPhysicalPollMs,
    medianIntervalMs: input.medianIntervalMs,
    profileStability:
      input.profileClass === 'STABLE_PERIODIC'
        ? ('STABLE_PERIODIC' as const)
        : input.profileClass === 'PROVIDER_OBSERVABILITY_GAP'
          ? ('UNKNOWN' as const)
          : ('UNSTABLE' as const),
    observationQuality: input.signalProfileRevision ? ('HIGH' as const) : ('UNKNOWN' as const),
    p2cTopLevelAdvanceKnown: input.p2cTopLevelAdvanceKnown,
  };
  const gain = estimateVsiInformationGain(gainInput);

  if (gain.contradictoryEvidence) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'INSUFFICIENT_EVIDENCE',
      reason: 'CONTRADICTORY_VSI_EVIDENCE',
      expectedInformationGain: gain.expectedGain,
      heuristic: true,
      hardSafetyTriggered: false,
    };
  }

  const hardConsumer = hardestUnmetSnapshotConsumer(
    listSnapshotBackedConsumers(),
    gainInput,
  );
  if (hardConsumer) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'FORCED_SAFETY_POLL',
      reason: `CONSUMER_HARD_FRESHNESS:${hardConsumer.consumerId}`,
      expectedInformationGain: gain.expectedGain,
      heuristic: true,
      hardSafetyTriggered: true,
    };
  }

  if (
    input.lastPhysicalPollMs != null &&
    input.decisionAtMs - input.lastPhysicalPollMs >= MAX_PHYSICAL_POLL_AGE_WATCHDOG_MS
  ) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'FORCED_SAFETY_POLL',
      reason: 'MAX_AGE_WATCHDOG',
      expectedInformationGain: gain.expectedGain,
      heuristic: true,
      hardSafetyTriggered: true,
    };
  }

  if (input.providerErrorRecent) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'FORCED_SAFETY_POLL',
      reason: 'PROVIDER_ERROR_RECOVERY',
      expectedInformationGain: gain.expectedGain,
      heuristic: true,
      hardSafetyTriggered: true,
    };
  }

  const shadow = buildP25ShadowInputFromOffline(input);
  const b2 = evaluateP25ApdB2V1Core(shadow);
  const b4 = evaluateP25ApdB4V1Core(shadow);
  const frozenWouldPoll =
    b2.decision === 'WOULD_POLL' && b4.decision === 'WOULD_POLL';

  if (
    input.lastPhysicalPollMs != null &&
    input.decisionAtMs - input.lastPhysicalPollMs < HYSTERESIS_MIN_POLL_GAP_MS
  ) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'WOULD_SKIP',
      reason: 'HYSTERESIS_MIN_GAP',
      expectedInformationGain: gain.expectedGain,
      heuristic: true,
      hardSafetyTriggered: false,
    };
  }

  if (!frozenWouldPoll) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'WOULD_SKIP',
      reason: 'FROZEN_B2B4_CONSERVATIVE_INTERSECTION',
      expectedInformationGain: gain.expectedGain,
      heuristic: true,
      hardSafetyTriggered: false,
    };
  }

  if (gain.expectedGain < BACKOFF_SKIP_GAIN_THRESHOLD) {
    return {
      policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
      decision: 'WOULD_SKIP',
      reason: 'LOW_HEURISTIC_INFORMATION_GAIN',
      expectedInformationGain: gain.expectedGain,
      heuristic: true,
      hardSafetyTriggered: false,
    };
  }

  return {
    policyVersion: APDS_V3_OFFLINE_POLICY_VERSION,
    decision: 'WOULD_POLL',
    reason: 'INFORMATION_GAIN_AND_FROZEN_PARITY',
    expectedInformationGain: gain.expectedGain,
    heuristic: true,
    hardSafetyTriggered: false,
  };
}

/** Baseline canonical scheduler: poll when tier interval elapsed (offline model). */
export function evaluateCanonicalBaselineSchedulerWouldPoll(input: {
  decisionAtMs: number;
  lastPhysicalPollMs: number | null;
  tierIntervalMs: number;
}): boolean {
  if (input.lastPhysicalPollMs == null) return true;
  return input.decisionAtMs - input.lastPhysicalPollMs >= input.tierIntervalMs;
}
