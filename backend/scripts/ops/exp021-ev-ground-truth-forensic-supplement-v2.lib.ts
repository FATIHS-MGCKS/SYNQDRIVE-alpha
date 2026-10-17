import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseDiV0PositionSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-snapshot-parse';
import {
  DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1,
  DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1,
  DI_V0_POSITION_QUERY_SPEC_V0_1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-acquisition.versions';
import type { DiV0AcquiredPositionBucket, DiV0RejectedProviderRow } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-acquisition.types';
import type { DiV0S4SourceFamily } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-contract';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4d-replay/di-v0-s4d-verified-snapshot';
import { dateToBucketLabel } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import { loadKompaktTachoZeroSeconds } from './exp021-ev-ground-truth-forensic-supplement-v1.lib';

export type ParsedPositionSnapshotExport = {
  adapterVersion: string;
  querySpecification: typeof DI_V0_POSITION_QUERY_SPEC_V0_1;
  queryProvenanceNote: string;
  window: {
    fromUtc: string;
    toUtcExclusive: string;
    fromMs: number;
    toMs: number;
    expectedBucketCount: number;
    gridBoundary: string;
    bucketLabelConvention: string;
  };
  dimoTokenId: number;
  vehicleId: string;
  sourceFamily: string;
  sourceFamilyPolicyVersion: string;
  providerSignalsNull: boolean;
  rejectedProviderRows: DiV0RejectedProviderRow[];
  acquisitionCounters: {
    sumProviderRowCountAllBuckets: number;
    presentBuckets: number;
    rowAbsentBuckets: number;
    signalNullBuckets: number;
    invalidCoordinateBuckets: number;
    duplicateAnomalyBuckets: number;
    conflictingDuplicateBuckets: number;
    rejectedProviderRowCount: number;
  };
  qualityFlags: string[];
  bucketsSummary: Array<{
    bucketLabelUtc: string;
    availability: string;
    coordinateStatus: string;
    providerRowCount: number;
    anomalies: string[];
    provenanceDerivedFrom: string[];
  }>;
  headerLines: { adapter: unknown; query: unknown };
};

export function parsePositionPayloadHeader(payload: string): {
  adapterLine: unknown;
  queryLine: unknown;
} {
  const lines = payload.split('\n').filter((l) => l.length > 0);
  if (lines[0] !== DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1) {
    throw new Error('unexpected position snapshot version');
  }
  return {
    adapterLine: JSON.parse(lines[1]),
    queryLine: JSON.parse(lines[2]),
  };
}

export function loadFullPositionSnapshotExport(
  snapshotRow: {
    organization_id: string;
    vehicle_id: string;
    trip_id: string;
    boundary_fingerprint: string;
    acquisition_window_start: Date;
    acquisition_window_end: Date;
    channel_manifest: unknown;
    payload_gzip: Buffer;
    uncompressed_bytes: number | bigint;
  },
  pinnedSnapshotHash: string,
  sourceFamily: DiV0S4SourceFamily,
): ParsedPositionSnapshotExport {
  const verified = verifyAndParseDiV0PinnedEvidenceSnapshot(snapshotRow, {
    organizationId: snapshotRow.organization_id,
    vehicleId: snapshotRow.vehicle_id,
    tripId: snapshotRow.trip_id,
    boundaryFingerprint: snapshotRow.boundary_fingerprint,
    snapshotHash: pinnedSnapshotHash,
    sourceFamily,
  });
  if (!verified.ok) throw new Error(`snapshot verify failed: ${verified.code}`);
  const payload = verified.parsed.channelPayloads.POSITION;
  if (!payload) throw new Error('POSITION payload missing');
  const material = parseDiV0PositionSnapshot(payload);
  const header = parsePositionPayloadHeader(payload);

  let presentBuckets = 0;
  let rowAbsentBuckets = 0;
  let signalNullBuckets = 0;
  let invalidCoordinateBuckets = 0;
  let duplicateAnomalyBuckets = 0;
  let conflictingDuplicateBuckets = 0;
  let sumProviderRowCount = 0;

  for (const b of material.buckets) {
    sumProviderRowCount += b.providerRowCount;
    if (b.availability === 'ROW_ABSENT') rowAbsentBuckets += 1;
    else if (b.availability === 'SIGNAL_NULL') signalNullBuckets += 1;
    else presentBuckets += 1;
    if (b.anomalies.includes('INVALID_COORDINATE')) invalidCoordinateBuckets += 1;
    if (b.anomalies.includes('DUPLICATE_BUCKET_CONFLICTING')) {
      duplicateAnomalyBuckets += 1;
      conflictingDuplicateBuckets += 1;
    }
  }

  const qualityFlags: string[] = [];
  if (sumProviderRowCount === 0 && material.rejectedProviderRows.length === 0) {
    qualityFlags.push('NO_PROVIDER_ROWS');
  }
  if (material.providerSignalsNull) qualityFlags.push('PROVIDER_SIGNALS_NULL');
  if (material.rejectedProviderRows.length > 0) qualityFlags.push('PROVIDER_ROWS_REJECTED');
  const outsideRejected = material.rejectedProviderRows.filter((r) => r.reason === 'LABEL_OUTSIDE_WINDOW').length;
  if (outsideRejected > 0) qualityFlags.push('ROWS_OUTSIDE_WINDOW');
  if (duplicateAnomalyBuckets > 0) qualityFlags.push('DUPLICATE_BUCKETS_PRESENT');
  if (conflictingDuplicateBuckets > 0) qualityFlags.push('CONFLICTING_DUPLICATE_BUCKETS');
  if (invalidCoordinateBuckets > 0) qualityFlags.push('INVALID_COORDINATES_PRESENT');

  return {
    adapterVersion: DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1,
    querySpecification: DI_V0_POSITION_QUERY_SPEC_V0_1,
    queryProvenanceNote:
      'bucketLabelField=timestamp is a 1s query bucket label (DIMO historical AVG), not proven physical observation time; grid FROM_INCLUSIVE_TO_EXCLUSIVE.',
    window: {
      fromUtc: new Date(material.window.fromMs).toISOString(),
      toUtcExclusive: new Date(material.window.toMs).toISOString(),
      fromMs: material.window.fromMs,
      toMs: material.window.toMs,
      expectedBucketCount: material.window.expectedBucketCount,
      gridBoundary: material.window.boundary,
      bucketLabelConvention: 'UTC Z suffix, whole-second bucket start labels',
    },
    dimoTokenId: material.dimoTokenId,
    vehicleId: material.vehicleId,
    sourceFamily: material.sourceFamily,
    sourceFamilyPolicyVersion: material.sourceFamilyPolicyVersion,
    providerSignalsNull: material.providerSignalsNull,
    rejectedProviderRows: material.rejectedProviderRows,
    acquisitionCounters: {
      sumProviderRowCountAllBuckets: sumProviderRowCount,
      presentBuckets,
      rowAbsentBuckets,
      signalNullBuckets,
      invalidCoordinateBuckets,
      duplicateAnomalyBuckets,
      conflictingDuplicateBuckets,
      rejectedProviderRowCount: material.rejectedProviderRows.length,
    },
    qualityFlags,
    bucketsSummary: material.buckets.map((b: DiV0AcquiredPositionBucket) => ({
      bucketLabelUtc: b.bucketLabel,
      availability: b.availability,
      coordinateStatus: b.coordinateStatus,
      providerRowCount: b.providerRowCount,
      anomalies: [...b.anomalies],
      provenanceDerivedFrom: [...(b.observation.provenance.derivedFrom ?? [])],
    })),
    headerLines: { adapter: header.adapterLine, query: header.queryLine },
  };
}

export function normalizeRejectedRawLabelToBucket(rawLabel: string | null): string | null {
  if (!rawLabel) return null;
  const trimmed = rawLabel.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(trimmed)) return trimmed;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return dateToBucketLabel(new Date(ms));
}

export function buildRejectedVsMissingAnalysis(
  position: ParsedPositionSnapshotExport,
  bucketLabels: string[],
  tag: string,
): Record<string, unknown> {
  const bucketByLabel = new Map(position.bucketsSummary.map((b) => [b.bucketLabelUtc, b]));
  const rejectedByTargetBucket = new Map<string, DiV0RejectedProviderRow[]>();
  const unmappedRejected: DiV0RejectedProviderRow[] = [];

  for (const r of position.rejectedProviderRows) {
    const bucket = normalizeRejectedRawLabelToBucket(r.rawLabel);
    if (!bucket) {
      unmappedRejected.push(r);
      continue;
    }
    const list = rejectedByTargetBucket.get(bucket) ?? [];
    list.push(r);
    rejectedByTargetBucket.set(bucket, list);
  }

  const perSecond = bucketLabels.map((label) => {
    const b = bucketByLabel.get(label);
    const rejects = rejectedByTargetBucket.get(label) ?? [];
    const classification =
      b?.availability === 'SIGNAL_NULL'
        ? 'SIGNAL_NULL'
        : b?.availability === 'ROW_ABSENT'
          ? rejects.length > 0
            ? 'ROW_ABSENT_WITH_REJECTED_INPUT_FOR_SAME_LABEL'
            : 'ROW_ABSENT_NO_REJECTED_INPUT_FOR_LABEL'
          : b?.availability === 'PRESENT'
            ? b.anomalies.includes('INVALID_COORDINATE')
              ? 'PRESENT_INVALID_COORDINATE'
              : b.anomalies.length > 0
                ? 'PRESENT_WITH_ANOMALY'
                : 'PRESENT_OK'
            : 'UNKNOWN_BUCKET';

    let rejectedExplainsAbsent: 'YES' | 'NO' | 'N/A' = 'N/A';
    if (b?.availability === 'ROW_ABSENT') {
      rejectedExplainsAbsent = rejects.length > 0 ? 'YES' : 'NO';
    }

    return {
      bucketLabelUtc: label,
      availability: b?.availability ?? null,
      coordinateStatus: b?.coordinateStatus ?? null,
      providerRowCount: b?.providerRowCount ?? null,
      rejectedRowsForLabel: rejects,
      classification,
      rejectedExplainsRowAbsent: rejectedExplainsAbsent,
    };
  });

  const rowAbsent = perSecond.filter((p) => p.availability === 'ROW_ABSENT');
  const explained = rowAbsent.filter((p) => p.rejectedExplainsRowAbsent === 'YES').length;
  const unexplained = rowAbsent.filter((p) => p.rejectedExplainsRowAbsent === 'NO').length;

  let aggregate: 'YES' | 'NO' | 'UNKNOWN' = 'NO';
  if (rowAbsent.length === 0) aggregate = 'N/A' as unknown as 'NO';
  else if (explained === rowAbsent.length) aggregate = 'YES';
  else if (explained === 0) aggregate = 'NO';
  else aggregate = 'UNKNOWN';

  const transitionLabels = new Set<string>();
  for (const label of bucketLabels) {
    const ms = Date.parse(label);
    if (!Number.isFinite(ms)) continue;
    transitionLabels.add(dateToBucketLabel(new Date(ms - 1000)));
    transitionLabels.add(dateToBucketLabel(new Date(ms + 1000)));
  }
  const transitionOnly = [...transitionLabels].filter((l) => !bucketLabels.includes(l)).sort();

  return {
    tag,
    annotatedSecondCount: bucketLabels.length,
    rowAbsentAmongAnnotated: rowAbsent.length,
    rowAbsentExplainedByRejectedInput: explained,
    rowAbsentWithoutRejectedInput: unexplained,
    aggregateRejectedExplainsRowAbsentAmongAnnotated: aggregate,
    unmappedRejectedProviderRows: unmappedRejected,
    rejectedMappedToBucketCount: rejectedByTargetBucket.size,
    perAnnotatedSecond: perSecond,
    transitionContextSeconds: transitionOnly.map((label) => {
      const b = bucketByLabel.get(label);
      const rejects = rejectedByTargetBucket.get(label) ?? [];
      return {
        bucketLabelUtc: label,
        availability: b?.availability ?? null,
        providerRowCount: b?.providerRowCount ?? null,
        rejectedRowsForLabel: rejects,
      };
    }),
    interpretation:
      'ROW_ABSENT without rejected row for the same bucket label => no provider row survived normalization for that grid cell (missing input at S3A), not proof of sensor/provider outage. Rejected rows with matching label => discarded input, not missing input.',
  };
}

export function loadTachoZeroSets(repoRoot: string): {
  all135: string[];
  subset125: string[];
  extra10: string[];
} {
  return loadKompaktTachoZeroSeconds(repoRoot);
}

export function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function readPostDeployManifestSummary(repoRoot: string): Record<string, unknown> {
  const manifestPath = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/post-deploy/POST_DEPLOY_BASELINE_MANIFEST.json',
  );
  const invPath = path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/post-deploy/CURRENT_V2_READABILITY_INVENTORY_2026-10-16.json',
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const inventory = fs.existsSync(invPath) ? JSON.parse(fs.readFileSync(invPath, 'utf8')) : null;
  return {
    epistemic: 'CONFIRMED',
    source: 'committed post-deploy/ artifacts (not regenerated in this export)',
    manifestPath: 'post-deploy/POST_DEPLOY_BASELINE_MANIFEST.json',
    manifestSha256: sha256File(manifestPath),
    preDeployUnchanged: true,
    admission: manifest.admission,
    productReadBoundaryGate: manifest.productReadBoundaryGate,
    boundaryFingerprints: {
      pinned: manifest.identities?.boundaryFingerprintPinned,
      live: manifest.identities?.boundaryFingerprintLive,
      match: manifest.identities?.boundaryFingerprintMatch,
    },
    projectionStore: manifest.projectionStore,
    productionShaAtPostDeployCapture: manifest.productionSha,
    globalCurrentV2Inventory: inventory,
  };
}
