export type S4ResearchAlgorithmConfig = {
  uncertaintyRadiusM: number;
  signalSearchRadiusM: number;
  bearingCompatDeg: number;
  competitorGapM: number;
  viterbiTopK: number;
  junctionAttachMaxM: number;
};

export const DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG: S4ResearchAlgorithmConfig = {
  uncertaintyRadiusM: 25,
  signalSearchRadiusM: 35,
  bearingCompatDeg: 45,
  competitorGapM: 5,
  viterbiTopK: 4,
  junctionAttachMaxM: 45,
};
