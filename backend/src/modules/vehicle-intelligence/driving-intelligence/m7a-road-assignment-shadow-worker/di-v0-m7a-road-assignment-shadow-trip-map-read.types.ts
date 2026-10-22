import type { Outcome } from '../exp021-frozen-m7a';

export type DiV0M7aRoadAssignmentShadowTripMapGeometrySource = 'NONE' | 'POSITION_ANCHOR';

export type DiV0M7aRoadAssignmentShadowTripMapPointDto = {
  bucketLabelUtc: string;
  outcome: Outcome;
  osmWayId: number | null;
  headingDeg: number | null;
  candidateWayIds: number[];
  ambiguityReasons: string[];
  availability: string;
  latitude: number | null;
  longitude: number | null;
  positionResolved: boolean;
};

export type DiV0M7aRoadAssignmentShadowTripMapOutcomeSummary = {
  bucketCount: number;
  confirmedCount: number;
  ambiguousCount: number;
  unknownCount: number;
};
