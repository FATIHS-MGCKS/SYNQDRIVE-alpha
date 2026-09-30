import { createHash } from 'node:crypto';
import type { M3_3HvH2LongitudinalInputCandidateV1 } from './m3-3-hv-h2.types';

export interface HvH2CandidateFingerprintInput {
  organizationId: string;
  vehicleId: string;
  batteryScope: string;
  method: string;
  sourceEntityType: string;
  sourceEntityId: string;
  observedAt: string;
  modelVersion: number;
  valueSemantic: string;
  lifecycleSegmentId: string;
}

export function computeM3_3HvH2CandidateFingerprint(
  input: HvH2CandidateFingerprintInput,
): string {
  const canonical = [
    input.organizationId,
    input.vehicleId,
    input.batteryScope,
    input.method,
    input.sourceEntityType,
    input.sourceEntityId,
    input.observedAt,
    String(input.modelVersion),
    input.valueSemantic,
    input.lifecycleSegmentId,
  ].join('|');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function sortM3_3HvH2Candidates(
  candidates: M3_3HvH2LongitudinalInputCandidateV1[],
): M3_3HvH2LongitudinalInputCandidateV1[] {
  return [...candidates].sort((a, b) => {
    const seg = a.lifecycleSegmentId.localeCompare(b.lifecycleSegmentId);
    if (seg !== 0) return seg;
    const t = a.observedAt.localeCompare(b.observedAt);
    if (t !== 0) return t;
    const m = a.method.localeCompare(b.method);
    if (m !== 0) return m;
    return a.sourceEntityId.localeCompare(b.sourceEntityId);
  });
}

export function dedupeM3_3HvH2CandidatesByFingerprint(
  candidates: M3_3HvH2LongitudinalInputCandidateV1[],
): M3_3HvH2LongitudinalInputCandidateV1[] {
  const seen = new Map<string, M3_3HvH2LongitudinalInputCandidateV1>();
  for (const c of candidates) {
    if (!seen.has(c.candidateFingerprint)) {
      seen.set(c.candidateFingerprint, c);
    }
  }
  return sortM3_3HvH2Candidates([...seen.values()]);
}
