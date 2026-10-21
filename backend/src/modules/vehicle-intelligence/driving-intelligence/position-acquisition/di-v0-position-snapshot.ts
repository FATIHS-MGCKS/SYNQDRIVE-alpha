import { createHash } from 'crypto';
import type { TelemetrySourceFamily } from '../core/types';
import type {
  DiV0AcquiredPositionBucket,
  DiV0PositionSnapshotIdentity,
  DiV0RejectedProviderRow,
  DiV0ValidatedPositionWindow,
} from './di-v0-position-acquisition.types';
import {
  DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1,
  DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1,
  DI_V0_POSITION_QUERY_SPEC_V0_1,
} from './di-v0-position-acquisition.versions';

/** Locale-independent ECMAScript Number→String; normalizes -0. */
export function canonicalNumber(value: number): string {
  if (Object.is(value, -0)) return '0';
  return String(value);
}

export interface DiV0PositionSnapshotMaterial {
  dimoTokenId: number;
  vehicleId: string;
  window: DiV0ValidatedPositionWindow;
  sourceFamily: TelemetrySourceFamily;
  sourceFamilyPolicyVersion: string;
  providerSignalsNull: boolean;
  buckets: DiV0AcquiredPositionBucket[];
  /** Per-bucket sorted evidence keys of conflicting duplicate rows. */
  conflictKeysByLabel: ReadonlyMap<string, string[]>;
  rejectedProviderRows: DiV0RejectedProviderRow[];
}

/**
 * Canonical, newline-delimited serialization. Each line is a JSON array (no object keys),
 * buckets follow grid order, rejected rows are sorted, and acquisition wall-clock time,
 * organization, trip, and credentials are excluded.
 */
export function serializeDiV0PositionSnapshot(material: DiV0PositionSnapshotMaterial): string {
  const spec = DI_V0_POSITION_QUERY_SPEC_V0_1;
  const lines: string[] = [
    DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1,
    JSON.stringify(['adapter', DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1]),
    JSON.stringify([
      'query',
      spec.id,
      spec.provider,
      spec.queryFamily,
      spec.signal,
      spec.interval,
      spec.coordinateAggregation,
      spec.gridBoundary,
    ]),
    JSON.stringify(['subject', spec.provider, String(material.dimoTokenId), material.vehicleId]),
    JSON.stringify(['window', material.window.fromUtc, material.window.toUtc]),
    JSON.stringify(['sourceFamily', material.sourceFamily, material.sourceFamilyPolicyVersion]),
    JSON.stringify(['providerSignalsNull', material.providerSignalsNull]),
  ];
  for (const bucket of material.buckets) {
    const obs = bucket.observation;
    lines.push(
      JSON.stringify([
        'b',
        bucket.bucketLabel,
        bucket.availability,
        bucket.coordinateStatus,
        obs.latitude == null ? null : canonicalNumber(obs.latitude),
        obs.longitude == null ? null : canonicalNumber(obs.longitude),
        bucket.providerRowCount,
        material.conflictKeysByLabel.get(bucket.bucketLabel) ?? [],
      ]),
    );
  }
  const rejected = material.rejectedProviderRows
    .map((row) => JSON.stringify(['r', row.reason, row.rawLabel]))
    .sort();
  lines.push(...rejected);
  return lines.join('\n');
}

export function computeDiV0PositionSnapshotIdentity(
  material: DiV0PositionSnapshotMaterial,
): DiV0PositionSnapshotIdentity {
  const digest = createHash('sha256').update(serializeDiV0PositionSnapshot(material), 'utf8').digest('hex');
  return {
    version: DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1,
    algorithm: 'sha256',
    digest,
    inputEvidenceVersion: `${DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1}:sha256:${digest}`,
  };
}
