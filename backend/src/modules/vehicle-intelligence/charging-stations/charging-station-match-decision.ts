import {
  ABSOLUTE_SCORE_GAP_AMBIGUOUS,
  AMBIGUOUS_MIN_SCORE,
  CLOSE_CANDIDATE_DISTANCE_AMBIGUOUS_M,
  HIGH_CONFIDENCE_MAX_GEOMETRY_DISTANCE_M,
  MATCHED_HIGH_MIN_SCORE,
  MATCHED_LOW_MIN_SCORE,
  MATCHED_MEDIUM_MIN_SCORE,
  MAX_MATCH_DISTANCE_METERS,
  NOT_FOUND_MAX_SCORE,
  RELATIVE_SCORE_GAP_AMBIGUOUS,
} from './charging-station-location.constants';
import type {
  ChargingStationMatchConfidence,
  ChargingStationResolveResult,
  ChargingStationResolveStatus,
  ChargingStationScoredCandidate,
} from './charging-station-location.types';
import { CHARGING_STATION_RESOLVER_VERSION } from './charging-station-location.types';

export function isAmbiguousMatch(
  top: ChargingStationScoredCandidate,
  second: ChargingStationScoredCandidate,
): boolean {
  if (
    top.features.insideGeometry &&
    second.features.insideGeometry &&
    top.station.osmId !== second.station.osmId &&
    top.dedupeGroupId !== second.dedupeGroupId
  ) {
    return true;
  }

  if (top.score < AMBIGUOUS_MIN_SCORE) {
    return false;
  }

  const scoreGap = top.score - second.score;
  const geometryGapMeters = Math.abs(
    top.features.geometryDistanceMeters - second.features.geometryDistanceMeters,
  );

  if (scoreGap < ABSOLUTE_SCORE_GAP_AMBIGUOUS) {
    return true;
  }

  if (
    top.score >= 50 &&
    geometryGapMeters < CLOSE_CANDIDATE_DISTANCE_AMBIGUOUS_M &&
    scoreGap < ABSOLUTE_SCORE_GAP_AMBIGUOUS + 5
  ) {
    return true;
  }

  const relativeGap = top.score > 0 ? scoreGap / top.score : 0;
  if (relativeGap < RELATIVE_SCORE_GAP_AMBIGUOUS && top.score < MATCHED_HIGH_MIN_SCORE) {
    return true;
  }

  return false;
}

export function resolveMatchConfidence(
  status: ChargingStationResolveStatus,
  top: ChargingStationScoredCandidate,
): ChargingStationMatchConfidence | undefined {
  if (status !== 'MATCHED') {
    return undefined;
  }

  const insideOrVeryClose =
    top.features.insideGeometry ||
    top.features.geometryDistanceMeters <= HIGH_CONFIDENCE_MAX_GEOMETRY_DISTANCE_M;

  if (top.score >= MATCHED_HIGH_MIN_SCORE && insideOrVeryClose) {
    return 'HIGH';
  }
  if (top.score >= MATCHED_MEDIUM_MIN_SCORE) {
    return 'MEDIUM';
  }
  if (top.score >= MATCHED_LOW_MIN_SCORE) {
    return 'LOW';
  }
  return undefined;
}

export function exceedsMaxMatchDistance(top: ChargingStationScoredCandidate): boolean {
  return !top.features.insideGeometry && top.features.geometryDistanceMeters > MAX_MATCH_DISTANCE_METERS;
}

export function decideChargingStationMatch(
  candidates: ChargingStationScoredCandidate[],
  datasetVersion: string,
  diagnostics: NonNullable<ChargingStationResolveResult['diagnostics']>,
): ChargingStationResolveResult {
  const sorted = [...candidates].sort(compareCandidatesForRanking);

  if (sorted.length === 0) {
    return {
      status: 'NOT_FOUND',
      resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
      datasetVersion,
      diagnostics,
    };
  }

  const top = sorted[0];
  const second = sorted[1];

  const enrichedDiagnostics = {
    ...diagnostics,
    topScore: top.score,
    secondScore: second?.score,
    topDistance: top.features.geometryDistanceMeters,
    secondDistance: second?.features.geometryDistanceMeters,
  };

  if (second && isAmbiguousMatch(top, second)) {
    return {
      status: 'AMBIGUOUS',
      resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
      datasetVersion,
      score: top.score,
      candidates: sorted.slice(0, 5),
      diagnostics: enrichedDiagnostics,
    };
  }

  if (exceedsMaxMatchDistance(top) || top.score <= NOT_FOUND_MAX_SCORE) {
    return {
      status: 'NOT_FOUND',
      resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
      datasetVersion,
      candidates: sorted,
      diagnostics: enrichedDiagnostics,
    };
  }

  const status: ChargingStationResolveStatus = 'MATCHED';
  const confidence = resolveMatchConfidence(status, top);

  return {
    status,
    confidence,
    score: top.score,
    station: top.station,
    candidates: sorted.slice(0, 5),
    datasetVersion,
    resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
    diagnostics: enrichedDiagnostics,
  };
}

export function compareCandidatesForRanking(
  a: ChargingStationScoredCandidate,
  b: ChargingStationScoredCandidate,
): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.features.insideGeometry !== b.features.insideGeometry) {
    return a.features.insideGeometry ? -1 : 1;
  }
  if (a.features.geometryDistanceMeters !== b.features.geometryDistanceMeters) {
    return a.features.geometryDistanceMeters - b.features.geometryDistanceMeters;
  }
  if (a.features.pointDistanceMeters !== b.features.pointDistanceMeters) {
    return a.features.pointDistanceMeters - b.features.pointDistanceMeters;
  }
  const typeRank = geometryTypeRank(a.geometryType) - geometryTypeRank(b.geometryType);
  if (typeRank !== 0) return typeRank;
  return String(a.station.osmId).localeCompare(String(b.station.osmId));
}

function geometryTypeRank(geometryType: string): number {
  const upper = geometryType.toUpperCase();
  if (upper.includes('POLYGON')) return 0;
  if (upper.includes('LINE')) return 1;
  return 2;
}
