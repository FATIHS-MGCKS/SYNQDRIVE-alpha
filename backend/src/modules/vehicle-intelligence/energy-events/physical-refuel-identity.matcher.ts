/**
 * G1.2 physical-refuel identity matcher — forensic / design prototype.
 * Tri-state, symmetric, fail-closed. No DB writes.
 */
import {
  KS_MX_2024_SEPT04_EVENT_A,
  KS_MX_2024_SEPT04_EVENT_B,
} from '@modules/dimo/fixtures/ks-mx-2024-sept04-refuel.fixture';

export type PhysicalRefuelIdentityClassification =
  | 'SAME_PHYSICAL_REFUEL'
  | 'DISTINCT_PHYSICAL_REFUEL'
  | 'INSUFFICIENT_EVIDENCE';

export interface RefuelRowForMatcher {
  id: string;
  vehicleId: string;
  kind: 'REFUEL';
  startTime: string;
  endTime: string;
  fuelStartLiters?: number | null;
  fuelEndLiters?: number | null;
  fuelStartPercent?: number | null;
  fuelEndPercent?: number | null;
  fuelDeltaLiters?: number | null;
  fuelDeltaPercent?: number | null;
  durationSeconds?: number | null;
  odometerEndKm?: number | null;
  dimoSegmentId: string;
}

export interface PhysicalRefuelIdentityResult {
  classification: PhysicalRefuelIdentityClassification;
  reason: string;
  /** Present only when classification is SAME_PHYSICAL_REFUEL. */
  canonicalId?: string;
}

export interface PhysicalRefuelMatcherTolerances {
  fuelLiters: number;
  fuelPercent: number;
  endTimeSec: number;
  odometerKm: number;
  windowOverlapMinSec: number;
}

export const DEFAULT_PHYSICAL_REFUEL_MATCHER_TOLERANCES: PhysicalRefuelMatcherTolerances = {
  fuelLiters: 0.5,
  fuelPercent: 2.0,
  endTimeSec: 60,
  odometerKm: 1,
  windowOverlapMinSec: 60,
};

function windowOverlapSec(a: RefuelRowForMatcher, b: RefuelRowForMatcher): number {
  const start = Math.max(new Date(a.startTime).getTime(), new Date(b.startTime).getTime());
  const end = Math.min(new Date(a.endTime).getTime(), new Date(b.endTime).getTime());
  return Math.max(0, (end - start) / 1000);
}

function isContained(inner: RefuelRowForMatcher, outer: RefuelRowForMatcher): boolean {
  return (
    new Date(inner.startTime) >= new Date(outer.startTime) &&
    new Date(inner.endTime) <= new Date(outer.endTime)
  );
}

function isSuffixCompatibleTransition(
  superset: RefuelRowForMatcher,
  subset: RefuelRowForMatcher,
  tol: PhysicalRefuelMatcherTolerances,
): boolean {
  const aStart = superset.fuelStartLiters;
  const aEnd = superset.fuelEndLiters;
  const bStart = subset.fuelStartLiters;
  const bEnd = subset.fuelEndLiters;
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false;
  if (Math.abs(aEnd - bEnd) > tol.fuelLiters) return false;
  if (bStart < aStart - tol.fuelLiters) return false;
  if (bEnd > aEnd + tol.fuelLiters) return false;

  const aStartPct = superset.fuelStartPercent;
  const aEndPct = superset.fuelEndPercent;
  const bStartPct = subset.fuelStartPercent;
  const bEndPct = subset.fuelEndPercent;
  if (aStartPct != null && aEndPct != null && bStartPct != null && bEndPct != null) {
    if (Math.abs(aEndPct - bEndPct) > tol.fuelPercent) return false;
    if (bStartPct < aStartPct - tol.fuelPercent) return false;
    if (bEndPct > aEndPct + tol.fuelPercent) return false;
  }
  return true;
}

function hasTerminalFuelEvidence(row: RefuelRowForMatcher): boolean {
  return row.fuelEndLiters != null;
}

function hasTransitionEvidence(row: RefuelRowForMatcher): boolean {
  return row.fuelStartLiters != null && row.fuelEndLiters != null;
}

function literTransitionSpan(row: RefuelRowForMatcher): number | null {
  if (row.fuelStartLiters != null && row.fuelEndLiters != null) {
    return row.fuelEndLiters - row.fuelStartLiters;
  }
  if (row.fuelDeltaLiters != null && row.fuelDeltaLiters > 0) return row.fuelDeltaLiters;
  return null;
}

function percentTransitionSpan(row: RefuelRowForMatcher): number | null {
  if (row.fuelStartPercent != null && row.fuelEndPercent != null) {
    return row.fuelEndPercent - row.fuelStartPercent;
  }
  if (row.fuelDeltaPercent != null && row.fuelDeltaPercent > 0) return row.fuelDeltaPercent;
  return null;
}

function transitionEvidenceRank(row: RefuelRowForMatcher): number {
  let rank = 0;
  if (hasTransitionEvidence(row)) rank += 2;
  if (hasTerminalFuelEvidence(row)) rank += 1;
  if (row.fuelStartPercent != null && row.fuelEndPercent != null) rank += 1;
  return rank;
}

/**
 * Dimensionally-safe canonical comparison — never mixes liters and percentages.
 * Returns negative if `a` is preferred, positive if `b` is preferred, 0 if tied.
 * Symmetric: compareCanonicalRefuelCandidates(a,b) === -compareCanonicalRefuelCandidates(b,a)
 */
export function compareCanonicalRefuelCandidates(
  a: RefuelRowForMatcher,
  b: RefuelRowForMatcher,
  tol: PhysicalRefuelMatcherTolerances = DEFAULT_PHYSICAL_REFUEL_MATCHER_TOLERANCES,
): number {
  const aSuperset = isSuffixCompatibleTransition(a, b, tol);
  const bSuperset = isSuffixCompatibleTransition(b, a, tol);
  if (aSuperset && !bSuperset) return -1;
  if (bSuperset && !aSuperset) return 1;

  const rankA = transitionEvidenceRank(a);
  const rankB = transitionEvidenceRank(b);
  if (rankA !== rankB) return rankB > rankA ? 1 : -1;

  const literA = literTransitionSpan(a);
  const literB = literTransitionSpan(b);
  if (literA != null && literB != null) {
    if (literA > literB + tol.fuelLiters * 0.01) return -1;
    if (literB > literA + tol.fuelLiters * 0.01) return 1;
  } else if (literA != null && literB == null) {
    return -1;
  } else if (literB != null && literA == null) {
    return 1;
  }

  if (literA == null && literB == null) {
    const pctA = percentTransitionSpan(a);
    const pctB = percentTransitionSpan(b);
    if (pctA != null && pctB != null) {
      if (pctA > pctB + tol.fuelPercent * 0.01) return -1;
      if (pctB > pctA + tol.fuelPercent * 0.01) return 1;
    } else if (pctA != null && pctB == null) {
      return -1;
    } else if (pctB != null && pctA == null) {
      return 1;
    }
  }

  const aContainsB = isContained(b, a);
  const bContainsA = isContained(a, b);
  if (aContainsB && !bContainsA) return -1;
  if (bContainsA && !aContainsB) return 1;

  const durA = a.durationSeconds ?? 0;
  const durB = b.durationSeconds ?? 0;
  if (durA !== durB) return durA > durB ? -1 : 1;

  const idCmp = a.id.localeCompare(b.id);
  return idCmp === 0 ? 0 : idCmp < 0 ? -1 : 1;
}

/** @deprecated G1.2b — use compareCanonicalRefuelCandidates; never mix liters and percentages. */
export function transitionCompletenessScore(row: RefuelRowForMatcher): number {
  const liter = literTransitionSpan(row);
  return liter ?? percentTransitionSpan(row) ?? 0;
}

/**
 * Deterministic canonical choice for a SAME_PHYSICAL_REFUEL pair.
 * Symmetric: chooseCanonicalRefuel(a,b).id === chooseCanonicalRefuel(b,a).id
 */
export function chooseCanonicalRefuel(
  a: RefuelRowForMatcher,
  b: RefuelRowForMatcher,
  tol: PhysicalRefuelMatcherTolerances = DEFAULT_PHYSICAL_REFUEL_MATCHER_TOLERANCES,
): string {
  const cmp = compareCanonicalRefuelCandidates(a, b, tol);
  if (cmp < 0) return a.id;
  if (cmp > 0) return b.id;
  return a.id.localeCompare(b.id) <= 0 ? a.id : b.id;
}

export function classifyPhysicalRefuelSibling(
  a: RefuelRowForMatcher,
  b: RefuelRowForMatcher,
  tol: PhysicalRefuelMatcherTolerances = DEFAULT_PHYSICAL_REFUEL_MATCHER_TOLERANCES,
): PhysicalRefuelIdentityResult {
  if (a.vehicleId !== b.vehicleId) {
    return { classification: 'DISTINCT_PHYSICAL_REFUEL', reason: 'different_vehicle' };
  }
  if (a.kind !== 'REFUEL' || b.kind !== 'REFUEL') {
    return { classification: 'DISTINCT_PHYSICAL_REFUEL', reason: 'not_refuel' };
  }
  if (a.id === b.id) {
    return { classification: 'SAME_PHYSICAL_REFUEL', reason: 'same_row', canonicalId: a.id };
  }

  const endDelta =
    Math.abs(new Date(a.endTime).getTime() - new Date(b.endTime).getTime()) / 1000;
  if (endDelta > tol.endTimeSec) {
    return { classification: 'DISTINCT_PHYSICAL_REFUEL', reason: 'end_time_mismatch' };
  }

  const fuelEndA = a.fuelEndLiters;
  const fuelEndB = b.fuelEndLiters;
  if (fuelEndA != null && fuelEndB != null && Math.abs(fuelEndA - fuelEndB) > tol.fuelLiters) {
    return { classification: 'DISTINCT_PHYSICAL_REFUEL', reason: 'terminal_fuel_liters_mismatch' };
  }
  if (
    a.fuelEndPercent != null &&
    b.fuelEndPercent != null &&
    Math.abs(a.fuelEndPercent - b.fuelEndPercent) > tol.fuelPercent
  ) {
    return { classification: 'DISTINCT_PHYSICAL_REFUEL', reason: 'terminal_fuel_percent_mismatch' };
  }

  const odoA = a.odometerEndKm;
  const odoB = b.odometerEndKm;
  if (odoA != null && odoB != null && Math.abs(odoA - odoB) > tol.odometerKm) {
    return { classification: 'DISTINCT_PHYSICAL_REFUEL', reason: 'odometer_mismatch' };
  }

  const overlap = windowOverlapSec(a, b);
  const contained = isContained(b, a) || isContained(a, b);
  const suffixCompatible =
    hasTransitionEvidence(a) &&
    hasTransitionEvidence(b) &&
    (isSuffixCompatibleTransition(a, b, tol) || isSuffixCompatibleTransition(b, a, tol));

  if (!hasTerminalFuelEvidence(a) || !hasTerminalFuelEvidence(b)) {
    if (!suffixCompatible && !contained) {
      return {
        classification: 'INSUFFICIENT_EVIDENCE',
        reason: 'missing_terminal_fuel_without_strong_transition',
      };
    }
    if (!suffixCompatible) {
      return {
        classification: 'INSUFFICIENT_EVIDENCE',
        reason: 'missing_terminal_fuel_endpoints',
      };
    }
  }

  if (!suffixCompatible && !contained) {
    if (overlap < tol.windowOverlapMinSec) {
      return { classification: 'DISTINCT_PHYSICAL_REFUEL', reason: 'no_window_overlap' };
    }
    return { classification: 'DISTINCT_PHYSICAL_REFUEL', reason: 'transition_incompatible' };
  }

  if (!suffixCompatible && contained && (!hasTransitionEvidence(a) || !hasTransitionEvidence(b))) {
    return {
      classification: 'INSUFFICIENT_EVIDENCE',
      reason: 'contained_windows_missing_transition_endpoints',
    };
  }

  const canonicalId = chooseCanonicalRefuel(a, b, tol);
  return {
    classification: 'SAME_PHYSICAL_REFUEL',
    reason: suffixCompatible ? 'suffix_compatible_transition' : 'nested_detection_windows',
    canonicalId,
  };
}

/** @deprecated Use classifyPhysicalRefuelSibling — kept for transitional dry-run callers. */
export function evaluatePhysicalRefuelSibling(
  a: RefuelRowForMatcher,
  b: RefuelRowForMatcher,
): { match: boolean; reason: string; canonicalPrefer?: 'A' | 'B' } {
  const result = classifyPhysicalRefuelSibling(a, b);
  if (result.classification !== 'SAME_PHYSICAL_REFUEL') {
    return { match: false, reason: result.reason };
  }
  const canonicalPrefer = result.canonicalId === a.id ? 'A' : 'B';
  return { match: true, reason: result.reason, canonicalPrefer };
}

/** Production REFUEL rows (read-only export) for calibration dry-runs. */
export const HISTORICAL_REFUEL_CALIBRATION_ROWS: RefuelRowForMatcher[] = [
  {
    id: KS_MX_2024_SEPT04_EVENT_A.id,
    vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
    kind: 'REFUEL',
    startTime: KS_MX_2024_SEPT04_EVENT_A.startTime,
    endTime: KS_MX_2024_SEPT04_EVENT_A.endTime,
    fuelStartLiters: KS_MX_2024_SEPT04_EVENT_A.fuelStartLiters,
    fuelEndLiters: KS_MX_2024_SEPT04_EVENT_A.fuelEndLiters,
    fuelStartPercent: KS_MX_2024_SEPT04_EVENT_A.fuelStartPercent,
    fuelEndPercent: KS_MX_2024_SEPT04_EVENT_A.fuelEndPercent,
    fuelDeltaLiters: KS_MX_2024_SEPT04_EVENT_A.fuelDeltaLiters,
    fuelDeltaPercent: KS_MX_2024_SEPT04_EVENT_A.fuelDeltaPercent,
    durationSeconds: KS_MX_2024_SEPT04_EVENT_A.durationSeconds,
    odometerEndKm: KS_MX_2024_SEPT04_EVENT_A.odometerEndKm,
    dimoSegmentId: KS_MX_2024_SEPT04_EVENT_A.dimoSegmentId,
  },
  {
    id: KS_MX_2024_SEPT04_EVENT_B.id,
    vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
    kind: 'REFUEL',
    startTime: KS_MX_2024_SEPT04_EVENT_B.startTime,
    endTime: KS_MX_2024_SEPT04_EVENT_B.endTime,
    fuelStartLiters: KS_MX_2024_SEPT04_EVENT_B.fuelStartLiters,
    fuelEndLiters: KS_MX_2024_SEPT04_EVENT_B.fuelEndLiters,
    fuelStartPercent: KS_MX_2024_SEPT04_EVENT_B.fuelStartPercent,
    fuelEndPercent: KS_MX_2024_SEPT04_EVENT_B.fuelEndPercent,
    fuelDeltaLiters: KS_MX_2024_SEPT04_EVENT_B.fuelDeltaLiters,
    fuelDeltaPercent: KS_MX_2024_SEPT04_EVENT_B.fuelDeltaPercent,
    durationSeconds: KS_MX_2024_SEPT04_EVENT_B.durationSeconds,
    odometerEndKm: KS_MX_2024_SEPT04_EVENT_B.odometerEndKm,
    dimoSegmentId: KS_MX_2024_SEPT04_EVENT_B.dimoSegmentId,
  },
  {
    id: '49cb0be0-f321-4082-a6ed-9f8866529cff',
    vehicleId: '192922-vehicle',
    kind: 'REFUEL',
    startTime: '2026-08-29T17:45:02.000Z',
    endTime: '2026-08-29T18:01:03.000Z',
    fuelDeltaLiters: 23,
    fuelDeltaPercent: 41.96,
    durationSeconds: 961,
    dimoSegmentId: 'dimo-refuel-192922-1788025502000',
  },
  {
    id: '6c0002ea-0cc9-444a-9740-88c0fa7b2b47',
    vehicleId: '192922-vehicle',
    kind: 'REFUEL',
    startTime: '2026-08-29T17:51:19.707Z',
    endTime: '2026-08-29T18:01:03.000Z',
    fuelDeltaLiters: 3,
    fuelDeltaPercent: 3.53,
    durationSeconds: 583,
    dimoSegmentId: 'dimo-refuel-192922-1788025879707',
  },
  {
    id: 'fa9ed4d8-b4c3-4d17-aced-0d87fe6e92a1',
    vehicleId: 'other',
    kind: 'REFUEL',
    startTime: '2026-09-03T15:17:32.000Z',
    endTime: '2026-09-03T15:25:28.000Z',
    fuelDeltaLiters: 19,
    durationSeconds: 476,
    dimoSegmentId: 'dimo-refuel-192922-1788448652000',
  },
  {
    id: '5cd2f6b1-ba7c-47ea-a07f-7db0337bc5ac',
    vehicleId: 'other',
    kind: 'REFUEL',
    startTime: '2026-09-02T17:42:56.000Z',
    endTime: '2026-09-02T17:48:54.000Z',
    fuelDeltaLiters: 16,
    durationSeconds: 358,
    dimoSegmentId: 'dimo-refuel-192922-1788370976000',
  },
];
