import {
  DEDUPE_CONTAINED_NODE_DISTANCE_M,
  DEDUPE_SAME_BRAND_DISTANCE_M,
  DEDUPE_SAME_STATION_DISTANCE_M,
} from './charging-station-location.constants';
import { normalizeChargingStationLabel } from './charging-station-address.util';
import type { ChargingStationScoredCandidate } from './charging-station-location.types';

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusM = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(a));
}

function osmIdentityKey(candidate: ChargingStationScoredCandidate): string {
  return `${candidate.station.osmType}:${candidate.station.osmId}`;
}

function pickRepresentative(
  a: ChargingStationScoredCandidate,
  b: ChargingStationScoredCandidate,
): ChargingStationScoredCandidate {
  if (a.score !== b.score) {
    return a.score > b.score ? a : b;
  }
  if (a.features.isAreaGeometry !== b.features.isAreaGeometry) {
    return a.features.isAreaGeometry ? a : b;
  }
  if (a.features.insideGeometry !== b.features.insideGeometry) {
    return a.features.insideGeometry ? a : b;
  }
  return a.features.geometryDistanceMeters <= b.features.geometryDistanceMeters ? a : b;
}

export function dedupeChargingStationCandidatesByOsmIdentity(
  candidates: ChargingStationScoredCandidate[],
): { candidates: ChargingStationScoredCandidate[]; mergedCount: number } {
  const byKey = new Map<string, ChargingStationScoredCandidate>();
  for (const candidate of candidates) {
    const key = osmIdentityKey(candidate);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }
    byKey.set(key, pickRepresentative(existing, candidate));
  }
  const deduped = [...byKey.values()];
  return { candidates: deduped, mergedCount: candidates.length - deduped.length };
}

function shouldMergeCandidates(a: ChargingStationScoredCandidate, b: ChargingStationScoredCandidate): boolean {
  if (osmIdentityKey(a) === osmIdentityKey(b)) {
    return true;
  }

  const distance = haversineMeters(
    a.station.latitude,
    a.station.longitude,
    b.station.latitude,
    b.station.longitude,
  );

  const brandA = normalizeChargingStationLabel(a.station.brand);
  const brandB = normalizeChargingStationLabel(b.station.brand);
  const nameA = normalizeChargingStationLabel(a.station.name);
  const nameB = normalizeChargingStationLabel(b.station.name);

  const sameBrand = brandA.length > 0 && brandA === brandB;
  const sameName = nameA.length > 0 && nameA === nameB;

  if (distance <= DEDUPE_SAME_BRAND_DISTANCE_M && sameBrand && sameName) {
    return true;
  }

  if (distance <= DEDUPE_SAME_STATION_DISTANCE_M && sameBrand && sameName) {
    return true;
  }

  const areaAndPoint =
    (a.features.isAreaGeometry && !b.features.isAreaGeometry) ||
    (!a.features.isAreaGeometry && b.features.isAreaGeometry);

  if (
    areaAndPoint &&
    distance <= DEDUPE_CONTAINED_NODE_DISTANCE_M &&
    (sameBrand || sameName) &&
    (a.features.insideGeometry || b.features.insideGeometry)
  ) {
    return true;
  }

  return false;
}

export function dedupeChargingStationCandidates(
  candidates: ChargingStationScoredCandidate[],
): { candidates: ChargingStationScoredCandidate[]; mergedCount: number } {
  const { candidates: identityDeduped, mergedCount: identityMerged } =
    dedupeChargingStationCandidatesByOsmIdentity(candidates);

  const groups: ChargingStationScoredCandidate[][] = [];

  for (const candidate of identityDeduped) {
    let merged = false;
    for (const group of groups) {
      if (group.some((existing) => shouldMergeCandidates(existing, candidate))) {
        group.push(candidate);
        merged = true;
        break;
      }
    }
    if (!merged) {
      groups.push([candidate]);
    }
  }

  const deduped = groups.map((group, index) => {
    const representative = group.reduce((best, current) => pickRepresentative(best, current));
    return {
      ...representative,
      dedupeGroupId: `group-${index + 1}`,
    };
  });

  return {
    candidates: deduped,
    mergedCount: identityMerged + (identityDeduped.length - deduped.length),
  };
}
