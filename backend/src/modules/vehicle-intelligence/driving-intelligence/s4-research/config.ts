import type { PointToSegmentDistanceM } from './osm-parse';

export type S4ResearchAlgorithmConfig = {
  uncertaintyRadiusM: number;
  signalSearchRadiusM: number;
  bearingCompatDeg: number;
  competitorGapM: number;
  viterbiTopK: number;
  junctionAttachMaxM: number;
  /** Replay/audit override only (e.g. legacy geometry V1 diff). */
  pointToSegmentDistanceM?: PointToSegmentDistanceM;
};

export const DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG: S4ResearchAlgorithmConfig = {
  uncertaintyRadiusM: 25,
  signalSearchRadiusM: 35,
  bearingCompatDeg: 45,
  competitorGapM: 5,
  viterbiTopK: 4,
  junctionAttachMaxM: 45,
};
