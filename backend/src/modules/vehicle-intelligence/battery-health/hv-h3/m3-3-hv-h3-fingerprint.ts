import { createHash } from 'node:crypto';
import { M3_3_HV_H3_ESTIMATOR_VERSION } from './m3-3-hv-h3.constants';

export interface HvH3SeriesPartitionIdentity {
  organizationId: string;
  vehicleId: string;
  batteryScope: string;
  lifecycleSegmentId: string;
  method: string;
  methodRole: string;
  valueSemantic: string;
  unit: string;
  modelVersion: number | null;
  provider: string | null;
}

export function buildM3_3HvH3SeriesPartitionKey(identity: HvH3SeriesPartitionIdentity): string {
  return [
    identity.organizationId,
    identity.vehicleId,
    identity.batteryScope,
    identity.lifecycleSegmentId,
    identity.method,
    identity.methodRole,
    identity.valueSemantic,
    identity.unit,
    identity.modelVersion == null ? 'none' : String(identity.modelVersion),
    identity.provider ?? 'none',
  ].join('|');
}

export function computeM3_3HvH3TrendPointFingerprint(input: {
  seriesPartitionKey: string;
  sessionId: string | null;
  observedAt: string;
  numericValue: number;
  sourceCandidateFingerprints: string[];
}): string {
  const canonical = [
    input.seriesPartitionKey,
    input.sessionId ?? 'none',
    input.observedAt,
    canonicalNumber(input.numericValue),
    [...input.sourceCandidateFingerprints].sort().join(','),
  ].join('|');
  return sha256(canonical);
}

export function computeM3_3HvH3SeriesFingerprint(input: {
  partition: HvH3SeriesPartitionIdentity;
  orderedPointFingerprints: string[];
}): string {
  const canonical = [
    buildM3_3HvH3SeriesPartitionKey(input.partition),
    M3_3_HV_H3_ESTIMATOR_VERSION,
    [...input.orderedPointFingerprints].sort().join(','),
  ].join('|');
  return sha256(canonical);
}

function canonicalNumber(n: number): string {
  return Number(n.toFixed(12)).toString();
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function buildM3_3HvH3TrendPointId(pointFingerprint: string): string {
  return pointFingerprint.slice(0, 32);
}
