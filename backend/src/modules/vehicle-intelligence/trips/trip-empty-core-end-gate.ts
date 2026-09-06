import type {
  PerformanceReading,
  RoutePoint,
} from '../../dimo/dimo-segments.service';
import {
  evaluatePerformanceActivity,
  isCurrentTelemetryInactive,
} from './trip-evidence.helpers';
import { getSharedSignalThresholds } from './trip-start-detection-policy';

export type EmptyCoreForensics = {
  noCoreStream: true;
  operationalInactiveMs: number;
  vlsInactivity: boolean | 'unknown';
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
 * Successful empty core [] is absence of core stream — not proof of inactivity.
 * Requires corroborating VLS inactivity, no performance activity, no route motion.
 */
export function assessSuccessfulEmptyCoreEndEligibility(params: {
  operationalInactiveMs: number;
  minInactivityBeforeCusumMs: number;
  telemetry: {
    isIgnitionOn: boolean | null;
    speedKmh: number | null;
    engineLoad: number | null;
  } | null;
  perfReadings: PerformanceReading[];
  routePoints: RoutePoint[];
  profile: string;
}): { eligible: boolean; forensics: EmptyCoreForensics } {
  const vlsInactivity: boolean | 'unknown' =
    params.telemetry == null
      ? 'unknown'
      : isCurrentTelemetryInactive(params.telemetry);
  const performanceActivity = evaluatePerformanceActivity(params.perfReadings);
  const routeMotion = hasRouteMotionAboveThreshold(
    params.routePoints,
    params.profile,
  );

  const baseForensics: Omit<EmptyCoreForensics, 'decision' | 'reason'> = {
    noCoreStream: true,
    operationalInactiveMs: params.operationalInactiveMs,
    vlsInactivity,
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
  if (vlsInactivity === 'unknown') {
    return {
      eligible: false,
      forensics: {
        ...baseForensics,
        decision: 'KEEP_OPEN',
        reason: 'vls_missing_or_ambiguous',
      },
    };
  }
  if (vlsInactivity === false) {
    return {
      eligible: false,
      forensics: {
        ...baseForensics,
        decision: 'KEEP_OPEN',
        reason: 'vls_still_active',
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
