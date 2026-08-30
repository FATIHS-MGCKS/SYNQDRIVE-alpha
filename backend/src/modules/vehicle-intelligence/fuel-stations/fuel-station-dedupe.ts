import {
  DEDUPE_CONTAINED_NODE_DISTANCE_M,
  DEDUPE_SAME_BRAND_DISTANCE_M,
  DEDUPE_SAME_STATION_DISTANCE_M,
} from './fuel-station-location.constants';
import { normalizeFuelStationLabel } from './fuel-station-address.util';
import type { FuelStationScoredCandidate } from './fuel-station-location.types';

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusM = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(a));
}

function shouldMergeCandidates(a: FuelStationScoredCandidate, b: FuelStationScoredCandidate): boolean {
  const distance = haversineMeters(
    a.station.latitude,
    a.station.longitude,
    b.station.latitude,
    b.station.longitude,
  );

  const brandA = normalizeFuelStationLabel(a.station.brand);
  const brandB = normalizeFuelStationLabel(b.station.brand);
  const nameA = normalizeFuelStationLabel(a.station.name);
  const nameB = normalizeFuelStationLabel(b.station.name);

  const sameBrand = brandA.length > 0 && brandA === brandB;
  const sameName = nameA.length > 0 && nameA === nameB;

  if (distance <= DEDUPE_SAME_BRAND_DISTANCE_M && sameBrand) {
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

function pickRepresentative(
  a: FuelStationScoredCandidate,
  b: FuelStationScoredCandidate,
): FuelStationScoredCandidate {
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

export function dedupeFuelStationCandidates(
  candidates: FuelStationScoredCandidate[],
): { candidates: FuelStationScoredCandidate[]; mergedCount: number } {
  const groups: FuelStationScoredCandidate[][] = [];

  for (const candidate of candidates) {
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
    mergedCount: candidates.length - deduped.length,
  };
}
