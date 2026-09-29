import { gunzipSync } from 'zlib';
import { DI_V0_S4_EVIDENCE_CONTAINER_VERSION, DI_V0_S4_LIMITS } from '../s4a-foundation/di-v0-s4a-contract';
import { buildDiV0S4EvidenceSnapshotHash, type DiV0S4EvidenceChannelManifestEntry } from '../s4a-foundation/di-v0-s4a-identity';
import {
  parseDiV0S4EvidenceContainer,
  type DiV0S4ParsedEvidenceContainer,
} from '../s4a-foundation/di-v0-s4a-evidence-container-parse';

export type DiV0S4dVerifiedSnapshotFailureCode =
  | 'SNAPSHOT_HASH_MISMATCH'
  | 'SNAPSHOT_INVALID'
  | 'SNAPSHOT_SCOPE_INVALID'
  | 'SNAPSHOT_NOT_FOUND';

export type DiV0S4dVerifiedSnapshotResult =
  | { ok: true; parsed: DiV0S4ParsedEvidenceContainer }
  | { ok: false; code: DiV0S4dVerifiedSnapshotFailureCode; detail?: string };

export interface DiV0S4dSnapshotScopeExpectation {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  boundaryFingerprint: string;
  snapshotHash: string;
}

export interface DiV0S4dSnapshotRow {
  organization_id: string;
  vehicle_id: string;
  trip_id: string;
  boundary_fingerprint: string;
  acquisition_window_start: Date;
  acquisition_window_end: Date;
  channel_manifest: unknown;
  payload_gzip: Buffer;
  uncompressed_bytes: number | bigint;
}

/** Bounded gunzip → re-hash → strict container parse (pre-compute verification). */
export function verifyAndParseDiV0PinnedEvidenceSnapshot(
  row: DiV0S4dSnapshotRow,
  scope: DiV0S4dSnapshotScopeExpectation,
): DiV0S4dVerifiedSnapshotResult {
  if (
    row.organization_id !== scope.organizationId ||
    row.vehicle_id !== scope.vehicleId ||
    row.trip_id !== scope.tripId ||
    row.boundary_fingerprint !== scope.boundaryFingerprint
  ) {
    return { ok: false, code: 'SNAPSHOT_SCOPE_INVALID' };
  }
  let container: string;
  try {
    const raw = gunzipSync(Buffer.from(row.payload_gzip), { maxOutputLength: DI_V0_S4_LIMITS.maxUncompressedSnapshotBytes });
    if (raw.length !== Number(row.uncompressed_bytes)) {
      return { ok: false, code: 'SNAPSHOT_INVALID', detail: 'uncompressed size mismatch' };
    }
    container = raw.toString('utf8');
  } catch (error) {
    return { ok: false, code: 'SNAPSHOT_INVALID', detail: error instanceof Error ? error.message : undefined };
  }
  if (buildDiV0S4EvidenceSnapshotHash(container) !== scope.snapshotHash) {
    return { ok: false, code: 'SNAPSHOT_HASH_MISMATCH' };
  }
  const header = `${DI_V0_S4_EVIDENCE_CONTAINER_VERSION}\n${JSON.stringify([
    scope.organizationId,
    scope.vehicleId,
    scope.tripId,
    scope.boundaryFingerprint,
    new Date(row.acquisition_window_start).toISOString(),
    new Date(row.acquisition_window_end).toISOString(),
  ])}\n`;
  if (!container.startsWith(header)) {
    return { ok: false, code: 'SNAPSHOT_INVALID', detail: 'container header scope mismatch' };
  }
  try {
    const manifest = row.channel_manifest as DiV0S4EvidenceChannelManifestEntry[];
    const lines = new Set(container.split('\n'));
    for (const entry of manifest) {
      const line = JSON.stringify([
        entry.channel,
        entry.outcome,
        entry.reasonCode,
        entry.formatVersion,
        entry.payloadSha256,
        entry.attestationRef,
      ]);
      const expectedHash = entry.payloadSha256 == null ? null : `${entry.formatVersion}:sha256:${entry.payloadSha256}`;
      if (!lines.has(line) || expectedHash !== entry.channelEvidenceHash) {
        return { ok: false, code: 'SNAPSHOT_INVALID', detail: `manifest entry ${entry.channel} mismatch` };
      }
    }
    const parsed = parseDiV0S4EvidenceContainer(container);
    if (parsed.snapshotHash !== scope.snapshotHash) {
      return { ok: false, code: 'SNAPSHOT_HASH_MISMATCH' };
    }
    return { ok: true, parsed };
  } catch (error) {
    return { ok: false, code: 'SNAPSHOT_INVALID', detail: error instanceof Error ? error.message : undefined };
  }
}
