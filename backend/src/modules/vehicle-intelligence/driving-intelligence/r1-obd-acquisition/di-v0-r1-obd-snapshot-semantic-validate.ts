import { DI_V0_R1_OBD_DEFAULT_MAX_WINDOW_SECONDS } from './di-v0-r1-obd-acquisition.versions';
import { formatBucketLabel, validateDiV0PositionWindow } from '../position-acquisition/di-v0-position-window';
import type { DiV0R1ObdAcquiredBucket, DiV0R1ObdQualityFlag, DiV0R1ObdScalarSignal } from './di-v0-r1-obd-acquisition.types';
import type { DiV0R1ObdSnapshotMaterial } from './di-v0-r1-obd-snapshot';
import {
  DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_3,
  DI_V0_R1_OBD_QUERY_SPEC_V0_3,
} from './di-v0-r1-obd-acquisition.versions';
const ROW_AVAIL = new Set(['ROW_PRESENT', 'ROW_ABSENT']);
const SIGNAL_AVAIL = new Set(['VALUE_PRESENT', 'SIGNAL_NULL', 'ROW_ABSENT', 'CONFLICTING_DUPLICATE']);
const QUALITY_FLAGS: DiV0R1ObdQualityFlag[] = [
  'NO_PROVIDER_ROWS',
  'PROVIDER_SIGNALS_NULL',
  'SPARSE_SIGNAL',
  'LONG_GAP',
  'APPARENT_STALE_SEQUENCE',
  'APPARENT_BACKLOG',
  'TEMPORAL_UNCERTAINTY',
  'UNSUPPORTED_SOURCE_FAMILY',
  'DUPLICATE_BUCKET_IDENTICAL',
  'DUPLICATE_BUCKET_CONFLICTING',
];

function fail(msg: string): never {
  throw new Error(`DI_V0_R1_OBD_SNAPSHOT_PARSE:${msg}`);
}

export function assertDiV0R1QueryLine(query: unknown[]): void {
  const spec = DI_V0_R1_OBD_QUERY_SPEC_V0_3;
  if (
    query.length !== 9 ||
    query[1] !== spec.id ||
    query[2] !== spec.provider ||
    query[3] !== spec.queryFamily ||
    query[4] !== spec.interval ||
    query[5] !== spec.gridBoundary ||
    query[6] !== spec.temporalSemantics ||
    query[7] !== spec.fieldAuthoritySource
  ) {
    fail('query spec fields mismatch');
  }
  const meta = query[8];
  if (!Array.isArray(meta) || meta.length !== spec.signals.length) fail('query signal metadata mismatch');
  for (let i = 0; i < spec.signals.length; i++) {
    const row = meta[i];
    const s = spec.signals[i];
    if (
      !Array.isArray(row) ||
      row.length !== 6 ||
      row[0] !== s.id ||
      row[1] !== s.unit ||
      row[2] !== s.providerDocumentedUnit ||
      row[3] !== s.valueScale ||
      row[4] !== s.aggregation ||
      row[5] !== s.fieldAuthority
    ) {
      fail('query signal metadata field mismatch');
    }
  }
}

export function assertDiV0R1AdapterLine(adapter: unknown[]): void {
  if (adapter[1] !== DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_3) fail('adapter mismatch');
}

export function parseDiV0R1WindowFromSnapshot(fromUtc: unknown, toUtc: unknown) {
  return validateDiV0PositionWindow(fromUtc, toUtc, DI_V0_R1_OBD_DEFAULT_MAX_WINDOW_SECONDS);
}

export function expectedR1BucketLabel(windowFromMs: number, index: number): string {
  return formatBucketLabel(windowFromMs + index * DI_V0_R1_OBD_QUERY_SPEC_V0_3.intervalMs);
}

function validateSignal(signal: DiV0R1ObdScalarSignal): void {
  if (!SIGNAL_AVAIL.has(signal.availability)) fail('signal availability invalid');
  if (signal.value != null && !Number.isFinite(signal.value)) fail('signal value non-finite');
  if (signal.signal === 'speed' && signal.availability === 'VALUE_PRESENT' && signal.value != null && signal.value < 0) {
    fail('speed VALUE_PRESENT must be >=0');
  }
  if (signal.availability === 'VALUE_PRESENT') {
    if (signal.value == null) fail('VALUE_PRESENT requires value');
    if (signal.conflictingValues != null) fail('VALUE_PRESENT conflictingValues forbidden');
  } else if (signal.availability === 'SIGNAL_NULL') {
    if (signal.value != null) fail('SIGNAL_NULL value must be null');
    if (signal.conflictingValues != null) fail('SIGNAL_NULL conflictingValues forbidden');
  } else if (signal.availability === 'ROW_ABSENT') {
    if (signal.value != null) fail('ROW_ABSENT value must be null');
  } else if (signal.availability === 'CONFLICTING_DUPLICATE') {
    if (signal.value != null) fail('CONFLICTING_DUPLICATE value null');
    const variants = signal.conflictingValues;
    if (!variants || variants.length < 2) fail('CONFLICTING_DUPLICATE variants');
    const canon = variants.map((v) => (v == null ? 'null' : String(v)));
    const unique = new Set(canon);
    if (unique.size < 2) fail('CONFLICTING_DUPLICATE needs distinct variants');
    if (signal.signal === 'speed') {
      for (const v of variants) {
        if (v != null && v < 0) fail('speed conflict variant <0');
      }
    }
  }
}

function validateBucket(bucket: DiV0R1ObdAcquiredBucket): void {
  if (!ROW_AVAIL.has(bucket.rowAvailability)) fail('rowAvailability invalid');
  if (!Number.isSafeInteger(bucket.providerRowCount) || bucket.providerRowCount < 0) fail('providerRowCount invalid');
  if (bucket.temporalSemantics !== 'INTERVAL_ONLY') fail('temporalSemantics must be INTERVAL_ONLY');
  for (const flag of bucket.qualityFlags) {
    if (!QUALITY_FLAGS.includes(flag)) fail('quality flag invalid');
  }
  if (!bucket.qualityFlags.includes('TEMPORAL_UNCERTAINTY')) fail('TEMPORAL_UNCERTAINTY required');
  if (bucket.rowAvailability === 'ROW_ABSENT') {
    if (bucket.providerRowCount !== 0) fail('ROW_ABSENT providerRowCount');
    for (const s of bucket.signals) {
      if (s.availability !== 'ROW_ABSENT' || s.value != null) fail('ROW_ABSENT signal state');
    }
  } else {
    if (bucket.providerRowCount < 1) fail('ROW_PRESENT providerRowCount');
    for (const s of bucket.signals) {
      if (s.availability === 'ROW_ABSENT') fail('ROW_PRESENT cannot have ROW_ABSENT signal');
      validateSignal(s);
    }
  }
}

export function validateDiV0R1ObdSnapshotSemantics(material: DiV0R1ObdSnapshotMaterial): void {
  const sf = material.sourceFamily;
  if (sf !== 'API_SYNTHETIC' && sf !== 'RUPTELA_R1' && sf !== 'UNKNOWN') fail('sourceFamily invalid');
  if (!Number.isSafeInteger(material.dimoTokenId) || material.dimoTokenId <= 0) fail('dimoTokenId invalid');
  if (!material.vehicleId?.trim()) fail('vehicleId invalid');
  for (const bucket of material.buckets) validateBucket(bucket);
}
