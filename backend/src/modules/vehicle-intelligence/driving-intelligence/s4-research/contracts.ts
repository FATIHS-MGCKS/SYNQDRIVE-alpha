import type { S4ResearchAlgorithmConfig } from './config';

/** Algorithmic road label — ASSOCIATED is not independent ground-truth road ID accuracy. */
export type RoadHypothesisLabel = 'ASSOCIATED' | 'AMBIGUOUS' | 'UNKNOWN';

export type GpsAvailability = 'PRESENT' | 'ROW_ABSENT' | 'SIGNAL_NULL' | 'OTHER';

export type IndependentAccuracyStatus = 'NOT_ASSESSABLE';

export type EvidenceClassification =
  | 'OBSERVED'
  | 'INFERRED'
  | 'COMPUTATIONAL_CANDIDATE_ONLY'
  | 'UNPROVEN';

export type ResearchGpsBucket = {
  bucketLabelUtc: string;
  /** Source timestamp when distinct from grid label (optional). */
  sourceTimestampUtc?: string | null;
  availability: GpsAvailability;
  latitude: number | null;
  longitude: number | null;
  qcTrustLevel?: string | null;
  l3SpeedKmh?: number | null;
  motionState?: string | null;
};

export type ResearchOsmWay = {
  osmWayId: number;
  nodes: Array<{ lat: number; lon: number }>;
  tags: Record<string, string>;
  highway: string | null;
  maxspeed: string | null;
  oneway: string | null;
};

export type ResearchOsmSignalNode = {
  osmNodeId: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  kind: 'traffic_signals' | 'crossing' | 'junction' | 'other';
};

export type ResearchRoadContext = {
  ways: ResearchOsmWay[];
  signalNodes: ResearchOsmSignalNode[];
  confirmedJunctions: Array<{ nodeId: number; lat: number; lon: number }>;
  osmSnapshotSha256?: string | null;
};

export type WayCandidateEvidence = {
  osmWayId: number;
  distanceM: number;
  segmentBearingDeg: number | null;
  bearingDeltaDeg: number | null;
  highway: string | null;
  oneway: string | null;
  within5mOfNearest: boolean;
};

export type GraphTransitionConflict = {
  bucketLabelUtc: string;
  prevBucketLabelUtc: string;
  prevWayId: number;
  curWayId: number;
  graphReachable: boolean;
  reviewNote: string;
};

export type RoadMatchingWindowResult = {
  bucketLabelUtc: string;
  gpsEvidenceState: GpsAvailability;
  headingDeg: number | null;
  roadCandidateIds: number[];
  baseline: {
    hypothesis: RoadHypothesisLabel;
    osmWayId: number | null;
    ambiguityReasons: string[];
    evidenceClassification: EvidenceClassification;
  };
  viterbi: {
    hypothesis: RoadHypothesisLabel;
    osmWayId: number | null;
    ambiguityReasons: string[];
    evidenceClassification: EvidenceClassification;
  };
  topologyEvidence: {
    nearestConfirmedJunctionM: number | null;
    confirmedJunctionNodeId: number | null;
    trafficSignalNodeId: number | null;
    trafficSignalDistanceM: number | null;
  };
  distanceHeadingEvidence: {
    topCandidateDistanceM: number | null;
    headingDeg: number | null;
  };
  graphTransitionConflicts: GraphTransitionConflict[];
  independentAccuracy: IndependentAccuracyStatus;
};

export type RoadMatchingPipelineInput = {
  buckets: ResearchGpsBucket[];
  roadContext: ResearchRoadContext;
  config: S4ResearchAlgorithmConfig;
};

export type RoadMatchingPipelineResult = {
  algorithmIds: {
    baseline: string;
    viterbi: string;
  };
  windows: RoadMatchingWindowResult[];
  summary: {
    baseline: Record<RoadHypothesisLabel, number>;
    viterbi: Record<RoadHypothesisLabel, number>;
    bucketsChanged: number;
    graphTransitionConflicts: number;
    independentAccuracy: IndependentAccuracyStatus;
  };
};
