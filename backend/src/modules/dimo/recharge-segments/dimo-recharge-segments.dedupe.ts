import type { NormalizedDimoRechargeSegment } from './dimo-recharge-segments.types';

function segmentRichnessScore(segment: NormalizedDimoRechargeSegment): number {
  let score = 0;
  if (!segment.ongoing && segment.endAt) score += 8;
  if (segment.soc.min != null && segment.soc.max != null) score += 2;
  if (segment.currentEnergyKwh.min != null && segment.currentEnergyKwh.max != null) score += 2;
  if (segment.addedEnergyKwh.min != null && segment.addedEnergyKwh.max != null) score += 2;
  if (segment.isCharging.anyTrue != null) score += 1;
  if (segment.cableConnected.anyTrue != null) score += 1;
  if (segment.durationSeconds != null) score += 1;
  if (segment.signalRows.length > 0) score += 1;
  if (segment.startLocation.latitude != null && segment.startLocation.longitude != null) {
    score += 1;
  }
  if (segment.endLocation.latitude != null && segment.endLocation.longitude != null) {
    score += 1;
  }
  if (segment.odometerKm.min != null && segment.odometerKm.max != null) score += 1;
  return score;
}

/** Canonical stable key for deterministic tie-break (E2.1) — not insertion order. */
export function stableDedupeTieBreakKey(segment: NormalizedDimoRechargeSegment): string {
  const signalRows = [...segment.signalRows]
    .map((row) => ({
      n: row.signalName,
      a: row.aggregation,
      v: row.value,
    }))
    .sort((x, y) =>
      `${x.n}\0${x.a}\0${x.v}`.localeCompare(`${y.n}\0${y.a}\0${y.v}`),
    );

  return JSON.stringify({
    fingerprint: segment.fingerprint,
    startAt: segment.startAt,
    endAt: segment.endAt,
    ongoing: segment.ongoing,
    durationSeconds: segment.durationSeconds,
    durationProvenance: segment.durationProvenance,
    providerSegmentId: segment.providerSegmentId,
    soc: segment.soc,
    currentEnergyKwh: segment.currentEnergyKwh,
    addedEnergyKwh: segment.addedEnergyKwh,
    isCharging: segment.isCharging,
    cableConnected: segment.cableConnected,
    odometerKm: segment.odometerKm,
    startLocation: segment.startLocation,
    endLocation: segment.endLocation,
    signalRows,
  });
}

/**
 * Total-order preference: positive => `b` wins over `a`; independent of array order.
 */
export function compareNormalizedRechargeSegmentsForDedupe(
  a: NormalizedDimoRechargeSegment,
  b: NormalizedDimoRechargeSegment,
): number {
  if (a.fingerprint !== b.fingerprint) {
    return a.fingerprint.localeCompare(b.fingerprint);
  }

  if (a.ongoing !== b.ongoing) {
    if (a.ongoing && !b.ongoing) return 1;
    if (!a.ongoing && b.ongoing) return -1;
  }

  const richnessDelta = segmentRichnessScore(b) - segmentRichnessScore(a);
  if (richnessDelta !== 0) return richnessDelta;

  const aProv = a.providerSegmentId ? 1 : 0;
  const bProv = b.providerSegmentId ? 1 : 0;
  if (bProv !== aProv) return bProv - aProv;

  const keyA = stableDedupeTieBreakKey(a);
  const keyB = stableDedupeTieBreakKey(b);
  return keyB.localeCompare(keyA);
}

function pickPreferredSegment(
  a: NormalizedDimoRechargeSegment,
  b: NormalizedDimoRechargeSegment,
): NormalizedDimoRechargeSegment {
  const cmp = compareNormalizedRechargeSegmentsForDedupe(a, b);
  if (cmp > 0) return b;
  if (cmp < 0) return a;
  return a;
}

/** Deterministic multi-window dedupe on canonical ingest fingerprint (E2 / E2.1). */
export function dedupeNormalizedRechargeSegmentsByFingerprint(
  segments: NormalizedDimoRechargeSegment[],
): NormalizedDimoRechargeSegment[] {
  const byFingerprint = new Map<string, NormalizedDimoRechargeSegment>();
  for (const segment of segments) {
    const existing = byFingerprint.get(segment.fingerprint);
    if (!existing) {
      byFingerprint.set(segment.fingerprint, segment);
      continue;
    }
    byFingerprint.set(
      segment.fingerprint,
      pickPreferredSegment(existing, segment),
    );
  }
  return [...byFingerprint.values()].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
}
