import type { DimoDetectionMechanism } from '@modules/dimo/queries/trip-segments.query';

/** Post-trip validation mechanisms — read-only DIMO segment compare. */
export const DIMO_TRIP_SEGMENT_VALIDATION_MECHANISMS = [
  'ignitionDetection',
  'frequencyAnalysis',
  'changePointDetection',
] as const satisfies readonly DimoDetectionMechanism[];

export type DimoTripSegmentValidationMechanism =
  (typeof DIMO_TRIP_SEGMENT_VALIDATION_MECHANISMS)[number];

export type DimoTripSegmentValidationStatus =
  | 'MATCHED'
  | 'MINOR_BOUNDARY_DIFFERENCE'
  | 'MAJOR_BOUNDARY_DIFFERENCE'
  | 'SEGMENT_MISSING'
  | 'PROVIDER_ERROR';

export type DimoSegmentDataQuality = 'HIGH' | 'MEDIUM' | 'LOW';

/** Read-only trip boundary snapshot — never mutated by validation. */
export type TripBoundarySnapshot = {
  tripId: string;
  vehicleId: string;
  dimoSegmentId: string | null;
  tripSource: string;
  startTime: Date;
  endTime: Date | null;
  durationMinutes: number | null;
  distanceKm: number | null;
};

export type SegmentBoundarySnapshot = {
  segmentId: string;
  mechanism: DimoTripSegmentValidationMechanism;
  startTime: Date;
  endTime: Date | null;
  durationSeconds: number;
  distanceKm: number | null;
  odometerStartKm: number | null;
  odometerEndKm: number | null;
  isOngoing: boolean;
  startedBeforeRange: boolean;
  dataQuality: DimoSegmentDataQuality;
};

export type BoundaryDeltaMetrics = {
  startDeltaSec: number | null;
  endDeltaSec: number | null;
  durationDeltaSec: number | null;
  distanceDeltaKm: number | null;
};

export type MechanismSegmentValidationResult = {
  mechanism: DimoTripSegmentValidationMechanism;
  status: DimoTripSegmentValidationStatus;
  matchedSegment: SegmentBoundarySnapshot | null;
  deltas: BoundaryDeltaMetrics | null;
  providerSource: string;
  providerError: string | null;
  reasons: string[];
  requiredSignals: string[];
};

export type DimoTripSegmentValidationResult = {
  modelVersion: string;
  skipped: boolean;
  skipReason: string | null;
  overallStatus: DimoTripSegmentValidationStatus | null;
  primaryMechanism: DimoTripSegmentValidationMechanism | null;
  trip: TripBoundarySnapshot;
  mechanisms: MechanismSegmentValidationResult[];
  reasons: string[];
};

export type ValidateTripSegmentInput = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  analysisRunId: string;
  dimoTokenId: number | null;
};
