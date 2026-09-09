import type {
  PerformanceReading,
  RoutePoint,
} from '../../dimo/dimo-segments.service';
import {
  classifyStopBoundarySourceClockAuthority,
  isTrustedStopBoundaryAuthority,
  isValidProviderEventTimestamp,
  type StopBoundaryProvenance,
} from './trip-fsm-clock-contract';
import { evaluatePerformanceActivity } from './trip-evidence.helpers';
import { getSharedSignalThresholds } from './trip-start-detection-policy';

export type VlsInactivityEvidenceState = 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';

export type EmptyCoreVlsTelemetry = {
  isIgnitionOn: boolean | null;
  speedKmh: number | null;
  engineLoad: number | null;
  sourceTimestamp: Date | null;
};

export type EmptyCoreVlsEvidence = {
  state: VlsInactivityEvidenceState;
  providerObservedAt: Date | null;
  observationAgeMs: number | null;
  reason: string;
};

export type EmptyCoreForensics = {
  noCoreStream: true;
  operationalInactiveMs: number;
  vlsEvidenceState: VlsInactivityEvidenceState;
  vlsProviderObservedAt: string | null;
  vlsObservationAgeMs: number | null;
  performanceActivity: boolean;
  routeMotion: boolean;
  decision: 'KEEP_OPEN' | 'POSSIBLE_END';
  reason: string;
  innerGateReason: string;
  outerReason: 'no_core_data_keep_open' | 'no_core_data_corroborated_to_possible_end';
  stopBoundaryAt?: string | null;
  stopBoundarySource?: string | null;
  stopBoundaryClockAuthority?: string | null;
  stopBoundaryTrust?: boolean;
  operationalAnchorSource?: string;
  boundaryBackedSilenceEligible?: boolean;
};

export function hasRouteMotionAboveThreshold(
  routePoints: RoutePoint[],
  profile: string,
): boolean {
  const shared = getSharedSignalThresholds(profile);
  return routePoints.some(
    (p) => p.speedKmh != null && p.speedKmh > shared.speedMotionKmh,
  );
}

function isObservationAfterStopBoundary(
  providerObservedAt: Date,
  stopBoundaryAt: Date | null | undefined,
): boolean {
  if (!stopBoundaryAt) return true;
  return providerObservedAt.getTime() > stopBoundaryAt.getTime();
}

/**
 * Stricter empty-core VLS classifier — tri-state ACTIVE / INACTIVE / UNKNOWN.
 * Does NOT coerce null speed/engineLoad to zero (unlike isCurrentTelemetryInactive).
 *
 * For end candidacy, positive evidence after `stopBoundaryAt` blocks; observations
 * at or before the boundary are treated as stale at stop.
 */
export function classifyEmptyCoreVlsInactivity(params: {
  telemetry: EmptyCoreVlsTelemetry | null;
  profile: string;
  workerNow: Date;
  maxObservationAgeMs: number;
  stopBoundaryAt?: Date | null;
}): EmptyCoreVlsEvidence {
  if (!params.telemetry) {
    return {
      state: 'UNKNOWN',
      providerObservedAt: null,
      observationAgeMs: null,
      reason: 'vls_row_absent',
    };
  }

  const { telemetry } = params;
  const providerObservedAt = telemetry.sourceTimestamp;

  if (!providerObservedAt) {
    return {
      state: 'UNKNOWN',
      providerObservedAt: null,
      observationAgeMs: null,
      reason: 'vls_source_timestamp_missing',
    };
  }

  if (!isValidProviderEventTimestamp(providerObservedAt, params.workerNow)) {
    return {
      state: 'UNKNOWN',
      providerObservedAt,
      observationAgeMs: null,
      reason: 'vls_source_timestamp_invalid',
    };
  }

  const shared = getSharedSignalThresholds(params.profile);

  if (telemetry.speedKmh == null) {
    return {
      state: 'UNKNOWN',
      providerObservedAt,
      observationAgeMs: null,
      reason: 'vls_speed_missing',
    };
  }

  const speed = telemetry.speedKmh;
  const afterStop = isObservationAfterStopBoundary(
    providerObservedAt,
    params.stopBoundaryAt,
  );

  // Pre-stop-boundary stationary samples corroborate the stop moment itself.
  if (
    params.stopBoundaryAt &&
    !afterStop &&
    speed <= shared.speedMotionKmh
  ) {
    const rawAgeMs = params.workerNow.getTime() - providerObservedAt.getTime();
    const observationAgeMs = rawAgeMs < 0 ? 0 : rawAgeMs;
    return {
      state: 'INACTIVE',
      providerObservedAt,
      observationAgeMs,
      reason: 'vls_stop_boundary_corroboration',
    };
  }

  const rawAgeMs = params.workerNow.getTime() - providerObservedAt.getTime();
  const observationAgeMs = rawAgeMs < 0 ? 0 : rawAgeMs;
  if (observationAgeMs > params.maxObservationAgeMs) {
    return {
      state: 'UNKNOWN',
      providerObservedAt,
      observationAgeMs,
      reason: 'vls_stale_provider_observation',
    };
  }

  if (speed > shared.speedMotionKmh) {
    if (!afterStop) {
      return {
        state: 'INACTIVE',
        providerObservedAt,
        observationAgeMs,
        reason: 'vls_stale_speed_before_stop_boundary',
      };
    }
    return {
      state: 'ACTIVE',
      providerObservedAt,
      observationAgeMs,
      reason: 'vls_speed_above_motion_threshold',
    };
  }

  const engineLoad = telemetry.engineLoad;
  if (engineLoad != null && engineLoad > 15) {
    if (!afterStop) {
      return {
        state: 'INACTIVE',
        providerObservedAt,
        observationAgeMs,
        reason: 'vls_stale_engine_load_before_stop_boundary',
      };
    }
    return {
      state: 'UNKNOWN',
      providerObservedAt,
      observationAgeMs,
      reason: 'vls_motor_activity_at_standstill',
    };
  }

  if (telemetry.isIgnitionOn === true && speed > 0) {
    if (!afterStop) {
      return {
        state: 'INACTIVE',
        providerObservedAt,
        observationAgeMs,
        reason: 'vls_stale_ignition_before_stop_boundary',
      };
    }
    return {
      state: 'ACTIVE',
      providerObservedAt,
      observationAgeMs,
      reason: 'vls_ignition_with_speed',
    };
  }

  return {
    state: 'INACTIVE',
    providerObservedAt,
    observationAgeMs,
    reason: 'vls_explicit_stationary_sample',
  };
}

/**
 * R12: bounded provider silence after a trusted stop boundary.
 * UNKNOWN remains UNKNOWN — this does not coerce stale telemetry to INACTIVE.
 */
export function assessBoundaryBackedEmptyCoreSilence(params: {
  stopBoundaryProvenance: StopBoundaryProvenance;
  operationalInactiveMs: number;
  minInactivityBeforeCusumMs: number;
  vlsEvidence: EmptyCoreVlsEvidence;
  performanceActivity: boolean;
  routeMotion: boolean;
  hasCrediblePostBoundaryMovement: boolean;
  workerNow: Date;
}): { eligible: boolean; reason: string } {
  if (
    !params.stopBoundaryProvenance.trust ||
    !isTrustedStopBoundaryAuthority(params.stopBoundaryProvenance.clockAuthority)
  ) {
    return { eligible: false, reason: 'stop_boundary_untrusted_worker_time' };
  }
  if (params.operationalInactiveMs < params.minInactivityBeforeCusumMs) {
    return { eligible: false, reason: 'operational_inactivity_below_threshold' };
  }
  if (params.performanceActivity || params.routeMotion) {
    return { eligible: false, reason: 'post_boundary_positive_contradiction' };
  }
  if (params.hasCrediblePostBoundaryMovement) {
    return { eligible: false, reason: 'post_boundary_movement_detected' };
  }

  if (params.vlsEvidence.state === 'ACTIVE') {
    return { eligible: false, reason: params.vlsEvidence.reason };
  }

  if (
    params.vlsEvidence.state === 'UNKNOWN' &&
    params.vlsEvidence.reason === 'vls_motor_activity_at_standstill' &&
    params.vlsEvidence.observationAgeMs != null &&
    params.vlsEvidence.observationAgeMs <= params.minInactivityBeforeCusumMs
  ) {
    return { eligible: false, reason: 'vls_motor_activity_at_standstill' };
  }

  // Explicit INACTIVE VLS uses the normal empty-core corroboration path.
  if (params.vlsEvidence.state === 'INACTIVE') {
    return { eligible: false, reason: 'vls_explicit_inactive_use_normal_path' };
  }

  const silenceSinceBoundaryMs =
    params.workerNow.getTime() -
    params.stopBoundaryProvenance.boundaryAt.getTime();
  if (silenceSinceBoundaryMs < params.minInactivityBeforeCusumMs) {
    return { eligible: false, reason: 'boundary_silence_below_threshold' };
  }

  // Boundary-backed silence applies only when parked telemetry went stale after
  // a trusted stop boundary — not when VLS is absent or structurally unknown.
  if (
    params.vlsEvidence.state === 'UNKNOWN' &&
    params.vlsEvidence.reason === 'vls_stale_provider_observation'
  ) {
    return { eligible: true, reason: 'boundary_backed_provider_silence' };
  }

  return { eligible: false, reason: params.vlsEvidence.reason };
}

/**
 * Successful empty core [] is absence of core stream — not proof of inactivity.
 * Requires explicit, fresh VLS INACTIVE + no performance/route contradiction,
 * OR R12 boundary-backed provider silence when a trusted stop boundary exists.
 */
export function assessSuccessfulEmptyCoreEndEligibility(params: {
  operationalInactiveMs: number;
  minInactivityBeforeCusumMs: number;
  telemetry: EmptyCoreVlsTelemetry | null;
  perfReadings: PerformanceReading[];
  routePoints: RoutePoint[];
  profile: string;
  workerNow: Date;
  stopBoundaryAt?: Date | null;
  stopBoundaryProvenance?: StopBoundaryProvenance | null;
  stopBoundarySource?: string | null;
  stopBoundaryClockAuthority?: StopBoundaryProvenance['clockAuthority'] | null;
  stopBoundaryTrust?: boolean | null;
  operationalAnchorSource?: string;
  hasCrediblePostBoundaryMovement?: boolean;
}): { eligible: boolean; forensics: EmptyCoreForensics } {
  const stopBoundaryProvenance =
    params.stopBoundaryProvenance ??
    (params.stopBoundaryAt
      ? (() => {
          const source = params.stopBoundarySource ?? 'legacy_unspecified';
          const clockAuthority =
            params.stopBoundaryClockAuthority ??
            classifyStopBoundarySourceClockAuthority(source);
          return {
            boundaryAt: params.stopBoundaryAt,
            source,
            clockAuthority,
            trust:
              params.stopBoundaryTrust ??
              isTrustedStopBoundaryAuthority(clockAuthority),
          };
        })()
      : null);
  const vlsEvidence = classifyEmptyCoreVlsInactivity({
    telemetry: params.telemetry,
    profile: params.profile,
    workerNow: params.workerNow,
    maxObservationAgeMs: params.minInactivityBeforeCusumMs,
    stopBoundaryAt: stopBoundaryProvenance?.boundaryAt ?? params.stopBoundaryAt,
  });
  const performanceActivity = evaluatePerformanceActivity(params.perfReadings);
  const routeMotion = hasRouteMotionAboveThreshold(
    params.routePoints,
    params.profile,
  );

  const baseForensics: Omit<
    EmptyCoreForensics,
    'decision' | 'reason' | 'innerGateReason' | 'outerReason'
  > = {
    noCoreStream: true,
    operationalInactiveMs: params.operationalInactiveMs,
    vlsEvidenceState: vlsEvidence.state,
    vlsProviderObservedAt: vlsEvidence.providerObservedAt?.toISOString() ?? null,
    vlsObservationAgeMs: vlsEvidence.observationAgeMs,
    performanceActivity,
    routeMotion,
    stopBoundaryAt:
      stopBoundaryProvenance?.boundaryAt.toISOString() ??
      params.stopBoundaryAt?.toISOString() ??
      null,
    stopBoundarySource: stopBoundaryProvenance?.source ?? null,
    stopBoundaryClockAuthority: stopBoundaryProvenance?.clockAuthority ?? null,
    stopBoundaryTrust: stopBoundaryProvenance?.trust,
    operationalAnchorSource: params.operationalAnchorSource,
  };

  const reject = (
    innerGateReason: string,
  ): { eligible: false; forensics: EmptyCoreForensics } => ({
    eligible: false,
    forensics: {
      ...baseForensics,
      decision: 'KEEP_OPEN',
      reason: innerGateReason,
      innerGateReason,
      outerReason: 'no_core_data_keep_open',
    },
  });

  if (params.operationalInactiveMs < params.minInactivityBeforeCusumMs) {
    return reject('operational_inactivity_below_threshold');
  }

  if (stopBoundaryProvenance) {
    if (stopBoundaryProvenance.trust) {
      const boundaryBacked = assessBoundaryBackedEmptyCoreSilence({
        stopBoundaryProvenance,
        operationalInactiveMs: params.operationalInactiveMs,
        minInactivityBeforeCusumMs: params.minInactivityBeforeCusumMs,
        vlsEvidence,
        performanceActivity,
        routeMotion,
        hasCrediblePostBoundaryMovement:
          params.hasCrediblePostBoundaryMovement ?? false,
        workerNow: params.workerNow,
      });
      if (boundaryBacked.eligible) {
        return {
          eligible: true,
          forensics: {
            ...baseForensics,
            decision: 'POSSIBLE_END',
            reason: boundaryBacked.reason,
            innerGateReason: boundaryBacked.reason,
            outerReason: 'no_core_data_corroborated_to_possible_end',
            boundaryBackedSilenceEligible: true,
          },
        };
      }
      if (vlsEvidence.state === 'UNKNOWN' || vlsEvidence.state === 'ACTIVE') {
        return reject(boundaryBacked.reason);
      }
    } else if (
      vlsEvidence.state === 'UNKNOWN' &&
      vlsEvidence.reason === 'vls_stale_provider_observation' &&
      params.operationalInactiveMs >= params.minInactivityBeforeCusumMs
    ) {
      return reject('stop_boundary_untrusted_worker_time');
    }
  }

  if (vlsEvidence.state === 'UNKNOWN') {
    return reject(vlsEvidence.reason);
  }
  if (vlsEvidence.state === 'ACTIVE') {
    return reject(vlsEvidence.reason);
  }
  if (performanceActivity) {
    return reject('performance_still_active');
  }
  if (routeMotion) {
    return reject('route_motion_detected');
  }

  return {
    eligible: true,
    forensics: {
      ...baseForensics,
      decision: 'POSSIBLE_END',
      reason: 'empty_core_corroborated_inactivity',
      innerGateReason: 'empty_core_corroborated_inactivity',
      outerReason: 'no_core_data_corroborated_to_possible_end',
    },
  };
}

export function buildEmptyCoreKeepOpenSummary(
  forensics: EmptyCoreForensics,
  operationalAnchorAt: string,
): Record<string, unknown> {
  return {
    ...forensics,
    reason: forensics.outerReason,
    innerGateReason: forensics.innerGateReason,
    operationalAnchorAt,
  };
}

export function buildEmptyCorePossibleEndSummary(
  forensics: EmptyCoreForensics,
  operationalAnchorAt: string,
): Record<string, unknown> {
  return {
    ...forensics,
    reason: forensics.outerReason,
    innerGateReason: forensics.innerGateReason,
    operationalAnchorAt,
  };
}
