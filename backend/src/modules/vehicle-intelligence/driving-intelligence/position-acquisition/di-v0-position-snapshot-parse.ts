import type { NormalizedPositionObservation, TelemetrySourceFamily } from '../core/types';
import type {
  DiV0AcquiredPositionBucket,
  DiV0CoordinateStatus,
  DiV0RejectedProviderRow,
} from './di-v0-position-acquisition.types';
import type { DiV0PositionSnapshotMaterial } from './di-v0-position-snapshot';
import {
  DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1,
  DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1,
  DI_V0_POSITION_QUERY_SPEC_V0_1,
} from './di-v0-position-acquisition.versions';
import { buildDiV0PositionNormalizedObservation } from './di-v0-position-normalizer';
import { serializeDiV0PositionSnapshot } from './di-v0-position-snapshot';

export class DiV0PositionSnapshotParseError extends Error {
  constructor(message: string) {
    super(`DI_V0_POSITION_SNAPSHOT_PARSE:${message}`);
    this.name = 'DiV0PositionSnapshotParseError';
  }
}

function parseJsonLine<T>(line: string, label: string): T {
  try {
    return JSON.parse(line) as T;
  } catch {
    throw new DiV0PositionSnapshotParseError(`${label} is not valid JSON`);
  }
}

function expectTuple(line: unknown, head: string, len: number, label: string): unknown[] {
  if (!Array.isArray(line) || line.length !== len || line[0] !== head) {
    throw new DiV0PositionSnapshotParseError(`${label} malformed`);
  }
  return line;
}

export function parseDiV0PositionSnapshot(payload: string): DiV0PositionSnapshotMaterial {
  if (!payload || payload.includes('\r')) throw new DiV0PositionSnapshotParseError('payload must be non-empty LF-only');
  const lines = payload.split('\n');
  if (lines[lines.length - 1] === '') throw new DiV0PositionSnapshotParseError('trailing newline forbidden');
  let i = 0;
  if (lines[i++] !== DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1) {
    throw new DiV0PositionSnapshotParseError('version mismatch');
  }
  expectTuple(parseJsonLine(lines[i++], 'adapter'), 'adapter', 2, 'adapter');
  const query = expectTuple(parseJsonLine(lines[i++], 'query'), 'query', 8, 'query');
  if (query[1] !== DI_V0_POSITION_QUERY_SPEC_V0_1.id) throw new DiV0PositionSnapshotParseError('query spec mismatch');
  const subject = expectTuple(parseJsonLine(lines[i++], 'subject'), 'subject', 4, 'subject');
  const window = expectTuple(parseJsonLine(lines[i++], 'window'), 'window', 3, 'window');
  const sourceFamilyLine = expectTuple(parseJsonLine(lines[i++], 'sourceFamily'), 'sourceFamily', 3, 'sourceFamily');
  const providerSignalsNullLine = expectTuple(
    parseJsonLine(lines[i++], 'providerSignalsNull'),
    'providerSignalsNull',
    2,
    'providerSignalsNull',
  );
  const dimoTokenId = Number(subject[2]);
  const vehicleId = String(subject[3]);
  const sourceFamily = sourceFamilyLine[1] as TelemetrySourceFamily;
  const sourceFamilyPolicyVersion = String(sourceFamilyLine[2]);
  const providerSignalsNull = providerSignalsNullLine[1] === true;
  const buckets: DiV0AcquiredPositionBucket[] = [];
  const conflictKeysByLabel = new Map<string, string[]>();
  const rejectedProviderRows: DiV0RejectedProviderRow[] = [];
  const seenBuckets = new Set<string>();
  while (i < lines.length) {
    const parsed = parseJsonLine(lines[i], 'bucket or rejected');
    if (Array.isArray(parsed) && parsed[0] === 'b') {
      if (parsed.length !== 8) throw new DiV0PositionSnapshotParseError('bucket tuple length');
      const bucketLabel = String(parsed[1]);
      if (seenBuckets.has(bucketLabel)) throw new DiV0PositionSnapshotParseError('duplicate bucket');
      seenBuckets.add(bucketLabel);
      const availability = parsed[2] as NormalizedPositionObservation['availability'];
      const coordinateStatus = parsed[3] as DiV0CoordinateStatus;
      const lat = parsed[4] == null ? null : Number(parsed[4]);
      const lon = parsed[5] == null ? null : Number(parsed[5]);
      const providerRowCount = Number(parsed[6]);
      const conflictKeys = parsed[7] as string[];
      if (!Array.isArray(conflictKeys) || conflictKeys.some((k) => typeof k !== 'string')) {
        throw new DiV0PositionSnapshotParseError('conflict keys malformed');
      }
      if (conflictKeys.length > 0) conflictKeysByLabel.set(bucketLabel, [...conflictKeys].sort());
      const labelMs = Date.parse(bucketLabel);
      if (!Number.isFinite(labelMs)) throw new DiV0PositionSnapshotParseError('bucket label unparseable');
      const coords =
        lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)
          ? { latitude: lat, longitude: lon }
          : null;
      const observation = buildDiV0PositionNormalizedObservation(bucketLabel, labelMs, availability, sourceFamily, coords);
      const anomalies: DiV0AcquiredPositionBucket['anomalies'] = [];
      if (conflictKeys.length > 0) anomalies.push('DUPLICATE_BUCKET_CONFLICTING');
      if (coordinateStatus !== 'VALID' && coordinateStatus !== 'NOT_APPLICABLE' && coordinateStatus !== 'CONFLICTING_DUPLICATE') {
        if (availability === 'PRESENT') anomalies.push('INVALID_COORDINATE');
      }
      let temporalConfidence: DiV0AcquiredPositionBucket['temporalConfidence'] = 'UNKNOWN';
      if (availability === 'ROW_ABSENT') temporalConfidence = 'UNKNOWN';
      else if (coordinateStatus === 'VALID' && coords) temporalConfidence = 'BUCKET_BOUNDED';
      buckets.push({
        bucketLabel,
        availability,
        coordinateStatus,
        temporalConfidence,
        providerRowCount,
        anomalies,
        observation,
      });
      i += 1;
      continue;
    }
    if (Array.isArray(parsed) && parsed[0] === 'r') {
      if (parsed.length !== 3) throw new DiV0PositionSnapshotParseError('rejected tuple length');
      rejectedProviderRows.push({ reason: parsed[1] as DiV0RejectedProviderRow['reason'], rawLabel: parsed[2] as string | null });
      i += 1;
      continue;
    }
    throw new DiV0PositionSnapshotParseError('unexpected line');
  }
  const fromUtc = String(window[1]);
  const toUtc = String(window[2]);
  const fromMs = Date.parse(fromUtc);
  const toMs = Date.parse(toUtc);
  const intervalMs = DI_V0_POSITION_QUERY_SPEC_V0_1.intervalMs;
  const expectedBucketCount = (toMs - fromMs) / intervalMs;
  if (!Number.isInteger(expectedBucketCount) || expectedBucketCount !== buckets.length) {
    throw new DiV0PositionSnapshotParseError('bucket count does not match window grid');
  }
  const material: DiV0PositionSnapshotMaterial = {
    dimoTokenId,
    vehicleId,
    window: { fromUtc, toUtc, fromMs, toMs, expectedBucketCount, boundary: DI_V0_POSITION_QUERY_SPEC_V0_1.gridBoundary },
    sourceFamily,
    sourceFamilyPolicyVersion,
    providerSignalsNull,
    buckets,
    conflictKeysByLabel,
    rejectedProviderRows,
  };
  const roundTrip = serializeDiV0PositionSnapshot(material);
  if (roundTrip !== payload) throw new DiV0PositionSnapshotParseError('round-trip byte mismatch');
  return material;
}

export function diV0PositionSnapshotToS1Observations(material: DiV0PositionSnapshotMaterial): NormalizedPositionObservation[] {
  return material.buckets.map((b) => b.observation);
}
