import type {
  TripAssessabilityDimension,
  TripAssessabilityDimensionStatus,
} from '@prisma/client';
import {
  TRIP_ASSESSABILITY_DEFAULT_CAPABILITY_VERSION,
  TRIP_ASSESSABILITY_DIMENSIONS,
  TRIP_ASSESSABILITY_POLICY_VERSION,
  type TripAssessabilityCapabilitySnapshot,
  type TripAssessabilityDimensionAssessment,
  type TripAssessabilityPolicyInput,
  type TripAssessabilityPolicyResult,
  type TripAssessabilityReasonCode,
} from './trip-assessability.types';

const MIN_HF_POINTS_FOR_RECONSTRUCTED = 30;
const MIN_ROUTE_WAYPOINTS = 3;
const MIN_ROUTE_COVERAGE = 0.5;

function assessClickHouseHfDimension(
  input: TripAssessabilityPolicyInput,
  dimension: Extract<
    TripAssessabilityDimension,
    'RECONSTRUCTED_BEHAVIOR' | 'ENGINE_MISUSE' | 'BRAKING_INTENSITY' | 'CORNERING' | 'DAMAGE_RISK'
  >,
  caps: TripAssessabilityCapabilitySnapshot,
): DimensionDraft | null {
  const ch = input.clickHouse;
  if (!ch?.hfUnavailable) return null;

  const reasons: TripAssessabilityReasonCode[] = ['CLICKHOUSE_UNAVAILABLE', 'HF_INSUFFICIENT'];
  if (ch.limitReason === 'CLICKHOUSE_CIRCUIT_OPEN') {
    reasons.unshift('CLICKHOUSE_CIRCUIT_OPEN');
  }
  if (ch.limitReason === 'CLICKHOUSE_TIMEOUT') {
    reasons.unshift('CLICKHOUSE_TIMEOUT');
  }
  if (ch.providerError) {
    reasons.push('HF_PROVIDER_ERROR', 'PROVIDER_ERROR');
    return {
      dimension,
      status: 'PROVIDER_ERROR',
      reasons,
      coverage: caps.coverage,
      effectiveCadenceMs: caps.effectiveCadenceMs,
      p95CadenceMs: caps.p95CadenceMs,
    };
  }

  return {
    dimension,
    status: 'INSUFFICIENT_DATA',
    reasons,
    coverage: caps.coverage,
    effectiveCadenceMs: caps.effectiveCadenceMs,
    p95CadenceMs: caps.p95CadenceMs,
  };
}

type DimensionDraft = {
  dimension: TripAssessabilityDimension;
  status: TripAssessabilityDimensionStatus;
  reasons: TripAssessabilityReasonCode[];
  coverage?: number | null;
  effectiveCadenceMs?: number | null;
  p95CadenceMs?: number | null;
};

function hasDistanceOrDurationOnly(input: TripAssessabilityPolicyInput): boolean {
  const { distanceKm, durationMinutes } = input.tripMetrics;
  const hasMetrics = (distanceKm ?? 0) > 0 || (durationMinutes ?? 0) > 0;
  const hasEnrichment =
    input.route.waypointCount >= MIN_ROUTE_WAYPOINTS ||
    input.behavior.hfPointsCleaned >= MIN_HF_POINTS_FOR_RECONSTRUCTED ||
    input.behavior.nativeEventCount > 0 ||
    input.drivingImpact.available;
  return hasMetrics && !hasEnrichment;
}

function resolveCapabilitySnapshot(
  input: TripAssessabilityPolicyInput,
): TripAssessabilityCapabilitySnapshot {
  return (
    input.capabilities ?? {
      capabilityVersion: TRIP_ASSESSABILITY_DEFAULT_CAPABILITY_VERSION,
      coverage: null,
      effectiveCadenceMs: null,
      p95CadenceMs: null,
      nativeBehaviorSupported: null,
      hfCadenceSufficient: null,
      routeSupported: null,
    }
  );
}

function assessTripBoundary(input: TripAssessabilityPolicyInput): DimensionDraft {
  const { tripBoundary } = input;
  const reasons: TripAssessabilityReasonCode[] = [];

  if (tripBoundary.tripStatus === 'ONGOING') {
    reasons.push('TRIP_ONGOING');
    return { dimension: 'TRIP_BOUNDARY', status: 'INSUFFICIENT_DATA', reasons };
  }
  if (!tripBoundary.endTime) {
    reasons.push('NO_END_TIME');
    return { dimension: 'TRIP_BOUNDARY', status: 'INSUFFICIENT_DATA', reasons };
  }
  if (!tripBoundary.dimoSegmentId) {
    reasons.push('NO_DIMO_SEGMENT');
    return { dimension: 'TRIP_BOUNDARY', status: 'LIMITED', reasons };
  }
  if (tripBoundary.qualityStatus === 'LOW_DATA' || tripBoundary.qualityStatus === 'ANOMALY') {
    reasons.push('LOW_TRIP_QUALITY');
    return { dimension: 'TRIP_BOUNDARY', status: 'LIMITED', reasons };
  }
  return { dimension: 'TRIP_BOUNDARY', status: 'ASSESSABLE', reasons };
}

function assessRoute(input: TripAssessabilityPolicyInput, caps: TripAssessabilityCapabilitySnapshot): DimensionDraft {
  const reasons: TripAssessabilityReasonCode[] = [];
  const { route } = input;

  if (route.providerError) {
    reasons.push('ROUTE_PROVIDER_ERROR', 'PROVIDER_ERROR');
    return {
      dimension: 'ROUTE',
      status: 'PROVIDER_ERROR',
      reasons,
      coverage: route.coverage,
      effectiveCadenceMs: route.effectiveCadenceMs,
      p95CadenceMs: route.p95CadenceMs,
    };
  }
  if (caps.routeSupported === false) {
    reasons.push('CAPABILITY_UNSUPPORTED');
    return { dimension: 'ROUTE', status: 'UNSUPPORTED', reasons };
  }
  if (hasDistanceOrDurationOnly(input) && route.waypointCount < MIN_ROUTE_WAYPOINTS) {
    reasons.push('DISTANCE_DURATION_ONLY', 'ROUTE_NOT_ENRICHED');
    return { dimension: 'ROUTE', status: 'INSUFFICIENT_DATA', reasons };
  }
  if (route.enrichmentStatus === 'SKIPPED' || route.waypointCount < MIN_ROUTE_WAYPOINTS) {
    reasons.push('ROUTE_NOT_ENRICHED');
    return { dimension: 'ROUTE', status: 'INSUFFICIENT_DATA', reasons };
  }
  if ((route.coverage ?? 0) < MIN_ROUTE_COVERAGE) {
    reasons.push('ROUTE_LOW_COVERAGE');
    return {
      dimension: 'ROUTE',
      status: 'LIMITED',
      reasons,
      coverage: route.coverage,
      effectiveCadenceMs: route.effectiveCadenceMs,
      p95CadenceMs: route.p95CadenceMs,
    };
  }
  return {
    dimension: 'ROUTE',
    status: 'ASSESSABLE',
    reasons,
    coverage: route.coverage,
    effectiveCadenceMs: route.effectiveCadenceMs,
    p95CadenceMs: route.p95CadenceMs,
  };
}

function assessVehicleLoad(input: TripAssessabilityPolicyInput): DimensionDraft {
  const reasons: TripAssessabilityReasonCode[] = [];
  const { drivingImpact } = input;

  if (drivingImpact.providerError) {
    reasons.push('PROVIDER_ERROR');
    return { dimension: 'VEHICLE_LOAD', status: 'PROVIDER_ERROR', reasons };
  }
  if (hasDistanceOrDurationOnly(input)) {
    reasons.push('DISTANCE_DURATION_ONLY', 'NO_ENGINE_LOAD_SIGNALS');
    return { dimension: 'VEHICLE_LOAD', status: 'INSUFFICIENT_DATA', reasons };
  }
  if (!drivingImpact.available) {
    reasons.push('NO_ENGINE_LOAD_SIGNALS');
    return { dimension: 'VEHICLE_LOAD', status: 'INSUFFICIENT_DATA', reasons };
  }
  const hasLoadSignals =
    drivingImpact.avgEngineLoad != null ||
    drivingImpact.avgRpm != null ||
    drivingImpact.avgThrottlePosition != null ||
    drivingImpact.abuseScore != null;
  if (!hasLoadSignals) {
    reasons.push('NO_ENGINE_LOAD_SIGNALS');
    return { dimension: 'VEHICLE_LOAD', status: 'INSUFFICIENT_DATA', reasons };
  }
  if (drivingImpact.abuseScore == null) {
    reasons.push('NO_ENGINE_LOAD_SIGNALS');
    return { dimension: 'VEHICLE_LOAD', status: 'LIMITED', reasons };
  }
  return { dimension: 'VEHICLE_LOAD', status: 'ASSESSABLE', reasons };
}

function assessNativeBehavior(
  input: TripAssessabilityPolicyInput,
  caps: TripAssessabilityCapabilitySnapshot,
): DimensionDraft {
  const reasons: TripAssessabilityReasonCode[] = [];
  const { behavior } = input;

  if (behavior.providerError) {
    reasons.push('HF_PROVIDER_ERROR', 'PROVIDER_ERROR');
    return {
      dimension: 'NATIVE_BEHAVIOR',
      status: 'PROVIDER_ERROR',
      reasons,
      coverage: caps.coverage,
      effectiveCadenceMs: caps.effectiveCadenceMs,
      p95CadenceMs: caps.p95CadenceMs,
    };
  }
  if (caps.nativeBehaviorSupported === false) {
    reasons.push('NATIVE_CAPABILITY_UNSUPPORTED');
    return { dimension: 'NATIVE_BEHAVIOR', status: 'UNSUPPORTED', reasons };
  }
  if (caps.nativeBehaviorSupported === null && caps.capabilityVersion === TRIP_ASSESSABILITY_DEFAULT_CAPABILITY_VERSION) {
    if (hasDistanceOrDurationOnly(input)) {
      reasons.push('DISTANCE_DURATION_ONLY', 'NO_NATIVE_EVENTS');
      return { dimension: 'NATIVE_BEHAVIOR', status: 'INSUFFICIENT_DATA', reasons };
    }
  }
  if (behavior.nativeQuerySucceeded === false) {
    reasons.push('NATIVE_QUERY_FAILED');
    return { dimension: 'NATIVE_BEHAVIOR', status: 'INSUFFICIENT_DATA', reasons };
  }
  if (behavior.nativeEventCount > 0) {
    return {
      dimension: 'NATIVE_BEHAVIOR',
      status: 'ASSESSABLE',
      reasons,
      coverage: caps.coverage,
      effectiveCadenceMs: caps.effectiveCadenceMs,
      p95CadenceMs: caps.p95CadenceMs,
    };
  }
  if (behavior.nativeQuerySucceeded === true && behavior.nativeEventCount === 0) {
    reasons.push('NO_NATIVE_EVENTS');
    return {
      dimension: 'NATIVE_BEHAVIOR',
      status: 'LIMITED',
      reasons,
      coverage: caps.coverage,
      effectiveCadenceMs: caps.effectiveCadenceMs,
      p95CadenceMs: caps.p95CadenceMs,
    };
  }
  if (caps.nativeBehaviorSupported === true) {
    reasons.push('NO_NATIVE_EVENTS');
    return {
      dimension: 'NATIVE_BEHAVIOR',
      status: 'LIMITED',
      reasons,
      coverage: caps.coverage,
      effectiveCadenceMs: caps.effectiveCadenceMs,
      p95CadenceMs: caps.p95CadenceMs,
    };
  }
  reasons.push('NO_NATIVE_EVENTS');
  return { dimension: 'NATIVE_BEHAVIOR', status: 'INSUFFICIENT_DATA', reasons };
}

function assessReconstructedBehavior(
  input: TripAssessabilityPolicyInput,
  caps: TripAssessabilityCapabilitySnapshot,
): DimensionDraft {
  const chGate = assessClickHouseHfDimension(input, 'RECONSTRUCTED_BEHAVIOR', caps);
  if (chGate) return chGate;

  const reasons: TripAssessabilityReasonCode[] = [];
  const { behavior } = input;

  if (behavior.providerError) {
    reasons.push('HF_PROVIDER_ERROR', 'PROVIDER_ERROR');
    return {
      dimension: 'RECONSTRUCTED_BEHAVIOR',
      status: 'PROVIDER_ERROR',
      reasons,
      coverage: caps.coverage,
      effectiveCadenceMs: caps.effectiveCadenceMs,
      p95CadenceMs: caps.p95CadenceMs,
    };
  }
  if (caps.hfCadenceSufficient === false) {
    reasons.push('HF_INSUFFICIENT', 'CAPABILITY_UNSUPPORTED');
    return { dimension: 'RECONSTRUCTED_BEHAVIOR', status: 'UNSUPPORTED', reasons };
  }
  if (hasDistanceOrDurationOnly(input)) {
    reasons.push('DISTANCE_DURATION_ONLY', 'NO_HF_POINTS');
    return { dimension: 'RECONSTRUCTED_BEHAVIOR', status: 'INSUFFICIENT_DATA', reasons };
  }
  if (behavior.hfPointsCleaned < MIN_HF_POINTS_FOR_RECONSTRUCTED) {
    reasons.push('HF_INSUFFICIENT', 'NO_HF_POINTS');
    return {
      dimension: 'RECONSTRUCTED_BEHAVIOR',
      status: 'INSUFFICIENT_DATA',
      reasons,
      coverage: caps.coverage,
      effectiveCadenceMs: caps.effectiveCadenceMs,
      p95CadenceMs: caps.p95CadenceMs,
    };
  }
  if (behavior.reconstructedEventCount > 0) {
    reasons.push('RECONSTRUCTED_EVENTS_PRESENT');
  }
  const status: TripAssessabilityDimensionStatus =
    behavior.reconstructedEventCount > 0 || behavior.hfPointsCleaned >= MIN_HF_POINTS_FOR_RECONSTRUCTED * 2
      ? 'ASSESSABLE'
      : 'LIMITED';
  return {
    dimension: 'RECONSTRUCTED_BEHAVIOR',
    status,
    reasons,
    coverage: caps.coverage,
    effectiveCadenceMs: caps.effectiveCadenceMs,
    p95CadenceMs: caps.p95CadenceMs,
  };
}

function assessEngineMisuse(input: TripAssessabilityPolicyInput): DimensionDraft {
  const caps = resolveCapabilitySnapshot(input);
  const chGate = assessClickHouseHfDimension(input, 'ENGINE_MISUSE', caps);
  if (chGate) return chGate;

  const reasons: TripAssessabilityReasonCode[] = [];
  const { counters, misuse } = input;
  const misuseSignals =
    counters.coldEngineAbuseCount > 0 ||
    counters.kickdownCount > 0 ||
    counters.abuseEvents > 0 ||
    misuse.abuseEventCount > 0;

  if (hasDistanceOrDurationOnly(input)) {
    reasons.push('DISTANCE_DURATION_ONLY', 'NO_MISUSE_SIGNALS');
    return { dimension: 'ENGINE_MISUSE', status: 'INSUFFICIENT_DATA', reasons };
  }
  if (input.behavior.hfPointsCleaned < MIN_HF_POINTS_FOR_RECONSTRUCTED && !misuseSignals) {
    reasons.push('HF_INSUFFICIENT', 'NO_MISUSE_SIGNALS');
    return { dimension: 'ENGINE_MISUSE', status: 'INSUFFICIENT_DATA', reasons };
  }
  if (!misuseSignals && input.drivingImpact.abuseScore == null) {
    reasons.push('NO_MISUSE_SIGNALS');
    return { dimension: 'ENGINE_MISUSE', status: 'LIMITED', reasons };
  }
  return { dimension: 'ENGINE_MISUSE', status: 'ASSESSABLE', reasons };
}

function assessBrakingIntensity(input: TripAssessabilityPolicyInput): DimensionDraft {
  const caps = resolveCapabilitySnapshot(input);
  const chGate = assessClickHouseHfDimension(input, 'BRAKING_INTENSITY', caps);
  if (chGate) return chGate;

  const reasons: TripAssessabilityReasonCode[] = [];
  const brakeSignals =
    input.counters.harshBrakeCount > 0 ||
    input.counters.hardBrakingEvents > 0 ||
    input.counters.brakingEventCount > 0;

  if (hasDistanceOrDurationOnly(input)) {
    reasons.push('DISTANCE_DURATION_ONLY', 'NO_BRAKING_SIGNALS');
    return { dimension: 'BRAKING_INTENSITY', status: 'INSUFFICIENT_DATA', reasons };
  }
  if (!brakeSignals && input.behavior.hfPointsCleaned < MIN_HF_POINTS_FOR_RECONSTRUCTED) {
    reasons.push('NO_BRAKING_SIGNALS', 'HF_INSUFFICIENT');
    return { dimension: 'BRAKING_INTENSITY', status: 'INSUFFICIENT_DATA', reasons };
  }
  if (!brakeSignals) {
    reasons.push('NO_BRAKING_SIGNALS');
    return { dimension: 'BRAKING_INTENSITY', status: 'LIMITED', reasons };
  }
  return { dimension: 'BRAKING_INTENSITY', status: 'ASSESSABLE', reasons };
}

function assessCornering(input: TripAssessabilityPolicyInput): DimensionDraft {
  const caps = resolveCapabilitySnapshot(input);
  const chGate = assessClickHouseHfDimension(input, 'CORNERING', caps);
  if (chGate) return chGate;

  const reasons: TripAssessabilityReasonCode[] = [];
  const cornerSignals =
    input.counters.harshCornerCount > 0 || input.counters.corneringEvents > 0;

  if (hasDistanceOrDurationOnly(input)) {
    reasons.push('DISTANCE_DURATION_ONLY', 'NO_CORNERING_SIGNALS');
    return { dimension: 'CORNERING', status: 'INSUFFICIENT_DATA', reasons };
  }
  if (!cornerSignals && input.behavior.hfPointsCleaned < MIN_HF_POINTS_FOR_RECONSTRUCTED) {
    reasons.push('NO_CORNERING_SIGNALS', 'HF_INSUFFICIENT');
    return { dimension: 'CORNERING', status: 'INSUFFICIENT_DATA', reasons };
  }
  if (!cornerSignals) {
    reasons.push('NO_CORNERING_SIGNALS');
    return { dimension: 'CORNERING', status: 'LIMITED', reasons };
  }
  return { dimension: 'CORNERING', status: 'ASSESSABLE', reasons };
}

function assessDamageRisk(input: TripAssessabilityPolicyInput): DimensionDraft {
  const caps = resolveCapabilitySnapshot(input);
  const chGate = assessClickHouseHfDimension(input, 'DAMAGE_RISK', caps);
  if (chGate) return chGate;

  const reasons: TripAssessabilityReasonCode[] = [];
  const { misuse } = input;
  const evidence =
    misuse.misuseCaseCount > 0 ||
    misuse.possibleImpactCount > 0 ||
    input.counters.abuseEvents > 0;

  if (misuse.stageStatus === 'failed') {
    reasons.push('PROVIDER_ERROR');
    return { dimension: 'DAMAGE_RISK', status: 'PROVIDER_ERROR', reasons };
  }
  if (hasDistanceOrDurationOnly(input)) {
    reasons.push('DISTANCE_DURATION_ONLY', 'NO_DAMAGE_EVIDENCE');
    return { dimension: 'DAMAGE_RISK', status: 'INSUFFICIENT_DATA', reasons };
  }
  if (!evidence) {
    reasons.push('NO_DAMAGE_EVIDENCE');
    return { dimension: 'DAMAGE_RISK', status: 'LIMITED', reasons };
  }
  return { dimension: 'DAMAGE_RISK', status: 'ASSESSABLE', reasons };
}

function assessDriverConduct(
  input: TripAssessabilityPolicyInput,
  native: DimensionDraft,
  reconstructed: DimensionDraft,
): DimensionDraft {
  const reasons: TripAssessabilityReasonCode[] = [];

  const nativeOk = native.status === 'ASSESSABLE' || native.status === 'LIMITED';
  const reconstructedOk =
    reconstructed.status === 'ASSESSABLE' || reconstructed.status === 'LIMITED';

  if (!nativeOk && !reconstructedOk) {
    reasons.push('CONDUCT_REQUIRES_BEHAVIOR_GATE');
    if (native.reasons.includes('NO_NATIVE_EVENTS')) {
      reasons.push('NO_NATIVE_EVENTS');
    }
    if (reconstructed.reasons.includes('HF_INSUFFICIENT')) {
      reasons.push('HF_INSUFFICIENT');
    }
    return { dimension: 'DRIVER_CONDUCT', status: 'INSUFFICIENT_DATA', reasons };
  }

  if (native.status === 'LIMITED' && native.reasons.includes('NO_NATIVE_EVENTS')) {
    reasons.push('NO_NATIVE_EVENTS', 'CONDUCT_REQUIRES_BEHAVIOR_GATE');
    return { dimension: 'DRIVER_CONDUCT', status: 'LIMITED', reasons };
  }

  if (reconstructed.status === 'ASSESSABLE' || reconstructed.status === 'LIMITED') {
    return { dimension: 'DRIVER_CONDUCT', status: reconstructed.status, reasons };
  }

  reasons.push('CONDUCT_REQUIRES_BEHAVIOR_GATE');
  return { dimension: 'DRIVER_CONDUCT', status: 'LIMITED', reasons };
}

function assessAttribution(input: TripAssessabilityPolicyInput): DimensionDraft {
  const reasons: TripAssessabilityReasonCode[] = [];
  const { attribution } = input;

  if (attribution.isPrivateTrip) {
    reasons.push('PRIVATE_TRIP_ATTRIBUTION');
    return { dimension: 'ATTRIBUTION', status: 'NOT_APPLICABLE', reasons };
  }
  if (attribution.assignmentSubjectId && attribution.assignmentStatus) {
    return { dimension: 'ATTRIBUTION', status: 'ASSESSABLE', reasons };
  }
  if (attribution.assignmentStatus) {
    reasons.push('MISSING_ATTRIBUTION_SUBJECT');
    return { dimension: 'ATTRIBUTION', status: 'LIMITED', reasons };
  }
  reasons.push('MISSING_ATTRIBUTION_SUBJECT');
  return { dimension: 'ATTRIBUTION', status: 'INSUFFICIENT_DATA', reasons };
}

function finalizeDraft(
  draft: DimensionDraft,
  input: TripAssessabilityPolicyInput,
  caps: TripAssessabilityCapabilitySnapshot,
): TripAssessabilityDimensionAssessment {
  return {
    dimension: draft.dimension,
    status: draft.status,
    reasons: draft.reasons,
    coverage: draft.coverage ?? caps.coverage ?? input.route.coverage ?? null,
    effectiveCadenceMs:
      draft.effectiveCadenceMs ?? caps.effectiveCadenceMs ?? input.route.effectiveCadenceMs ?? null,
    p95CadenceMs: draft.p95CadenceMs ?? caps.p95CadenceMs ?? input.route.p95CadenceMs ?? null,
    capabilityVersion: caps.capabilityVersion,
    inputWindowStart: input.inputWindowStart,
    inputWindowEnd: input.inputWindowEnd,
    calculatedAt: input.calculatedAt,
    policyVersion: TRIP_ASSESSABILITY_POLICY_VERSION,
  };
}

/**
 * Pure per-dimension assessability policy.
 * No user decisions, no Nest DI — deterministic from trip facts + optional capability snapshot.
 */
export function evaluateTripAssessability(
  input: TripAssessabilityPolicyInput,
): TripAssessabilityPolicyResult {
  const caps = resolveCapabilitySnapshot(input);

  const tripBoundary = assessTripBoundary(input);
  const route = assessRoute(input, caps);
  const vehicleLoad = assessVehicleLoad(input);
  const nativeBehavior = assessNativeBehavior(input, caps);
  const reconstructedBehavior = assessReconstructedBehavior(input, caps);
  const engineMisuse = assessEngineMisuse(input);
  const brakingIntensity = assessBrakingIntensity(input);
  const cornering = assessCornering(input);
  const damageRisk = assessDamageRisk(input);
  const driverConduct = assessDriverConduct(input, nativeBehavior, reconstructedBehavior);
  const attribution = assessAttribution(input);

  const drafts: DimensionDraft[] = [
    tripBoundary,
    route,
    vehicleLoad,
    nativeBehavior,
    reconstructedBehavior,
    engineMisuse,
    brakingIntensity,
    cornering,
    damageRisk,
    driverConduct,
    attribution,
  ];

  if (drafts.length !== TRIP_ASSESSABILITY_DIMENSIONS.length) {
    throw new Error('Trip assessability policy must emit all dimensions');
  }

  const dimensions = drafts.map((draft) => finalizeDraft(draft, input, caps));

  return {
    policyVersion: TRIP_ASSESSABILITY_POLICY_VERSION,
    calculatedAt: input.calculatedAt,
    inputWindowStart: input.inputWindowStart,
    inputWindowEnd: input.inputWindowEnd,
    dimensions,
  };
}
