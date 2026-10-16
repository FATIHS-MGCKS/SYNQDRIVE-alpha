import type { DimoTripSegment } from '../../../dimo/dimo-segments.service';
import type { RoutePoint, TripCoreDataPoint } from '../../../dimo/dimo-segments.service';

/** DIMO vehicle integration class — not the segment detection mechanism. */
export type TripStartProviderMechanism =
  | 'SOFTWARE_INTEGRATION'
  | 'HARDWARE_DEVICE'
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
  | 'NO_DATA_IN_WINDOW'
  | 'FREQUENCY_ONLY';

export interface EvidenceBackedStartBoundaryUncertainty {
  /** Inclusive lower bound where vehicle is still plausibly stationary (external review, not GPS). */
  lastConfirmedStationaryUpperBoundAt: Date | null;
  /** Inclusive start of provider prefix without trusted movement corroboration. */
  uncorroboratedPrefixFromAt: Date | null;
  /** Exclusive end of uncorroborated prefix (first trusted movement or candidate). */
  uncorroboratedPrefixToAt: Date | null;
  /** Quantized overlay clock / display latency — not used as canonical time. */
  clockQuantizationNote: string;
}

export interface EvidenceBackedStartBoundaryProvenance {
  providerMechanism: TripStartProviderMechanism;
  providerSegmentId: string | null;
  providerSegmentDetectionMechanism: string | null;
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
  providerMechanism: TripStartProviderMechanism;
  /**
   * Optional external departure-review anchor (e.g. EXP021 video PTS 0).
   * Does NOT assert exact physical movement — only tightens uncertainty interval.
   */
  departureReviewWindowStartAt?: Date | null;
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
  uncertainty: EvidenceBackedStartBoundaryUncertainty;
  providerMechanism: TripStartProviderMechanism;
}
