import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';
import { sessionsOverlap } from './hv-fallback-charge-session.policy';
import type { HvChargeSessionMetadata, HvChargeSessionRow } from './hv-charge-session.types';
import { HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK } from './hv-charge-session.types';

export const ERD_PHYSICAL_MATCH_RESULT = {
  SAME: 'SAME',
  AMBIGUOUS: 'AMBIGUOUS',
  DIFFERENT: 'DIFFERENT',
} as const;

export type ErdPhysicalMatchResult =
  (typeof ERD_PHYSICAL_MATCH_RESULT)[keyof typeof ERD_PHYSICAL_MATCH_RESULT];

export const ERD_PHYSICAL_MATCHER_VERSION = 'erd-e3-1.0.0';

export const ERD_PHYSICAL_MATCH_TOLERANCE_MS = 15 * 60 * 1000;

export interface ErdPhysicalMatchEvidence {
  temporalOverlap: boolean | null;
  socCompatible: boolean | null;
  energyCompatible: boolean | null;
  lifecycleCompatible: boolean | null;
  contradictory: boolean;
  reasons: string[];
}

export interface ErdPhysicalEpisodeMatchInput {
  vehicleId: string;
  fallback: {
    startAt: Date;
    endAt: Date | null;
    startSocPercent: number | null;
    endSocPercent: number | null;
    startEnergyKwh: number | null;
    endEnergyKwh: number | null;
    energyAddedKwh: number | null;
    isOngoing: boolean;
  };
  native: {
    startAt: Date;
    endAt: Date | null;
    socMin: number | null;
    socMax: number | null;
    energyMin: number | null;
    energyMax: number | null;
    addedEnergyDelta: number | null;
    ongoing: boolean;
  };
  evaluatedAt: Date;
  toleranceMs?: number;
}

function readMeta(metadata: unknown): HvChargeSessionMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;
  return metadata as HvChargeSessionMetadata;
}

function socRangeOverlap(
  fallbackStart: number | null,
  fallbackEnd: number | null,
  nativeMin: number | null,
  nativeMax: number | null,
): boolean | null {
  if (nativeMin == null && nativeMax == null) return null;
  if (fallbackStart == null && fallbackEnd == null) return null;
  const fLow = Math.min(fallbackStart ?? fallbackEnd ?? 0, fallbackEnd ?? fallbackStart ?? 0);
  const fHigh = Math.max(fallbackStart ?? fallbackEnd ?? 0, fallbackEnd ?? fallbackStart ?? 0);
  const nLow = Math.min(nativeMin ?? nativeMax ?? 0, nativeMax ?? nativeMin ?? 0);
  const nHigh = Math.max(nativeMin ?? nativeMax ?? 0, nativeMax ?? nativeMin ?? 0);
  return fHigh >= nLow - 2 && fLow <= nHigh + 2;
}

function socRangeStronglyIncompatible(
  fallbackStart: number | null,
  fallbackEnd: number | null,
  nativeMin: number | null,
  nativeMax: number | null,
): boolean {
  const overlap = socRangeOverlap(fallbackStart, fallbackEnd, nativeMin, nativeMax);
  if (overlap == null) return false;
  return overlap === false;
}

function energyRangeOverlap(
  fallbackStart: number | null,
  fallbackEnd: number | null,
  nativeMin: number | null,
  nativeMax: number | null,
): boolean | null {
  if (nativeMin == null && nativeMax == null) return null;
  if (fallbackStart == null && fallbackEnd == null) return null;
  const fLow = Math.min(fallbackStart ?? fallbackEnd ?? 0, fallbackEnd ?? fallbackStart ?? 0);
  const fHigh = Math.max(fallbackStart ?? fallbackEnd ?? 0, fallbackEnd ?? fallbackStart ?? 0);
  const nLow = Math.min(nativeMin ?? nativeMax ?? 0, nativeMax ?? nativeMin ?? 0);
  const nHigh = Math.max(nativeMin ?? nativeMax ?? 0, nativeMax ?? nativeMin ?? 0);
  return fHigh >= nLow - 1 && fLow <= nHigh + 1;
}

function energyStronglyIncompatible(
  fallbackStart: number | null,
  fallbackEnd: number | null,
  nativeMin: number | null,
  nativeMax: number | null,
): boolean {
  const overlap = energyRangeOverlap(fallbackStart, fallbackEnd, nativeMin, nativeMax);
  if (overlap == null) return false;
  return overlap === false;
}

/**
 * Pure ERD physical episode matcher — native extrema ranges vs fallback temporal SOC/energy.
 */
export function matchErdPhysicalEpisode(
  input: ErdPhysicalEpisodeMatchInput,
): { result: ErdPhysicalMatchResult; evidence: ErdPhysicalMatchEvidence } {
  const toleranceMs = input.toleranceMs ?? ERD_PHYSICAL_MATCH_TOLERANCE_MS;
  const reasons: string[] = [];

  const temporalOverlap = sessionsOverlap(
    input.fallback.startAt,
    input.fallback.endAt,
    input.native.startAt,
    input.native.endAt,
    input.evaluatedAt,
    toleranceMs,
  );

  if (!temporalOverlap) {
    return {
      result: ERD_PHYSICAL_MATCH_RESULT.DIFFERENT,
      evidence: {
        temporalOverlap: false,
        socCompatible: null,
        energyCompatible: null,
        lifecycleCompatible: null,
        contradictory: false,
        reasons: ['temporal_no_overlap'],
      },
    };
  }

  reasons.push('temporal_overlap');

  const socCompatible = socRangeOverlap(
    input.fallback.startSocPercent,
    input.fallback.endSocPercent,
    input.native.socMin,
    input.native.socMax,
  );
  const energyCompatible = energyRangeOverlap(
    input.fallback.startEnergyKwh,
    input.fallback.endEnergyKwh,
    input.native.energyMin,
    input.native.energyMax,
  );

  const socContradiction = socRangeStronglyIncompatible(
    input.fallback.startSocPercent,
    input.fallback.endSocPercent,
    input.native.socMin,
    input.native.socMax,
  );
  const energyContradiction = energyStronglyIncompatible(
    input.fallback.startEnergyKwh,
    input.fallback.endEnergyKwh,
    input.native.energyMin,
    input.native.energyMax,
  );

  if (socContradiction && energyContradiction) {
    return {
      result: ERD_PHYSICAL_MATCH_RESULT.DIFFERENT,
      evidence: {
        temporalOverlap: true,
        socCompatible: false,
        energyCompatible: false,
        lifecycleCompatible: null,
        contradictory: true,
        reasons: [...reasons, 'soc_and_energy_contradiction'],
      },
    };
  }

  if (socContradiction || energyContradiction) {
    return {
      result: ERD_PHYSICAL_MATCH_RESULT.AMBIGUOUS,
      evidence: {
        temporalOverlap: true,
        socCompatible: socCompatible ?? null,
        energyCompatible: energyCompatible ?? null,
        lifecycleCompatible: null,
        contradictory: true,
        reasons: [
          ...reasons,
          socContradiction ? 'soc_contradiction' : 'energy_contradiction',
        ],
      },
    };
  }

  const lifecycleCompatible =
    input.fallback.isOngoing === input.native.ongoing ||
    (!input.fallback.isOngoing && !input.native.ongoing) ||
    input.native.ongoing;

  let supporting = 0;
  if (socCompatible === true) {
    supporting += 1;
    reasons.push('soc_range_compatible');
  }
  if (energyCompatible === true) {
    supporting += 1;
    reasons.push('energy_range_compatible');
  }
  if (lifecycleCompatible) {
    supporting += 1;
    reasons.push('lifecycle_compatible');
  }

  if (supporting >= 2) {
    return {
      result: ERD_PHYSICAL_MATCH_RESULT.SAME,
      evidence: {
        temporalOverlap: true,
        socCompatible,
        energyCompatible,
        lifecycleCompatible,
        contradictory: false,
        reasons,
      },
    };
  }

  if (supporting === 1 && temporalOverlap) {
    return {
      result: ERD_PHYSICAL_MATCH_RESULT.AMBIGUOUS,
      evidence: {
        temporalOverlap: true,
        socCompatible,
        energyCompatible,
        lifecycleCompatible,
        contradictory: false,
        reasons: [...reasons, 'single_dimension_overlap_only'],
      },
    };
  }

  return {
    result: ERD_PHYSICAL_MATCH_RESULT.AMBIGUOUS,
    evidence: {
      temporalOverlap: true,
      socCompatible,
      energyCompatible,
      lifecycleCompatible,
      contradictory: false,
      reasons: [...reasons, 'temporal_only_weak_overlap'],
    },
  };
}

export function nativeSideFromDimoSegment(
  segment: NormalizedDimoRechargeSegment,
): ErdPhysicalEpisodeMatchInput['native'] {
  return {
    startAt: new Date(segment.startAt),
    endAt: segment.endAt ? new Date(segment.endAt) : null,
    socMin: segment.soc.min,
    socMax: segment.soc.max,
    energyMin: segment.currentEnergyKwh.min,
    energyMax: segment.currentEnergyKwh.max,
    addedEnergyDelta: segment.addedEnergyKwh.delta,
    ongoing: segment.ongoing,
  };
}

export function fallbackSideFromRow(
  row: HvChargeSessionRow,
): ErdPhysicalEpisodeMatchInput['fallback'] {
  return {
    startAt: row.startAt,
    endAt: row.endAt,
    startSocPercent: row.startSocPercent,
    endSocPercent: row.endSocPercent,
    startEnergyKwh: row.startEnergyKwh,
    endEnergyKwh: row.endEnergyKwh,
    energyAddedKwh: row.energyAddedKwh,
    isOngoing: row.isOngoing,
  };
}

export function isFallbackRowSuperseded(row: HvChargeSessionRow): boolean {
  const meta = readMeta(row.metadata);
  return Boolean(meta?.supersededBySegmentFingerprint);
}

export function listActiveFallbackSessions(
  rows: HvChargeSessionRow[],
): HvChargeSessionRow[] {
  return rows.filter(
    (row) =>
      row.source === HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK &&
      !isFallbackRowSuperseded(row),
  );
}

export interface ErdFallbackSupersessionDecision {
  action: 'supersede_one' | 'none';
  target: HvChargeSessionRow | null;
  matchResult: ErdPhysicalMatchResult | null;
  evidence: ErdPhysicalMatchEvidence | null;
  evaluatedMatches: Array<{
    row: HvChargeSessionRow;
    result: ErdPhysicalMatchResult;
  }>;
}

export function decideFallbackSupersessionForNative(input: {
  vehicleId: string;
  fallbackSessions: HvChargeSessionRow[];
  native: ErdPhysicalEpisodeMatchInput['native'];
  evaluatedAt: Date;
}): ErdFallbackSupersessionDecision {
  const active = listActiveFallbackSessions(input.fallbackSessions);
  const evaluatedMatches = active.map((row) => {
    const match = matchErdPhysicalEpisode({
      vehicleId: input.vehicleId,
      fallback: fallbackSideFromRow(row),
      native: input.native,
      evaluatedAt: input.evaluatedAt,
    });
    return { row, result: match.result, evidence: match.evidence };
  });

  const sameRows = evaluatedMatches.filter(
    (entry) => entry.result === ERD_PHYSICAL_MATCH_RESULT.SAME,
  );
  const ambiguousRows = evaluatedMatches.filter(
    (entry) => entry.result === ERD_PHYSICAL_MATCH_RESULT.AMBIGUOUS,
  );

  if (sameRows.length === 1 && ambiguousRows.length === 0) {
    const chosen = sameRows[0];
    const full = matchErdPhysicalEpisode({
      vehicleId: input.vehicleId,
      fallback: fallbackSideFromRow(chosen.row),
      native: input.native,
      evaluatedAt: input.evaluatedAt,
    });
    return {
      action: 'supersede_one',
      target: chosen.row,
      matchResult: ERD_PHYSICAL_MATCH_RESULT.SAME,
      evidence: full.evidence,
      evaluatedMatches: evaluatedMatches.map(({ row, result }) => ({ row, result })),
    };
  }

  return {
    action: 'none',
    target: null,
    matchResult:
      sameRows.length > 1
        ? ERD_PHYSICAL_MATCH_RESULT.AMBIGUOUS
        : ambiguousRows.length > 0
          ? ERD_PHYSICAL_MATCH_RESULT.AMBIGUOUS
          : null,
    evidence: null,
    evaluatedMatches: evaluatedMatches.map(({ row, result }) => ({ row, result })),
  };
}
