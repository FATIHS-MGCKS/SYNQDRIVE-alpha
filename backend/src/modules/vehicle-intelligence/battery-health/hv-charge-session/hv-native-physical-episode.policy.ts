import {
  ERD_PHYSICAL_MATCH_RESULT,
  type ErdPhysicalMatchResult,
  matchErdPhysicalEpisode,
} from './erd-physical-episode-matcher';

export interface HvNativeChargeSessionEpisodeSide {
  startAt: Date;
  endAt: Date | null;
  startSocPercent: number | null;
  endSocPercent: number | null;
  startEnergyKwh: number | null;
  endEnergyKwh: number | null;
  isOngoing: boolean;
}

function socMinMax(
  start: number | null,
  end: number | null,
): { min: number | null; max: number | null } {
  if (start == null && end == null) return { min: null, max: null };
  const values = [start, end].filter((v): v is number => v != null);
  if (values.length === 0) return { min: null, max: null };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function energyMinMax(
  start: number | null,
  end: number | null,
): { min: number | null; max: number | null } {
  return socMinMax(start, end);
}

function sideAsFallback(side: HvNativeChargeSessionEpisodeSide) {
  return {
    startAt: side.startAt,
    endAt: side.endAt,
    startSocPercent: side.startSocPercent,
    endSocPercent: side.endSocPercent,
    startEnergyKwh: side.startEnergyKwh,
    endEnergyKwh: side.endEnergyKwh,
    energyAddedKwh: null,
    isOngoing: side.isOngoing,
  };
}

function sideAsNativeExtrema(side: HvNativeChargeSessionEpisodeSide) {
  const soc = socMinMax(side.startSocPercent, side.endSocPercent);
  const energy = energyMinMax(side.startEnergyKwh, side.endEnergyKwh);
  return {
    startAt: side.startAt,
    endAt: side.endAt,
    socMin: soc.min,
    socMax: soc.max,
    energyMin: energy.min,
    energyMax: energy.max,
    addedEnergyDelta: null,
    ongoing: side.isOngoing,
  };
}

/**
 * Native DIMO recharge segment ↔ native segment physical episode match
 * (reuses ERD E3 temporal + SOC/energy compatibility semantics).
 */
export function matchNativeHvChargeSessionPhysicalEpisode(
  a: HvNativeChargeSessionEpisodeSide,
  b: HvNativeChargeSessionEpisodeSide,
  evaluatedAt: Date,
): { result: ErdPhysicalMatchResult } {
  const forward = matchErdPhysicalEpisode({
    vehicleId: 'native-native',
    fallback: sideAsFallback(a),
    native: sideAsNativeExtrema(b),
    evaluatedAt,
  });
  const reverse = matchErdPhysicalEpisode({
    vehicleId: 'native-native',
    fallback: sideAsFallback(b),
    native: sideAsNativeExtrema(a),
    evaluatedAt,
  });

  if (
    forward.result === ERD_PHYSICAL_MATCH_RESULT.DIFFERENT &&
    reverse.result === ERD_PHYSICAL_MATCH_RESULT.DIFFERENT
  ) {
    return { result: ERD_PHYSICAL_MATCH_RESULT.DIFFERENT };
  }
  if (
    forward.result === ERD_PHYSICAL_MATCH_RESULT.SAME ||
    reverse.result === ERD_PHYSICAL_MATCH_RESULT.SAME
  ) {
    return { result: ERD_PHYSICAL_MATCH_RESULT.SAME };
  }
  return { result: ERD_PHYSICAL_MATCH_RESULT.AMBIGUOUS };
}

export function pickCanonicalNativeEpisodeSession<T extends { sessionId: string }>(
  cluster: T[],
  score: (session: T) => number,
): T {
  return cluster.reduce((best, current) =>
    score(current) > score(best) ? current : best,
  );
}
