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

/**
 * Stricter empty-core VLS classifier — tri-state ACTIVE / INACTIVE / UNKNOWN.
 * Does NOT coerce null speed/engineLoad to zero (unlike isCurrentTelemetryInactive).
 */
export function classifyEmptyCoreVlsInactivity(params: {
  telemetry: EmptyCoreVlsTelemetry | null;
  profile: string;
  workerNow: Date;
  maxObservationAgeMs: number;
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

  if (telemetry.speedKmh == null) {
    return {
      state: 'UNKNOWN',
      providerObservedAt,
      observationAgeMs,
      reason: 'vls_speed_missing',
    };
  }

  const shared = getSharedSignalThresholds(params.profile);
  const speed = telemetry.speedKmh;

  if (speed > shared.speedMotionKmh) {
    return {
      state: 'ACTIVE',
      providerObservedAt,
      observationAgeMs,
      reason: 'vls_speed_above_motion_threshold',
    };
  }

  const engineLoad = telemetry.engineLoad;
  if (engineLoad != null && engineLoad > 15) {
    return {
      state: 'ACTIVE',
      providerObservedAt,
      observationAgeMs,
      reason: 'vls_engine_load_active',
    };
  }

  if (telemetry.isIgnitionOn === true && speed > 0) {
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
}): { eligible: boolean; forensics: EmptyCoreForensics } {
  const vlsEvidence = classifyEmptyCoreVlsInactivity({
    telemetry: params.telemetry,
    profile: params.profile,
    workerNow: params.workerNow,
    maxObservationAgeMs: params.minInactivityBeforeCusumMs,
  });
  const performanceActivity = evaluatePerformanceActivity(params.perfReadings);
  const routeMotion = hasRouteMotionAboveThreshold(
    params.routePoints,
    params.profile,
  );

  const baseForensics: Omit<EmptyCoreForensics, 'decision' | 'reason'> = {
    noCoreStream: true,
    operationalInactiveMs: params.operationalInactiveMs,
    vlsEvidenceState: vlsEvidence.state,
    vlsProviderObservedAt: vlsEvidence.providerObservedAt?.toISOString() ?? null,
    vlsObservationAgeMs: vlsEvidence.observationAgeMs,
    performanceActivity,
    routeMotion,
  };

  if (params.operationalInactiveMs < params.minInactivityBeforeCusumMs) {
    return {
      eligible: false,
      forensics: {
        ...baseForensics,
        decision: 'KEEP_OPEN',
        reason: 'operational_inactivity_below_threshold',
      },
    };
  }
  if (vlsEvidence.state === 'UNKNOWN') {
    return {
      eligible: false,
      forensics: {
        ...baseForensics,
        decision: 'KEEP_OPEN',
        reason: vlsEvidence.reason,
      },
    };
  }
  if (vlsEvidence.state === 'ACTIVE') {
    return {
      eligible: false,
      forensics: {
        ...baseForensics,
        decision: 'KEEP_OPEN',
        reason: vlsEvidence.reason,
      },
    };
  }
  if (performanceActivity) {
    return {
      eligible: false,
      forensics: {
        ...baseForensics,
        decision: 'KEEP_OPEN',
        reason: 'performance_still_active',
      },
    };
  }
  if (routeMotion) {
    return {
      eligible: false,
      forensics: {
        ...baseForensics,
        decision: 'KEEP_OPEN',
        reason: 'route_motion_detected',
      },
    };
  }

  return {
    eligible: true,
    forensics: {
      ...baseForensics,
      decision: 'POSSIBLE_END',
      reason: 'empty_core_corroborated_inactivity',
    },
  };
}
