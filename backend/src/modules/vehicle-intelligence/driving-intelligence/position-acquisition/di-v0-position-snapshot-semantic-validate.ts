import type { EvidenceAvailability } from '../core/types';
import { DI_V0_S4_LIMITS } from '../s4a-foundation/di-v0-s4a-contract';
import type {
  DiV0AcquiredPositionBucket,
  DiV0CoordinateStatus,
  DiV0RejectedProviderRow,
  DiV0RejectedRowReason,
} from './di-v0-position-acquisition.types';
import type { DiV0PositionSnapshotMaterial } from './di-v0-position-snapshot';
import {
  DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1,
  DI_V0_POSITION_QUERY_SPEC_V0_1,
} from './di-v0-position-acquisition.versions';
import { formatBucketLabel, validateDiV0PositionWindow } from './di-v0-position-window';
const AVAILABILITY: EvidenceAvailability[] = ['PRESENT', 'SIGNAL_NULL', 'ROW_ABSENT'];
const COORDINATE_STATUS: DiV0CoordinateStatus[] = [
  'VALID',
  'NOT_APPLICABLE',
  'FIELD_MISSING',
  'MALFORMED_VALUE',
  'MISSING_LATITUDE',
  'MISSING_LONGITUDE',
  'NON_NUMERIC',
  'NON_FINITE',
  'LATITUDE_OUT_OF_RANGE',
  'LONGITUDE_OUT_OF_RANGE',
  'CONFLICTING_DUPLICATE',
];
const REJECTED_REASONS: DiV0RejectedRowReason[] = [
  'ROW_NOT_OBJECT',
  'LABEL_MISSING',
  'LABEL_UNPARSEABLE',
  'LABEL_NOT_SECOND_ALIGNED',
  'LABEL_OUTSIDE_WINDOW',
];

function fail(msg: string): never {
  throw new Error(`DI_V0_POSITION_SNAPSHOT_PARSE:${msg}`);
}

export function assertDiV0PositionQueryLine(query: unknown[]): void {
  const spec = DI_V0_POSITION_QUERY_SPEC_V0_1;
  if (
    query[1] !== spec.id ||
    query[2] !== spec.provider ||
    query[3] !== spec.queryFamily ||
    query[4] !== spec.signal ||
    query[5] !== spec.interval ||
    query[6] !== spec.coordinateAggregation ||
    query[7] !== spec.gridBoundary
  ) {
    fail('query spec fields mismatch');
  }
}

export function assertDiV0PositionAdapterLine(adapter: unknown[]): void {
  if (adapter[1] !== DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1) fail('adapter mismatch');
}

export function parseDiV0PositionWindowFromSnapshot(fromUtc: unknown, toUtc: unknown) {
  return validateDiV0PositionWindow(fromUtc, toUtc, DI_V0_S4_LIMITS.maxAcquisitionWindowSeconds);
}

export function assertDiV0PositionSubject(dimoTokenId: number, vehicleId: string): void {
  if (!Number.isSafeInteger(dimoTokenId) || dimoTokenId <= 0) fail('dimoTokenId must be positive safe integer');
  if (!vehicleId || typeof vehicleId !== 'string' || vehicleId.trim().length === 0) fail('vehicleId must be non-empty');
}

export function expectedPositionBucketLabel(windowFromMs: number, index: number): string {
  return formatBucketLabel(windowFromMs + index * DI_V0_POSITION_QUERY_SPEC_V0_1.intervalMs);
}

export function assertDiV0PositionRejectedRowsCanonicalOrder(rows: DiV0RejectedProviderRow[]): void {
  for (let i = 1; i < rows.length; i++) {
    const prev = JSON.stringify(['r', rows[i - 1].reason, rows[i - 1].rawLabel]);
    const cur = JSON.stringify(['r', rows[i].reason, rows[i].rawLabel]);
    if (prev > cur) fail('rejected rows not in canonical sort order');
  }
  for (const row of rows) {
    if (!REJECTED_REASONS.includes(row.reason)) fail('rejected row reason invalid');
    if (row.rawLabel != null && typeof row.rawLabel !== 'string') fail('rejected rawLabel invalid');
  }
}

function validateBucketSemantics(
  bucket: DiV0AcquiredPositionBucket,
  conflictKeys: string[],
  providerSignalsNull: boolean,
): void {
  if (!AVAILABILITY.includes(bucket.availability)) fail('availability enum invalid');
  if (!COORDINATE_STATUS.includes(bucket.coordinateStatus)) fail('coordinateStatus enum invalid');
  if (!Number.isSafeInteger(bucket.providerRowCount) || bucket.providerRowCount < 0) {
    fail('providerRowCount invalid');
  }
  const lat = bucket.observation.latitude;
  const lon = bucket.observation.longitude;
  if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) fail('latitude invalid');
  if (lon != null && (!Number.isFinite(lon) || lon < -180 || lon > 180)) fail('longitude invalid');

  const sortedUnique = [...new Set(conflictKeys)].sort();
  if (sortedUnique.join('\0') !== [...conflictKeys].sort().join('\0')) fail('conflict keys not sorted unique');

  if (bucket.availability === 'ROW_ABSENT') {
    if (bucket.providerRowCount !== 0) fail('ROW_ABSENT requires providerRowCount=0');
    if (bucket.coordinateStatus !== 'NOT_APPLICABLE') fail('ROW_ABSENT coordinateStatus');
    if (lat != null || lon != null) fail('ROW_ABSENT coordinates must be null');
    if (conflictKeys.length > 0) fail('ROW_ABSENT conflictKeys');
  } else if (bucket.availability === 'SIGNAL_NULL') {
    if (bucket.providerRowCount < 1) fail('SIGNAL_NULL providerRowCount');
    if (bucket.coordinateStatus !== 'NOT_APPLICABLE') fail('SIGNAL_NULL coordinateStatus');
    if (lat != null || lon != null) fail('SIGNAL_NULL coordinates must be null');
    if (conflictKeys.length > 0) fail('SIGNAL_NULL conflictKeys');
  } else if (bucket.availability === 'PRESENT') {
    if (bucket.providerRowCount < 1) fail('PRESENT providerRowCount');
    if (bucket.coordinateStatus === 'VALID') {
      if (lat == null || lon == null) fail('VALID requires coordinates');
      if (conflictKeys.length > 0) fail('VALID conflictKeys');
    } else if (bucket.coordinateStatus === 'CONFLICTING_DUPLICATE') {
      if (bucket.providerRowCount < 2) fail('CONFLICTING_DUPLICATE providerRowCount');
      if (lat != null || lon != null) fail('CONFLICTING_DUPLICATE coordinates null');
      if (conflictKeys.length < 2) fail('CONFLICTING_DUPLICATE conflictKeys');
    } else {
      if (lat != null || lon != null) fail('invalid coordinate status requires null coords');
      if (conflictKeys.length > 0) fail('invalid coordinate conflictKeys');
    }
  }

  if (providerSignalsNull && bucket.availability === 'PRESENT' && bucket.coordinateStatus === 'VALID') {
    fail('providerSignalsNull inconsistent with PRESENT VALID');
  }
}

/** Semantic invariants after structural parse (before round-trip). */
export function validateDiV0PositionSnapshotSemantics(material: DiV0PositionSnapshotMaterial): void {
  const sf = material.sourceFamily;
  if (sf !== 'API_SYNTHETIC' && sf !== 'RUPTELA_R1' && sf !== 'UNKNOWN') {
    fail('sourceFamily vocabulary invalid');
  }
  if (material.providerSignalsNull !== true && material.providerSignalsNull !== false) {
    fail('providerSignalsNull must be boolean');
  }
  assertDiV0PositionRejectedRowsCanonicalOrder(material.rejectedProviderRows);
  for (const bucket of material.buckets) {
    const keys = material.conflictKeysByLabel.get(bucket.bucketLabel) ?? [];
    validateBucketSemantics(bucket, keys, material.providerSignalsNull);
  }
  if (material.providerSignalsNull) {
    const anyPresentValid = material.buckets.some(
      (b) => b.availability === 'PRESENT' && b.coordinateStatus === 'VALID',
    );
    if (anyPresentValid) fail('providerSignalsNull with usable POSITION');
  }
}
