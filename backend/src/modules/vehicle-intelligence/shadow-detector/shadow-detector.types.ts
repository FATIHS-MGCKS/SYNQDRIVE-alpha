/**
 * Shared shadow detector framework contract (P35).
 */
import type {
  DrivingDetectorKey,
  DrivingDetectorSupportStatus,
} from '../driving-detector-capability/driving-detector-capability.types';

export const SHADOW_DETECTOR_FRAMEWORK_VERSION = 'shadow-detector-framework-v1';

export type ShadowDetectorAssessability = 'FULL' | 'LIMITED' | 'NOT_ASSESSABLE';

export type ShadowCandidateEvent = {
  eventType: string;
  occurredAt: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  peakValue?: number | null;
  unit?: string | null;
  label?: string | null;
};

export type ShadowNativeEventComparison = {
  nativeEventCount: number;
  shadowCandidateCount: number;
  matchedWithinWindow: number;
  shadowOnlyCount: number;
  nativeOnlyCount: number;
  windowSeconds: number;
};

export type ShadowMisuseCaseComparison = {
  misuseCaseCount: number;
  shadowCandidateCount: number;
  matchedWithinWindow: number;
  shadowOnlyCount: number;
  misuseOnlyCount: number;
  windowSeconds: number;
  misuseTypes: string[];
};

/** HF sample for shadow detector policies — coolant is never substituted by exterior temp. */
export type ShadowDetectorHfSample = {
  timestamp: string;
  speedKmh: number | null;
  coolantC: number | null;
  rpm: number | null;
  throttlePct: number | null;
  loadPct: number | null;
  engineRuntimeSec: number | null;
  torqueNm: number | null;
  torquePct: number | null;
  exteriorTempC: number | null;
  tractionBatteryPowerKw: number | null;
  /** Optional post-trip altitude context (m) — never proves abuse alone. */
  altitudeM: number | null;
  /** Optional transmission gear — kickdown-like context only. */
  gear: number | null;
  /** Ignition on (0/1 AVG) — nullable for BEV without signal. */
  ignitionOn: boolean | null;
};

export type ShadowMisuseCaseRef = {
  type: string;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  eventCount: number;
};

export type ShadowDimoIdlingSegmentRef = {
  segmentId: string;
  startTime: string;
  endTime: string | null;
  durationSeconds: number;
  maxSpeedKmh: number | null;
};

export type ShadowTripContext = {
  tripStartTime: string;
  tripEndTime: string | null;
  tripDurationMs: number;
};

export type ShadowDetectorExecutionContext = {
  fuelType: string | null;
  isEvPowertrain: boolean;
  isPhev: boolean;
  iceOperationConfirmed: boolean;
  hfSamples: readonly ShadowDetectorHfSample[];
  effectiveCadenceMs: number | null;
  p95CadenceMs: number | null;
  hfCoverage: number | null;
  coolantSampleCount: number;
  exteriorTempSampleCount: number;
  misuseCases: readonly ShadowMisuseCaseRef[];
  tripContext: ShadowTripContext;
  dimoIdlingSegments: readonly ShadowDimoIdlingSegmentRef[];
  dimoIdlingProviderError: string | null;
  ignitionSampleCount: number;
  rpmSampleCount: number;
  speedSampleCount: number;
  engineRuntimeSampleCount: number;
  providerGaps: readonly string[];
};

export type ShadowDetectorCapabilitySnapshot = {
  status: DrivingDetectorSupportStatus;
  missingRequirements: readonly string[];
  effectiveCadenceMs: number | null;
  p95CadenceMs: number | null;
  coverage: number | null;
};

/** Canonical per-detector shadow output — never written to DrivingEvent. */
export type ShadowDetectorResult = {
  detectorId: DrivingDetectorKey;
  modelVersion: string;
  capabilityStatus: DrivingDetectorSupportStatus;
  assessability: ShadowDetectorAssessability;
  candidateEvents: ShadowCandidateEvent[];
  context: Record<string, string | number | boolean | null>;
  confidence: number | null;
  coverage: number | null;
  rejectionReasons: string[];
  comparisonWithNativeEvents: ShadowNativeEventComparison | null;
  comparisonWithMisuseCases: ShadowMisuseCaseComparison | null;
  skipped: boolean;
  skipReason?: string | null;
};

export type ShadowDetectorTripWindow = {
  tripId: string;
  vehicleId: string;
  organizationId: string;
  analysisRunId: string;
  startTime: Date;
  endTime: Date | null;
};

export type ShadowDetectorRunInput = ShadowDetectorTripWindow & {
  frameworkVersion: string;
  resolvedAt: string;
  executionContext?: ShadowDetectorExecutionContext | null;
  activeDetectorCapability?: ShadowDetectorCapabilitySnapshot | null;
};

export type ShadowDetectorRunOutcome = {
  frameworkVersion: string;
  tripId: string;
  analysisRunId: string;
  ranAt: string;
  results: ShadowDetectorResult[];
  skippedFramework: boolean;
  skipReason?: string | null;
};

export type ShadowDetectorPersistInput = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  analysisRunId: string;
  observedAt: Date;
  result: ShadowDetectorResult;
};
