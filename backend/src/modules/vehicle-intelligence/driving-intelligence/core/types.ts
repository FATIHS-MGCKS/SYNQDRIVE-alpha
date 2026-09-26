export type TelemetrySourceFamily = 'RUPTELA_R1' | 'API_SYNTHETIC' | 'UNKNOWN';

export type EvidenceAvailability = 'PRESENT' | 'SIGNAL_NULL' | 'ROW_ABSENT';

export type PositionState =
  | 'FRESH'
  | 'FROZEN_UNRESOLVED'
  | 'FROZEN_MOVEMENT_SUPPORTED'
  | 'FROZEN_STOP_SUPPORTED'
  | 'RELEASE'
  | 'ROW_ABSENT'
  | 'SIGNAL_NULL';

/** Label immediately after a row gap in the densified grid (structural; not a C0.4 display state). */
export type StructuralGridPositionFlag = 'FIRST_OR_AFTER_ROW_GAP';

export type TemporalConfidence = 'EXACT_PROVEN' | 'BUCKET_BOUNDED' | 'INTERVAL_ONLY' | 'UNKNOWN';

export type SourceRelation = 'SUPPORTED' | 'CONFLICTING' | 'CONFLICT_EXPLAINED' | 'UNASSESSABLE';

export type MotionState =
  | 'STATIONARY_SUPPORTED'
  | 'MOVING_SPEED_ESTIMATED'
  | 'MOVING_SPEED_UNKNOWN'
  | 'TRANSITION_UNCERTAIN'
  | 'NO_MOTION_EVIDENCE';

export type ValueConfidence = 'HIGH' | 'MODERATE' | 'LOW' | 'UNAVAILABLE';

export type ClaimLevel = 'L0' | 'L1' | 'L2' | 'L3';

export type SpeedEvidenceState =
  | 'NUMERIC_HIGH'
  | 'NUMERIC_MODERATE'
  | 'MOVEMENT_ONLY'
  | 'STATIONARY_BAND'
  | 'ABSTAINED'
  | 'NONE';

export type NativeEventCalibrationState = 'UNCALIBRATED' | 'PILOT_SUPPORTED' | 'VALIDATED';

export type AbstentionReason =
  | 'ROW_ABSENT'
  | 'POSITION_FROZEN'
  | 'POSITION_RELEASE'
  | 'INCOMPLETE_SUPPORT'
  | 'INVALID_POSITION'
  | 'GEOMETRY_DISCONTINUITY'
  | 'TEMPORAL_SEMANTICS_INSUFFICIENT'
  | 'NO_KINEMATIC_EVIDENCE'
  | 'CALIBRATION_REQUIRED'
  | 'UNSUPPORTED_SOURCE_FAMILY'
  | 'ROW_GAP_IN_SUPPORT'
  | 'SIGNAL_NULL_IN_SUPPORT';

export type DerivationMethod = 'L3_CENTERED_PATH' | 'HOLD_INTERVAL_LB' | 'NONE';

export interface DiV0ProvenanceRef {
  sourceFamily: TelemetrySourceFamily;
  sourceSignal: string;
  sourceQuality: string;
  temporalSemantics: TemporalConfidence;
  supportIntervalStart: string | null;
  supportIntervalEnd: string | null;
  derivationMethod: DerivationMethod;
  derivationVersion: string;
  structuralVersion: string;
  calibrationVersion: string;
  sourceFamilyPolicyVersion: string;
  derivedFrom: string[];
}

export interface LatLon {
  latitude: number;
  longitude: number;
}

export interface NormalizedPositionObservation {
  bucketLabel: string;
  intervalStart: string;
  intervalEnd: string;
  referenceTime: string;
  availability: EvidenceAvailability;
  latitude?: number;
  longitude?: number;
  headingDeg?: number | null;
  altitudeM?: number | null;
  sourceFamily: TelemetrySourceFamily;
  provenance: Pick<DiV0ProvenanceRef, 'sourceSignal' | 'derivedFrom'>;
}

export interface NormalizedR1ObdObservation {
  bucketLabel: string;
  temporalConfidence: 'INTERVAL_ONLY';
  speedKmh?: number | null;
  rpm?: number | null;
  throttlePct?: number | null;
  loadPct?: number | null;
  coolantC?: number | null;
  gear?: number | null;
  odometerKm?: number | null;
  provenance: Pick<DiV0ProvenanceRef, 'sourceSignal' | 'derivedFrom'>;
}

export interface NativeEventObservation {
  eventType: string;
  providerTimestamp?: string | null;
  sourceFamily: TelemetrySourceFamily;
  calibrationState: NativeEventCalibrationState;
  temporalConfidence: TemporalConfidence;
  payloadRef?: string | null;
  provenance: Pick<DiV0ProvenanceRef, 'derivedFrom'>;
}

export interface DiV0IntervalSpeedResult {
  intervalStart: string;
  intervalEnd: string;
  referenceTime: string;
  motionState: MotionState;
  estimatedSpeedKmh: number | null;
  speedRangeKmh: [number, number] | null;
  speedEvidenceState: SpeedEvidenceState;
  positionState: PositionState;
  causalPositionState: PositionState;
  temporalConfidence: TemporalConfidence;
  valueConfidence: ValueConfidence;
  sourceRelation: SourceRelation;
  evidenceSources: string[];
  sourceQualityFlags: string[];
  abstentionReason: AbstentionReason | null;
  claimLevel: ClaimLevel;
  provenance: DiV0ProvenanceRef;
  /** Interval movement lower bound (km/h) when motion is supported without point speed. */
  intervalMeanSpeedLowerBoundKmh: number | null;
}

export interface DiV0TripComputeInput {
  sourceFamily: TelemetrySourceFamily;
  positions: NormalizedPositionObservation[];
  r1Obd?: NormalizedR1ObdObservation[];
  nativeEvents?: NativeEventObservation[];
}

export interface DiV0TripComputeOutput {
  intervals: DiV0IntervalSpeedResult[];
  nativeEvents: NativeEventObservation[];
  warnings: string[];
}
