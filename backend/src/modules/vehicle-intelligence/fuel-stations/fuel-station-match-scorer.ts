import {
  SCORE_GEOMETRY_WITHIN_100M,
  SCORE_GEOMETRY_WITHIN_20M,
  SCORE_GEOMETRY_WITHIN_25M,
  SCORE_GEOMETRY_WITHIN_50M,
  SCORE_INSIDE_GEOMETRY,
  SCORE_METADATA_BONUS_FULL,
  SCORE_METADATA_BONUS_PARTIAL,
  SCORE_POINT_WITHIN_20M,
  SCORE_POINT_WITHIN_50M,
} from './fuel-station-location.constants';
import type { FuelStationMatchFeatures } from './fuel-station-location.types';

export function isAreaGeometryType(geometryType: string): boolean {
  const upper = geometryType.toUpperCase();
  return upper.includes('POLYGON') || upper.includes('MULTIPOLYGON');
}

export function scoreGeometryDistance(distanceMeters: number): number {
  if (distanceMeters <= 20) return SCORE_GEOMETRY_WITHIN_20M;
  if (distanceMeters <= 25) return SCORE_GEOMETRY_WITHIN_25M;
  if (distanceMeters <= 50) return SCORE_GEOMETRY_WITHIN_50M;
  if (distanceMeters <= 100) return SCORE_GEOMETRY_WITHIN_100M;
  return 0;
}

export function scorePointDistance(distanceMeters: number): number {
  if (distanceMeters <= 20) return SCORE_POINT_WITHIN_20M;
  if (distanceMeters <= 50) return SCORE_POINT_WITHIN_50M;
  return 0;
}

export function computeCandidateBaseScore(input: {
  insideGeometry: boolean;
  geometryDistanceMeters: number;
  pointDistanceMeters: number;
  isAreaGeometry: boolean;
  metadataCompleteness: number;
}): number {
  let score = 0;

  if (input.insideGeometry) {
    score += SCORE_INSIDE_GEOMETRY;
  }

  score += scoreGeometryDistance(input.geometryDistanceMeters);

  if (!input.isAreaGeometry) {
    score += scorePointDistance(input.pointDistanceMeters);
  }

  if (input.metadataCompleteness >= 0.8) {
    score += SCORE_METADATA_BONUS_FULL;
  } else if (input.metadataCompleteness >= 0.5) {
    score += SCORE_METADATA_BONUS_PARTIAL;
  }

  return score;
}

export function enrichCandidateFeatures(
  features: Omit<
    FuelStationMatchFeatures,
    'distanceRank' | 'secondCandidateGapMeters' | 'secondCandidateGapRatio'
  >,
  rank: number,
  second?: Pick<FuelStationMatchFeatures, 'geometryDistanceMeters'> | null,
): FuelStationMatchFeatures {
  const secondCandidateGapMeters = second
    ? Math.abs(second.geometryDistanceMeters - features.geometryDistanceMeters)
    : null;
  const scoreGap = second ? Math.max(0, features.geometryDistanceMeters - second.geometryDistanceMeters) : null;

  return {
    ...features,
    distanceRank: rank,
    secondCandidateGapMeters,
    secondCandidateGapRatio:
      secondCandidateGapMeters !== null && features.geometryDistanceMeters > 0
        ? secondCandidateGapMeters / features.geometryDistanceMeters
        : null,
  };
}
