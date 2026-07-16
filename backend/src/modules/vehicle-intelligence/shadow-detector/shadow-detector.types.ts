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
