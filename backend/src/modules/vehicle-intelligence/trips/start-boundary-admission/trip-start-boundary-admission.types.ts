import type { DimoTripSegment } from '../../../dimo/dimo-segments.service';
import type { RoutePoint, TripCoreDataPoint } from '../../../dimo/dimo-segments.service';

/** Vehicle integration modality (connection identity) — not DIMO segment detection mechanism. */
export type TripStartIntegrationModality =
  | 'SOFTWARE_INTEGRATION'
  | 'HARDWARE_DEVICE'
  | 'UNKNOWN';

export type DimoSegmentDetectionMechanism =
  | 'changePointDetection'
  | 'frequencyAnalysis'
  | 'ignitionDetection'
  | 'UNKNOWN';

export type EvidenceBackedStartBoundaryDecision =
  | 'PROVIDER_START_ADMITTED'
  | 'PROVIDER_START_BOUNDED'
  | 'PROVIDER_START_UNCORROBORATED'
  | 'MOVEMENT_BOUNDARY_SELECTED'
  | 'CANDIDATE_BOUNDARY_FALLBACK';

export type MovementEvidenceSource =
  | 'CORE_SPEED'
  | 'CORE_ODOMETER'
  | 'ROUTE_POSITION'
  | 'ROUTE_SPEED'
  | 'SEGMENT_DISTANCE'
  | 'SEGMENT_ODOMETER'
  | 'SEGMENT_MAX_SPEED'
  | 'NONE';

export type MovementEvidenceCoverageState =
  | 'TRUSTED_MOVEMENT_PRESENT'
  | 'PREFIX_GAP_NO_TRUSTED_MOVEMENT'
  | 'SEGMENT_AGGREGATE_ACTIVITY_ONLY'
  | 'NO_DATA_IN_WINDOW'
  | 'FREQUENCY_ONLY';

export interface EvidenceBackedStartBoundaryUncertainty {
  /**
   * EXP021 departure-review / maneuver context anchor (e.g. video PTS 0).
   * NOT exact physical movement; NOT guaranteed stationary; does not set canonical start.
   */
  departureReviewAnchorAt: Date | null;
  uncorroboratedPrefixFromAt: Date | null;
  uncorroboratedPrefixToAt: Date | null;
  clockQuantizationNote: string;
}

export interface EvidenceBackedStartBoundaryProvenance {
  integrationModality: TripStartIntegrationModality;
  providerSegmentId: string | null;
  /** Mechanism from segment payload when a segment is matched. */
  providerSegmentDetectionMechanism: DimoSegmentDetectionMechanism | null;
  /**
   * True only when historical evidence independently proves the detection mechanism
   * for this trip (not inferred from integration modality).
   */
  segmentDetectionMechanismIndependentlyProven: boolean;
  /** Segment-level aggregates — trip activity context, not timestamped start proof. */
  segmentAggregateActivitySources: MovementEvidenceSource[];
  /** Timestamp-winning movement source(s) for the chosen boundary (exact, not synthetic). */
  movementEvidenceSources: MovementEvidenceSource[];
  movementEvidenceCoverage: MovementEvidenceCoverageState;
  boundaryDecision: EvidenceBackedStartBoundaryDecision;
  boundaryAdjustmentMs: number;
  legacyWouldHaveUsedProviderSegment: boolean;
}

export interface ResolveEvidenceBackedStartBoundaryInput {
  candidateStartAt: Date;
  confirmedAt: Date;
  segments: DimoTripSegment[];
  corePoints: TripCoreDataPoint[];
  routePoints: RoutePoint[];
  profile: string;
  integrationModality: TripStartIntegrationModality;
  departureReviewAnchorAt?: Date | null;
  segmentDetectionMechanismIndependentlyProven?: boolean;
}

export interface EvidenceBackedStartBoundaryResult {
  providerSegmentStartAt: Date | null;
  earliestSupportedMovementAt: Date | null;
  candidateStartAt: Date;
  canonicalStartAt: Date;
  decision: EvidenceBackedStartBoundaryDecision;
  provenance: EvidenceBackedStartBoundaryProvenance;
  uncertainty: EvidenceBackedStartBoundaryUncertainty;
  matchingSegment: DimoTripSegment | null;
}

export interface LegacySegmentStartBoundaryResult {
  startAt: Date;
  source: 'DIMO_SEGMENT';
  adjustedMs: number;
  dimoSegmentId: string;
}

export interface StartBoundaryAdmissionShadowComparison {
  legacyCanonicalStartAt: Date;
  proposedCanonicalStartAt: Date;
  deltaMs: number;
  decision: EvidenceBackedStartBoundaryDecision;
  evidenceSources: MovementEvidenceSource[];
  movementEvidenceCoverage: MovementEvidenceCoverageState;
  uncertainty: EvidenceBackedStartBoundaryUncertainty;
  integrationModality: TripStartIntegrationModality;
}

export function normalizeSegmentDetectionMechanism(
  mechanism: string | null | undefined,
): DimoSegmentDetectionMechanism {
  if (
    mechanism === 'changePointDetection' ||
    mechanism === 'frequencyAnalysis' ||
    mechanism === 'ignitionDetection'
  ) {
    return mechanism;
  }
  return 'UNKNOWN';
}
