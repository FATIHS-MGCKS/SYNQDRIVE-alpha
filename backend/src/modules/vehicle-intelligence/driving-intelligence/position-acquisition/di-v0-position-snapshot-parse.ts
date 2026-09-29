import type { NormalizedPositionObservation, TelemetrySourceFamily } from '../core/types';
import type {
  DiV0AcquiredPositionBucket,
  DiV0CoordinateStatus,
  DiV0RejectedProviderRow,
} from './di-v0-position-acquisition.types';
import type { DiV0PositionSnapshotMaterial } from './di-v0-position-snapshot';
import {
  DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1,
  DI_V0_POSITION_QUERY_SPEC_V0_1,
} from './di-v0-position-acquisition.versions';
import { buildDiV0PositionNormalizedObservation } from './di-v0-position-normalizer';
import { serializeDiV0PositionSnapshot } from './di-v0-position-snapshot';
import {
  assertDiV0PositionAdapterLine,
  assertDiV0PositionQueryLine,
  assertDiV0PositionRejectedRowsCanonicalOrder,
  assertDiV0PositionSubject,
  expectedPositionBucketLabel,
  parseDiV0PositionWindowFromSnapshot,
  validateDiV0PositionSnapshotSemantics,
} from './di-v0-position-snapshot-semantic-validate';

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
  const adapter = expectTuple(parseJsonLine(lines[i++], 'adapter'), 'adapter', 2, 'adapter');
  assertDiV0PositionAdapterLine(adapter);
  const query = expectTuple(parseJsonLine(lines[i++], 'query'), 'query', 8, 'query');
  assertDiV0PositionQueryLine(query);
  const subject = expectTuple(parseJsonLine(lines[i++], 'subject'), 'subject', 4, 'subject');
  const windowLine = expectTuple(parseJsonLine(lines[i++], 'window'), 'window', 3, 'window');
  const sourceFamilyLine = expectTuple(parseJsonLine(lines[i++], 'sourceFamily'), 'sourceFamily', 3, 'sourceFamily');
  const providerSignalsNullLine = expectTuple(
    parseJsonLine(lines[i++], 'providerSignalsNull'),
    'providerSignalsNull',
    2,
    'providerSignalsNull',
  );
  const dimoTokenId = Number(subject[2]);
  const vehicleId = String(subject[3]);
  assertDiV0PositionSubject(dimoTokenId, vehicleId);
  const sourceFamily = sourceFamilyLine[1] as TelemetrySourceFamily;
  const sourceFamilyPolicyVersion = String(sourceFamilyLine[2]);
  const providerSignalsNull = providerSignalsNullLine[1] === true;
  const window = parseDiV0PositionWindowFromSnapshot(windowLine[1], windowLine[2]);
  const buckets: DiV0AcquiredPositionBucket[] = [];
  const conflictKeysByLabel = new Map<string, string[]>();
  const rejectedProviderRows: DiV0RejectedProviderRow[] = [];
  let bucketIndex = 0;
  let inRejectedSection = false;
  while (i < lines.length) {
    const parsed = parseJsonLine(lines[i], 'bucket or rejected');
    if (Array.isArray(parsed) && parsed[0] === 'b') {
      if (inRejectedSection) throw new DiV0PositionSnapshotParseError('bucket after rejected section');
      if (parsed.length !== 8) throw new DiV0PositionSnapshotParseError('bucket tuple length');
      const bucketLabel = String(parsed[1]);
      const expectedLabel = expectedPositionBucketLabel(window.fromMs, bucketIndex);
      if (bucketLabel !== expectedLabel) throw new DiV0PositionSnapshotParseError('bucket label off-grid');
      bucketIndex += 1;
      const availability = parsed[2] as NormalizedPositionObservation['availability'];
      const coordinateStatus = parsed[3] as DiV0CoordinateStatus;
      const lat = parsed[4] == null ? null : Number(parsed[4]);
      const lon = parsed[5] == null ? null : Number(parsed[5]);
      const providerRowCount = Number(parsed[6]);
      const conflictKeys = parsed[7] as string[];
      if (!Array.isArray(conflictKeys) || conflictKeys.some((k) => typeof k !== 'string')) {
        throw new DiV0PositionSnapshotParseError('conflict keys malformed');
      }
      const sortedKeys = [...conflictKeys].sort();
      if (sortedKeys.join('\0') !== conflictKeys.join('\0')) {
        throw new DiV0PositionSnapshotParseError('conflict keys not sorted');
      }
      if (conflictKeys.length > 0) conflictKeysByLabel.set(bucketLabel, sortedKeys);
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
      inRejectedSection = true;
      if (parsed.length !== 3) throw new DiV0PositionSnapshotParseError('rejected tuple length');
      rejectedProviderRows.push({ reason: parsed[1] as DiV0RejectedProviderRow['reason'], rawLabel: parsed[2] as string | null });
      i += 1;
      continue;
    }
    throw new DiV0PositionSnapshotParseError('unexpected line');
  }
  if (bucketIndex !== window.expectedBucketCount) {
    throw new DiV0PositionSnapshotParseError('bucket count does not match window grid');
  }
  assertDiV0PositionRejectedRowsCanonicalOrder(rejectedProviderRows);
  const material: DiV0PositionSnapshotMaterial = {
    dimoTokenId,
    vehicleId,
    window: { ...window, boundary: DI_V0_POSITION_QUERY_SPEC_V0_1.gridBoundary },
    sourceFamily,
    sourceFamilyPolicyVersion,
    providerSignalsNull,
    buckets,
    conflictKeysByLabel,
    rejectedProviderRows,
  };
  try {
    validateDiV0PositionSnapshotSemantics(material);
  } catch (error) {
    const msg = error instanceof Error ? error.message.replace(/^DI_V0_POSITION_SNAPSHOT_PARSE:/, '') : 'semantic validation failed';
    throw new DiV0PositionSnapshotParseError(msg);
  }
  const roundTrip = serializeDiV0PositionSnapshot(material);
  if (roundTrip !== payload) throw new DiV0PositionSnapshotParseError('round-trip byte mismatch');
  return material;
}

export function diV0PositionSnapshotToS1Observations(material: DiV0PositionSnapshotMaterial): NormalizedPositionObservation[] {
  return material.buckets.map((b) => b.observation);
}
