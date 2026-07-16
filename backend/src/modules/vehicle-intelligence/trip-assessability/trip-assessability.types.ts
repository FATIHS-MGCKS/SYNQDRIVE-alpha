import type {
  TripAssessabilityDimension,
  TripAssessabilityDimensionStatus,
} from '@prisma/client';
import type { DrivingDetectorCapabilityResult } from '../driving-detector-capability/driving-detector-capability.types';

/** Stable policy contract version — bump when dimension rules change materially. */
export const TRIP_ASSESSABILITY_POLICY_VERSION = 'trip-assessability-v1';

/** Default capability snapshot version when no probe rows are supplied. */
export const TRIP_ASSESSABILITY_DEFAULT_CAPABILITY_VERSION = 'capability-none-v0';

export const TRIP_ASSESSABILITY_DIMENSIONS: readonly TripAssessabilityDimension[] = [
  'TRIP_BOUNDARY',
  'ROUTE',
  'VEHICLE_LOAD',
  'NATIVE_BEHAVIOR',
  'RECONSTRUCTED_BEHAVIOR',
  'ENGINE_MISUSE',
  'BRAKING_INTENSITY',
  'CORNERING',
  'DAMAGE_RISK',
  'DRIVER_CONDUCT',
  'ATTRIBUTION',
] as const;

/** Machine-readable reason codes persisted in `reasonsJson`. */
export type TripAssessabilityReasonCode =
  | 'TRIP_ONGOING'
  | 'NO_END_TIME'
  | 'NO_DIMO_SEGMENT'
  | 'LOW_TRIP_QUALITY'
  | 'DISTANCE_DURATION_ONLY'
  | 'ROUTE_NOT_ENRICHED'
  | 'ROUTE_LOW_COVERAGE'
  | 'ROUTE_PROVIDER_ERROR'
  | 'NO_HF_POINTS'
  | 'HF_INSUFFICIENT'
  | 'HF_PROVIDER_ERROR'
  | 'CLICKHOUSE_UNAVAILABLE'
  | 'CLICKHOUSE_CIRCUIT_OPEN'
  | 'CLICKHOUSE_TIMEOUT'
  | 'NO_NATIVE_EVENTS'
  | 'NATIVE_QUERY_FAILED'
  | 'NATIVE_CAPABILITY_UNSUPPORTED'
  | 'NATIVE_CAPABILITY_DEGRADED'
  | 'RECONSTRUCTED_EVENTS_PRESENT'
  | 'NO_ENGINE_LOAD_SIGNALS'
  | 'NO_MISUSE_SIGNALS'
  | 'NO_BRAKING_SIGNALS'
  | 'NO_CORNERING_SIGNALS'
  | 'NO_DAMAGE_EVIDENCE'
  | 'CONDUCT_REQUIRES_BEHAVIOR_GATE'
  | 'MISSING_ATTRIBUTION_SUBJECT'
  | 'PRIVATE_TRIP_ATTRIBUTION'
  | 'CAPABILITY_UNSUPPORTED'
  | 'PROVIDER_ERROR';

export type TripAssessabilityCapabilitySnapshot = {
  capabilityVersion: string;
  coverage: number | null;
  effectiveCadenceMs: number | null;
  p95CadenceMs: number | null;
  nativeBehaviorSupported: boolean | null;
  hfCadenceSufficient: boolean | null;
  routeSupported: boolean | null;
};

export type TripAssessabilityPolicyInput = {
  calculatedAt: Date;
  inputWindowStart: Date;
  inputWindowEnd: Date | null;
  tripBoundary: {
    dimoSegmentId: string | null;
    startTime: Date;
    endTime: Date | null;
    tripStatus: string;
    qualityStatus: string | null;
  };
  route: {
    enrichmentStatus: string | null;
    waypointCount: number;
    coverage: number | null;
    effectiveCadenceMs: number | null;
    p95CadenceMs: number | null;
    providerError: boolean;
  };
  behavior: {
    enrichmentStatus: string | null;
    nativeEventCount: number;
    nativeQuerySucceeded: boolean | null;
    hfPointsTotal: number;
    hfPointsCleaned: number;
    reconstructedEventCount: number;
    providerError: boolean;
  };
  drivingImpact: {
    available: boolean;
    avgEngineLoad: number | null;
    avgRpm: number | null;
    avgThrottlePosition: number | null;
    abuseScore: number | null;
    providerError: boolean;
  };
  misuse: {
    stageStatus: string | null;
    misuseCaseCount: number;
    abuseEventCount: number;
    possibleImpactCount: number;
  };
  counters: {
    harshBrakeCount: number;
    hardBrakingEvents: number;
    brakingEventCount: number;
    harshCornerCount: number;
    corneringEvents: number;
    coldEngineAbuseCount: number;
    kickdownCount: number;
    abuseEvents: number;
  };
  attribution: {
    assignmentStatus: string | null;
    assignmentSubjectType: string | null;
    assignmentSubjectId: string | null;
    isPrivateTrip: boolean;
  };
  tripMetrics: {
    distanceKm: number | null;
    durationMinutes: number | null;
  };
  clickHouse?: {
    hfUnavailable: boolean;
    providerError: boolean;
    limitReason?: string | null;
  } | null;
  capabilities?: TripAssessabilityCapabilitySnapshot | null;
  /** Central detector resolver output (P32) — used by assessability + jobs. */
  detectorCapabilities?: DrivingDetectorCapabilityResult | null;
};

export type TripAssessabilityDimensionAssessment = {
  dimension: TripAssessabilityDimension;
  status: TripAssessabilityDimensionStatus;
  reasons: TripAssessabilityReasonCode[];
  coverage: number | null;
  effectiveCadenceMs: number | null;
  p95CadenceMs: number | null;
  capabilityVersion: string;
  inputWindowStart: Date;
  inputWindowEnd: Date | null;
  calculatedAt: Date;
  policyVersion: string;
};

export type TripAssessabilityPolicyResult = {
  policyVersion: string;
  calculatedAt: Date;
  inputWindowStart: Date;
  inputWindowEnd: Date | null;
  dimensions: TripAssessabilityDimensionAssessment[];
};

export type UpsertTripAssessabilityDimensionInput = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  dimension: TripAssessabilityDimension;
  status: TripAssessabilityDimensionStatus;
  reasons: TripAssessabilityReasonCode[];
  coverage?: number | null;
  effectiveCadenceMs?: number | null;
  p95CadenceMs?: number | null;
  capabilityVersion: string;
  inputWindowStart: Date;
  inputWindowEnd?: Date | null;
  calculatedAt: Date;
  policyVersion: string;
  analysisRunId?: string | null;
};
