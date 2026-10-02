import type { NormalizedR1ObdObservation, TelemetrySourceFamily } from '../core/types';
import type { DiV0ValidatedPositionWindow } from '../position-acquisition/di-v0-position-acquisition.types';
import { DI_V0_POSITION_QUERY_SPEC_V0_1 } from '../position-acquisition/di-v0-position-acquisition.versions';
import { diV0R1BucketToNormalizedObservation } from './di-v0-r1-obd-normalizer';
import type { DiV0R1ObdAcquiredBucket, DiV0R1ObdScalarSignal } from './di-v0-r1-obd-acquisition.types';
import type { DiV0R1ObdSnapshotMaterial } from './di-v0-r1-obd-snapshot';
import {
  DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3,
  DI_V0_R1_OBD_QUERY_SPEC_V0_3,
} from './di-v0-r1-obd-acquisition.versions';
import { serializeDiV0R1ObdSnapshot } from './di-v0-r1-obd-snapshot';
import {
  assertDiV0R1AdapterLine,
  assertDiV0R1QueryLine,
  expectedR1BucketLabel,
  parseDiV0R1WindowFromSnapshot,
  validateDiV0R1ObdSnapshotSemantics,
} from './di-v0-r1-obd-snapshot-semantic-validate';

export class DiV0R1ObdSnapshotParseError extends Error {
  constructor(message: string) {
    super(`DI_V0_R1_OBD_SNAPSHOT_PARSE:${message}`);
    this.name = 'DiV0R1ObdSnapshotParseError';
  }
}

function parseJsonLine<T>(line: string, label: string): T {
  try {
    return JSON.parse(line) as T;
  } catch {
    throw new DiV0R1ObdSnapshotParseError(`${label} is not valid JSON`);
  }
}

function expectTuple(line: unknown, head: string, len: number, label: string): unknown[] {
  if (!Array.isArray(line) || line.length !== len || line[0] !== head) {
    throw new DiV0R1ObdSnapshotParseError(`${label} malformed`);
  }
  return line;
}

function parseSignalValues(raw: unknown): DiV0R1ObdScalarSignal[] {
  if (!Array.isArray(raw)) throw new DiV0R1ObdSnapshotParseError('signal values malformed');
  const specSignals = DI_V0_R1_OBD_QUERY_SPEC_V0_3.signals;
  if (raw.length !== specSignals.length) throw new DiV0R1ObdSnapshotParseError('signal count mismatch');
  return raw.map((entry, idx) => {
    if (!Array.isArray(entry) || entry.length !== 5) throw new DiV0R1ObdSnapshotParseError('signal tuple malformed');
    const signal = entry[0] as DiV0R1ObdScalarSignal['signal'];
    if (signal !== specSignals[idx].id) throw new DiV0R1ObdSnapshotParseError('signal order mismatch');
    const unit = specSignals[idx].unit;
    if (entry[3] !== unit) throw new DiV0R1ObdSnapshotParseError('signal unit mismatch');
    return {
      signal,
      unit,
      availability: entry[1] as DiV0R1ObdScalarSignal['availability'],
      value: entry[2] == null ? null : Number(entry[2]),
      conflictingValues:
        entry[4] == null
          ? undefined
          : (entry[4] as unknown[]).map((v) => (v == null ? null : Number(v))),
    };
  });
}

export function parseDiV0R1ObdSnapshot(payload: string): DiV0R1ObdSnapshotMaterial {
  if (!payload || payload.includes('\r')) throw new DiV0R1ObdSnapshotParseError('payload must be non-empty LF-only');
  const lines = payload.split('\n');
  if (lines[lines.length - 1] === '') throw new DiV0R1ObdSnapshotParseError('trailing newline forbidden');
  let i = 0;
  if (lines[i++] !== DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3) throw new DiV0R1ObdSnapshotParseError('version mismatch');
  const adapter = expectTuple(parseJsonLine(lines[i++], 'adapter'), 'adapter', 2, 'adapter');
  assertDiV0R1AdapterLine(adapter);
  const query = expectTuple(parseJsonLine(lines[i++], 'query'), 'query', 9, 'query');
  assertDiV0R1QueryLine(query);
  const subject = expectTuple(parseJsonLine(lines[i++], 'subject'), 'subject', 4, 'subject');
  const windowLine = expectTuple(parseJsonLine(lines[i++], 'window'), 'window', 3, 'window');
  const sourceFamilyLine = expectTuple(parseJsonLine(lines[i++], 'sourceFamily'), 'sourceFamily', 3, 'sourceFamily');
  const temporalSemanticsLine = expectTuple(parseJsonLine(lines[i++], 'temporalSemantics'), 'temporalSemantics', 2, 'temporalSemantics');
  if (temporalSemanticsLine[1] !== 'INTERVAL_ONLY') throw new DiV0R1ObdSnapshotParseError('temporalSemantics must be INTERVAL_ONLY');
  const fixed = expectTuple(parseJsonLine(lines[i++], 'fixedTimeCorrection'), 'fixedTimeCorrection', 2, 'fixedTimeCorrection');
  if (fixed[1] !== false) throw new DiV0R1ObdSnapshotParseError('fixedTimeCorrection must be false');
  const windowValidated = parseDiV0R1WindowFromSnapshot(windowLine[1], windowLine[2]);
  const buckets: DiV0R1ObdAcquiredBucket[] = [];
  let bucketIndex = 0;
  while (i < lines.length) {
    const parsed = parseJsonLine(lines[i], 'bucket');
    if (!Array.isArray(parsed) || parsed[0] !== 'b') throw new DiV0R1ObdSnapshotParseError('expected bucket line');
    if (parsed.length !== 6) throw new DiV0R1ObdSnapshotParseError('bucket tuple length');
    const bucketLabel = String(parsed[1]);
    const expectedLabel = expectedR1BucketLabel(windowValidated.fromMs, bucketIndex);
    if (bucketLabel !== expectedLabel) throw new DiV0R1ObdSnapshotParseError('bucket label off-grid');
    bucketIndex += 1;
    buckets.push({
      bucketLabel,
      rowAvailability: parsed[2] as DiV0R1ObdAcquiredBucket['rowAvailability'],
      providerRowCount: Number(parsed[3]),
      temporalSemantics: 'INTERVAL_ONLY',
      signals: parseSignalValues(parsed[4]),
      qualityFlags: parsed[5] as DiV0R1ObdAcquiredBucket['qualityFlags'],
    });
    i += 1;
  }
  if (bucketIndex !== windowValidated.expectedBucketCount) throw new DiV0R1ObdSnapshotParseError('bucket count mismatch');
  const window: DiV0ValidatedPositionWindow = {
    ...windowValidated,
    boundary: DI_V0_POSITION_QUERY_SPEC_V0_1.gridBoundary,
  };
  const material: DiV0R1ObdSnapshotMaterial = {
    dimoTokenId: Number(subject[2]),
    vehicleId: String(subject[3]),
    window,
    sourceFamily: sourceFamilyLine[1] as TelemetrySourceFamily,
    sourceFamilyPolicyVersion: String(sourceFamilyLine[2]),
    buckets,
  };
  try {
    validateDiV0R1ObdSnapshotSemantics(material);
  } catch (error) {
    const msg = error instanceof Error ? error.message.replace(/^DI_V0_R1_OBD_SNAPSHOT_PARSE:/, '') : 'semantic validation failed';
    throw new DiV0R1ObdSnapshotParseError(msg);
  }
  const roundTrip = serializeDiV0R1ObdSnapshot(material);
  if (roundTrip !== payload) throw new DiV0R1ObdSnapshotParseError('round-trip byte mismatch');
  return material;
}

export function diV0R1SnapshotToS1Observations(material: DiV0R1ObdSnapshotMaterial): NormalizedR1ObdObservation[] {
  return material.buckets.map(diV0R1BucketToNormalizedObservation).filter((o): o is NormalizedR1ObdObservation => o != null);
}
