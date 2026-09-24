import type { NormalizedDimoRechargeSegment } from './dimo-recharge-segments.types';

function segmentRichnessScore(segment: NormalizedDimoRechargeSegment): number {
  let score = 0;
  if (segment.providerSegmentId) score += 4;
  if (!segment.ongoing && segment.endAt) score += 8;
  if (segment.soc.min != null && segment.soc.max != null) score += 2;
  if (segment.currentEnergyKwh.min != null && segment.currentEnergyKwh.max != null) score += 2;
  if (segment.addedEnergyKwh.min != null && segment.addedEnergyKwh.max != null) score += 2;
  if (segment.isCharging.anyTrue != null) score += 1;
  if (segment.cableConnected.anyTrue != null) score += 1;
  if (segment.durationSeconds != null) score += 1;
  if (segment.signalRows.length > 0) score += 1;
  return score;
}

function preferSegment(
  current: NormalizedDimoRechargeSegment,
  candidate: NormalizedDimoRechargeSegment,
): NormalizedDimoRechargeSegment {
  const currentScore = segmentRichnessScore(current);
  const candidateScore = segmentRichnessScore(candidate);
  if (candidateScore > currentScore) return candidate;
  if (candidateScore < currentScore) return current;

  if (current.ongoing && !candidate.ongoing) return candidate;
  if (!current.ongoing && candidate.ongoing) return current;

  if (candidate.providerSegmentId && !current.providerSegmentId) return candidate;

  return candidate;
}

/** Deterministic multi-window dedupe on canonical ingest fingerprint (E2). */
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
    byFingerprint.set(segment.fingerprint, preferSegment(existing, segment));
  }
  return [...byFingerprint.values()].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
}
