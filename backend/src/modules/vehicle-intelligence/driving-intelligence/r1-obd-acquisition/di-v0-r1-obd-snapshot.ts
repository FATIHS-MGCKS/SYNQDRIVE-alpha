import { createHash } from 'crypto';
import type { TelemetrySourceFamily } from '../core/types';
import type { DiV0ValidatedPositionWindow } from '../position-acquisition/di-v0-position-acquisition.types';
import { canonicalNumber } from '../position-acquisition/di-v0-position-snapshot';
import type { DiV0R1ObdAcquiredBucket, DiV0R1ObdSnapshotIdentity } from './di-v0-r1-obd-acquisition.types';
import {
  DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_3,
  DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3,
  DI_V0_R1_OBD_QUERY_SPEC_V0_3,
} from './di-v0-r1-obd-acquisition.versions';

export interface DiV0R1ObdSnapshotMaterial {
  dimoTokenId: number;
  vehicleId: string;
  window: DiV0ValidatedPositionWindow;
  sourceFamily: TelemetrySourceFamily;
  sourceFamilyPolicyVersion: string;
  buckets: DiV0R1ObdAcquiredBucket[];
}

function serializeSignalValues(bucket: DiV0R1ObdAcquiredBucket): unknown[] {
  return bucket.signals.map((s) => [
    s.signal,
    s.availability,
    s.value == null ? null : canonicalNumber(s.value),
    s.unit,
    s.conflictingValues == null
      ? null
      : s.conflictingValues.map((v) => (v == null ? null : canonicalNumber(v))),
  ]);
}

export function serializeDiV0R1ObdSnapshot(material: DiV0R1ObdSnapshotMaterial): string {
  const spec = DI_V0_R1_OBD_QUERY_SPEC_V0_3;
  const lines: string[] = [
    DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3,
    JSON.stringify(['adapter', DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_3]),
    JSON.stringify([
      'query',
      spec.id,
      spec.provider,
      spec.queryFamily,
      spec.interval,
      spec.gridBoundary,
      spec.temporalSemantics,
      spec.fieldAuthoritySource,
      spec.signals.map((s) => [
        s.id,
        s.unit,
        s.providerDocumentedUnit,
        s.valueScale,
        s.aggregation,
        s.fieldAuthority,
      ]),
    ]),
    JSON.stringify(['subject', spec.provider, String(material.dimoTokenId), material.vehicleId]),
    JSON.stringify(['window', material.window.fromUtc, material.window.toUtc]),
    JSON.stringify(['sourceFamily', material.sourceFamily, material.sourceFamilyPolicyVersion]),
    JSON.stringify(['temporalSemantics', 'INTERVAL_ONLY']),
    JSON.stringify(['fixedTimeCorrection', false]),
  ];
  for (const bucket of material.buckets) {
    lines.push(
      JSON.stringify([
        'b',
        bucket.bucketLabel,
        bucket.rowAvailability,
        bucket.providerRowCount,
        serializeSignalValues(bucket),
        bucket.qualityFlags,
      ]),
    );
  }
  return lines.join('\n');
}

export function computeDiV0R1ObdSnapshotIdentity(material: DiV0R1ObdSnapshotMaterial): DiV0R1ObdSnapshotIdentity {
  const digest = createHash('sha256').update(serializeDiV0R1ObdSnapshot(material), 'utf8').digest('hex');
  return {
    version: DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3,
    algorithm: 'sha256',
    digest,
    inputEvidenceVersion: `${DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3}:sha256:${digest}`,
  };
}
