import type {
  PerformanceReading,
  RoutePoint,
} from '../../dimo/dimo-segments.service';
import { isValidProviderEventTimestamp } from './trip-fsm-clock-contract';
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
  operationalAnchorSource?: string;
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
 * Successful empty core [] is absence of core stream — not proof of inactivity.
 * Requires explicit, fresh VLS INACTIVE + no performance/route contradiction.
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
  operationalAnchorSource?: string;
}): { eligible: boolean; forensics: EmptyCoreForensics } {
  const vlsEvidence = classifyEmptyCoreVlsInactivity({
    telemetry: params.telemetry,
    profile: params.profile,
    workerNow: params.workerNow,
    maxObservationAgeMs: params.minInactivityBeforeCusumMs,
    stopBoundaryAt: params.stopBoundaryAt,
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
    stopBoundaryAt: params.stopBoundaryAt?.toISOString() ?? null,
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
