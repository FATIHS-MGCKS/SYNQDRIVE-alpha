import type { VehicleDetectionProfile, TripDetectionState } from '@prisma/client';
import type { TripCoreDataPoint, PerformanceReading } from '../../../dimo/dimo-segments.service';
import type { SnapshotEvidenceSignals } from '../trip-detection.types';

// ═══════════════════════════════════════════════════════════════
//  DETECTION PHASES
// ═══════════════════════════════════════════════════════════════

export const DETECTION_PHASES = {
  LIVE_START: 'live_start',
  ACTIVE_TRIP: 'active_trip',
  POSSIBLE_END: 'possible_end',
  REPAIR_MISSING_TRIP: 'repair_missing_trip',
  REPAIR_MISSING_END: 'repair_missing_end',
  DUPLICATE_OR_OVERLAP_CHECK: 'duplicate_or_overlap_check',
  QUALITY_CHECK: 'quality_check',
} as const;

export type DetectionPhase = (typeof DETECTION_PHASES)[keyof typeof DETECTION_PHASES];

// ═══════════════════════════════════════════════════════════════
//  DATA QUALITY ASSESSMENT
// ═══════════════════════════════════════════════════════════════

export interface DataQualityAssessment {
  snapshotFreshness: 'FRESH' | 'STALE' | 'MISSING';
  ignitionAvailable: boolean;
  speedAvailable: boolean;
  odometerAvailable: boolean;
  telemetryDensity: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  routeCoverage: 'FULL' | 'PARTIAL' | 'NONE';
  highFrequencyAvailable: boolean;
}

// ═══════════════════════════════════════════════════════════════
//  ANOMALY CONTEXT
// ═══════════════════════════════════════════════════════════════

export interface AnomalyContext {
  staleSnapshot?: boolean;
  missingFinalization?: boolean;
  suspiciousLongOpenTrip?: boolean;
  missingBehaviorSummary?: boolean;
  overlappingTrips?: boolean;
  missingEndTime?: boolean;
  suspectedMissedTrip?: boolean;
  confirmingStart?: boolean;
  ambiguousContinuity?: boolean;
  clickhouseAvailable?: boolean;
}

// ═══════════════════════════════════════════════════════════════
//  DETECTOR CONTEXT
// ═══════════════════════════════════════════════════════════════

export interface DetectorContext {
  vehicleId: string;
  dimoTokenId: number;
  profile: VehicleDetectionProfile;
  phase: DetectionPhase;
  currentState?: TripDetectionState;
  timeWindow?: { from: Date; to: Date };
  snapshotSignals?: SnapshotEvidenceSignals;
  previousSnapshot?: {
    latitude: number | null;
    longitude: number | null;
    odometerKm: number | null;
    fuelLevelAbsolute: number | null;
    evSoc: number | null;
    isIgnitionOn: boolean | null;
    speedKmh: number | null;
  } | null;
  coreDataPoints?: TripCoreDataPoint[];
  performanceReadings?: PerformanceReading[];
  dataQuality?: DataQualityAssessment;
  anomalyContext?: AnomalyContext;
  activeTripId?: string | null;
  possibleEndAt?: Date | null;
  endValidationAttempts?: number;
}

// ═══════════════════════════════════════════════════════════════
//  DETECTOR FINDING
// ═══════════════════════════════════════════════════════════════

export interface DetectorFinding {
  detectorName: string;
  verdict: 'TRIGGERED' | 'NOT_TRIGGERED' | 'INCONCLUSIVE';
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Structured evidence payload — survives JSON serialization for repair audit trail. */
  evidence: Record<string, unknown>;
  timestamp: Date;
  /** Optional time produced by the detector (e.g. CUSUM-derived end time). */
  detectedAt?: Date;
}

// ═══════════════════════════════════════════════════════════════
//  DETECTOR INTERFACE
// ═══════════════════════════════════════════════════════════════

export interface TripDetector {
  readonly name: string;
  evaluate(context: DetectorContext): Promise<DetectorFinding>;
}
