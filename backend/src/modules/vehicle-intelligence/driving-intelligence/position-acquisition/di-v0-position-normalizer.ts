import type { NormalizedPositionObservation, TemporalConfidence } from '../core/types';
import type {
  DiV0AcquiredPositionBucket,
  DiV0AcquisitionQualityFlag,
  DiV0BucketAnomaly,
  DiV0CoordinateStatus,
  DiV0PositionAcquisitionCounters,
  DiV0PositionAcquisitionFailure,
  DiV0PositionAcquisitionResult,
  DiV0RejectedProviderRow,
  DiV0SourceFamilyResolution,
} from './di-v0-position-acquisition.types';
import {
  DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1,
  DI_V0_POSITION_QUERY_SPEC_V0_1,
} from './di-v0-position-acquisition.versions';
import { buildFailure } from './di-v0-position-errors';
import { canonicalNumber, computeDiV0PositionSnapshotIdentity } from './di-v0-position-snapshot';
import { formatBucketLabel, type DiV0ValidatedPositionRequest } from './di-v0-position-window';

const PROVIDER_LABEL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d+))?(?:Z|[+-]\d{2}:\d{2})$/;
const ROW_ABSENT_DERIVATION = 'EXPECTED_GRID_ROW_ABSENT';

type RowLocationEvidence =
  | { kind: 'VALID'; latitude: number; longitude: number }
  | { kind: 'SIGNAL_NULL' }
  | { kind: 'INVALID'; status: Exclude<DiV0CoordinateStatus, 'VALID' | 'NOT_APPLICABLE' | 'CONFLICTING_DUPLICATE'>; repr: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function stableRepr(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
    return canonicalNumber(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return String(value);
  return Array.isArray(value) ? '[array]' : '[object]';
}

function evaluateRowLocation(row: Record<string, unknown>): RowLocationEvidence {
  const signal = DI_V0_POSITION_QUERY_SPEC_V0_1.signal;
  if (!Object.prototype.hasOwnProperty.call(row, signal)) {
    return { kind: 'INVALID', status: 'FIELD_MISSING', repr: 'absent' };
  }
  const location = row[signal];
  if (location === null) {
    return { kind: 'SIGNAL_NULL' };
  }
  if (!isPlainObject(location)) {
    return { kind: 'INVALID', status: 'MALFORMED_VALUE', repr: stableRepr(location) };
  }
  const lat = location.latitude;
  const lon = location.longitude;
  const repr = `${stableRepr(lat)},${stableRepr(lon)}`;
  const latMissing = lat === null || lat === undefined;
  const lonMissing = lon === null || lon === undefined;
  if (latMissing && lonMissing) return { kind: 'SIGNAL_NULL' };
  if (latMissing) return { kind: 'INVALID', status: 'MISSING_LATITUDE', repr };
  if (lonMissing) return { kind: 'INVALID', status: 'MISSING_LONGITUDE', repr };
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return { kind: 'INVALID', status: 'NON_NUMERIC', repr };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { kind: 'INVALID', status: 'NON_FINITE', repr };
  }
  if (lat < -90 || lat > 90) return { kind: 'INVALID', status: 'LATITUDE_OUT_OF_RANGE', repr };
  if (lon < -180 || lon > 180) return { kind: 'INVALID', status: 'LONGITUDE_OUT_OF_RANGE', repr };
  return { kind: 'VALID', latitude: lat, longitude: lon };
}

function evidenceKey(evidence: RowLocationEvidence): string {
  switch (evidence.kind) {
    case 'VALID':
      return `V|${canonicalNumber(evidence.latitude)}|${canonicalNumber(evidence.longitude)}`;
    case 'SIGNAL_NULL':
      return 'N';
    case 'INVALID':
      return `I|${evidence.status}|${evidence.repr}`;
  }
}

type LabelParse =
  | { ok: true; ms: number }
  | { ok: false; reason: 'LABEL_MISSING' | 'LABEL_UNPARSEABLE' | 'LABEL_NOT_SECOND_ALIGNED'; rawLabel: string | null };

/** Exact instant normalization only; sub-second labels are rejected, never rounded. */
function parseProviderLabel(raw: unknown): LabelParse {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, reason: 'LABEL_MISSING', rawLabel: typeof raw === 'string' ? raw : null };
  }
  const match = PROVIDER_LABEL.exec(raw);
  if (!match) return { ok: false, reason: 'LABEL_UNPARSEABLE', rawLabel: raw };
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return { ok: false, reason: 'LABEL_UNPARSEABLE', rawLabel: raw };
  const fraction = match[1];
  if ((fraction != null && /[1-9]/.test(fraction)) || ms % 1000 !== 0) {
    return { ok: false, reason: 'LABEL_NOT_SECOND_ALIGNED', rawLabel: raw };
  }
  return { ok: true, ms };
}

function buildObservation(
  label: string,
  labelMs: number,
  availability: NormalizedPositionObservation['availability'],
  sourceFamily: NormalizedPositionObservation['sourceFamily'],
  coords: { latitude: number; longitude: number } | null,
): NormalizedPositionObservation {
  const derivedFrom =
    availability === 'ROW_ABSENT'
      ? [DI_V0_POSITION_QUERY_SPEC_V0_1.id, ROW_ABSENT_DERIVATION]
      : [DI_V0_POSITION_QUERY_SPEC_V0_1.id];
  const observation: NormalizedPositionObservation = {
    bucketLabel: label,
    intervalStart: label,
    intervalEnd: formatBucketLabel(labelMs + DI_V0_POSITION_QUERY_SPEC_V0_1.intervalMs),
    // Same rendering as S1 `buildRowAbsentObservation` (midpoint, whole-second format); not a sample time.
    referenceTime: formatBucketLabel(labelMs + DI_V0_POSITION_QUERY_SPEC_V0_1.intervalMs / 2),
    availability,
    sourceFamily,
    provenance: { sourceSignal: DI_V0_POSITION_QUERY_SPEC_V0_1.signal, derivedFrom },
  };
  if (coords) {
    observation.latitude = coords.latitude;
    observation.longitude = coords.longitude;
  }
  return observation;
}

export interface NormalizeDiV0PositionInput {
  request: DiV0ValidatedPositionRequest;
  sourceFamilyResolution: DiV0SourceFamilyResolution;
  responseBody: unknown;
  acquiredAt: Date;
}

export type NormalizeDiV0PositionOutcome =
  | { ok: true; result: DiV0PositionAcquisitionResult }
  | { ok: false; failure: DiV0PositionAcquisitionFailure };

function extractProviderRows(
  body: unknown,
): { ok: true; rows: unknown[]; signalsNull: boolean } | { ok: false; failure: DiV0PositionAcquisitionFailure } {
  if (!isPlainObject(body)) {
    return { ok: false, failure: buildFailure('MALFORMED_RESPONSE', null, 'response body is not an object') };
  }
  const errors = body.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const messages = errors
      .map((e) => (isPlainObject(e) && typeof e.message === 'string' ? e.message : 'GraphQL error'))
      .join('; ');
    return { ok: false, failure: buildFailure('GRAPHQL_ERROR', null, messages) };
  }
  const data = body.data;
  if (!isPlainObject(data)) {
    return { ok: false, failure: buildFailure('MALFORMED_RESPONSE', null, 'response has no data object') };
  }
  if (!Object.prototype.hasOwnProperty.call(data, 'signals')) {
    return { ok: false, failure: buildFailure('MALFORMED_RESPONSE', null, 'data.signals missing') };
  }
  const signals = data.signals;
  if (signals === null) {
    return { ok: true, rows: [], signalsNull: true };
  }
  if (!Array.isArray(signals)) {
    return { ok: false, failure: buildFailure('MALFORMED_RESPONSE', null, 'data.signals is not an array') };
  }
  return { ok: true, rows: signals, signalsNull: false };
}

/**
 * Pure S3A normalization: provider rows → expected 1 s grid → PRESENT / SIGNAL_NULL / ROW_ABSENT.
 * No interpolation, fill-forward, snapping, hold/release, or motion inference.
 */
export function normalizeDiV0PositionResponse(input: NormalizeDiV0PositionInput): NormalizeDiV0PositionOutcome {
  const extracted = extractProviderRows(input.responseBody);
  if (!extracted.ok) return extracted;

  const { request, sourceFamilyResolution } = input;
  const { window } = request;
  const sourceFamily = sourceFamilyResolution.sourceFamily;
  const intervalMs = DI_V0_POSITION_QUERY_SPEC_V0_1.intervalMs;

  const rowsByIndex = new Map<number, Record<string, unknown>[]>();
  const rejectedProviderRows: DiV0RejectedProviderRow[] = [];
  let outsideWindowRows = 0;

  for (const row of extracted.rows) {
    if (!isPlainObject(row)) {
      rejectedProviderRows.push({ reason: 'ROW_NOT_OBJECT', rawLabel: null });
      continue;
    }
    const parsed = parseProviderLabel(row[DI_V0_POSITION_QUERY_SPEC_V0_1.bucketLabelField]);
    if (!parsed.ok) {
      rejectedProviderRows.push({ reason: parsed.reason, rawLabel: parsed.rawLabel });
      continue;
    }
    if (parsed.ms < window.fromMs || parsed.ms >= window.toMs) {
      outsideWindowRows += 1;
      rejectedProviderRows.push({ reason: 'LABEL_OUTSIDE_WINDOW', rawLabel: formatBucketLabel(parsed.ms) });
      continue;
    }
    const index = (parsed.ms - window.fromMs) / intervalMs;
    const bucketRows = rowsByIndex.get(index);
    if (bucketRows) bucketRows.push(row);
    else rowsByIndex.set(index, [row]);
  }

  const buckets: DiV0AcquiredPositionBucket[] = new Array(window.expectedBucketCount);
  const conflictKeysByLabel = new Map<string, string[]>();
  const counters: DiV0PositionAcquisitionCounters = {
    requestedBuckets: window.expectedBucketCount,
    providerRows: extracted.rows.length,
    matchedProviderRows: 0,
    rejectedProviderRows: rejectedProviderRows.length,
    outsideWindowRows,
    present: 0,
    presentUsable: 0,
    signalNull: 0,
    rowAbsent: 0,
    invalidCoordinate: 0,
    duplicateBuckets: 0,
    duplicateIdenticalBuckets: 0,
    duplicateConflictingBuckets: 0,
  };

  for (let i = 0; i < window.expectedBucketCount; i++) {
    const labelMs = window.fromMs + i * intervalMs;
    const label = formatBucketLabel(labelMs);
    const rows = rowsByIndex.get(i) ?? [];
    const anomalies: DiV0BucketAnomaly[] = [];
    counters.matchedProviderRows += rows.length;

    if (rows.length === 0) {
      counters.rowAbsent += 1;
      buckets[i] = {
        bucketLabel: label,
        availability: 'ROW_ABSENT',
        coordinateStatus: 'NOT_APPLICABLE',
        temporalConfidence: 'UNKNOWN',
        providerRowCount: 0,
        anomalies,
        observation: buildObservation(label, labelMs, 'ROW_ABSENT', sourceFamily, null),
      };
      continue;
    }

    const evidences = rows.map(evaluateRowLocation);
    let evidence: RowLocationEvidence | null = evidences[0];
    if (rows.length > 1) {
      counters.duplicateBuckets += 1;
      const keys = [...new Set(evidences.map(evidenceKey))].sort();
      if (keys.length === 1) {
        counters.duplicateIdenticalBuckets += 1;
        anomalies.push('DUPLICATE_BUCKET_IDENTICAL');
      } else {
        counters.duplicateConflictingBuckets += 1;
        anomalies.push('DUPLICATE_BUCKET_CONFLICTING');
        conflictKeysByLabel.set(label, keys);
        evidence = null;
      }
    }

    let availability: NormalizedPositionObservation['availability'];
    let coordinateStatus: DiV0CoordinateStatus;
    let temporalConfidence: TemporalConfidence = 'UNKNOWN';
    let coords: { latitude: number; longitude: number } | null = null;

    if (evidence == null) {
      availability = 'PRESENT';
      coordinateStatus = 'CONFLICTING_DUPLICATE';
    } else if (evidence.kind === 'SIGNAL_NULL') {
      availability = 'SIGNAL_NULL';
      coordinateStatus = 'NOT_APPLICABLE';
    } else if (evidence.kind === 'INVALID') {
      availability = 'PRESENT';
      coordinateStatus = evidence.status;
      anomalies.push('INVALID_COORDINATE');
    } else {
      availability = 'PRESENT';
      coordinateStatus = 'VALID';
      temporalConfidence = 'BUCKET_BOUNDED';
      coords = { latitude: evidence.latitude, longitude: evidence.longitude };
    }

    if (availability === 'SIGNAL_NULL') {
      counters.signalNull += 1;
    } else {
      counters.present += 1;
      if (coordinateStatus === 'VALID') counters.presentUsable += 1;
      if (anomalies.includes('INVALID_COORDINATE')) counters.invalidCoordinate += 1;
    }

    buckets[i] = {
      bucketLabel: label,
      availability,
      coordinateStatus,
      temporalConfidence,
      providerRowCount: rows.length,
      anomalies,
      observation: buildObservation(label, labelMs, availability, sourceFamily, coords),
    };
  }

  const qualityFlags: DiV0AcquisitionQualityFlag[] = [];
  if (extracted.rows.length === 0) qualityFlags.push('NO_PROVIDER_ROWS');
  if (extracted.signalsNull) qualityFlags.push('PROVIDER_SIGNALS_NULL');
  if (rejectedProviderRows.length > outsideWindowRows) qualityFlags.push('PROVIDER_ROWS_REJECTED');
  if (outsideWindowRows > 0) qualityFlags.push('ROWS_OUTSIDE_WINDOW');
  if (counters.duplicateBuckets > 0) qualityFlags.push('DUPLICATE_BUCKETS_PRESENT');
  if (counters.duplicateConflictingBuckets > 0) qualityFlags.push('CONFLICTING_DUPLICATE_BUCKETS');
  if (counters.invalidCoordinate > 0) qualityFlags.push('INVALID_COORDINATES_PRESENT');

  const snapshotIdentity = computeDiV0PositionSnapshotIdentity({
    dimoTokenId: request.dimoTokenId,
    vehicleId: request.vehicleId,
    window,
    sourceFamily,
    sourceFamilyPolicyVersion: sourceFamilyResolution.policyVersion,
    providerSignalsNull: extracted.signalsNull,
    buckets,
    conflictKeysByLabel,
    rejectedProviderRows,
  });

  return {
    ok: true,
    result: {
      sourceFamily,
      sourceFamilyResolution,
      requestedWindow: window,
      querySpecification: DI_V0_POSITION_QUERY_SPEC_V0_1,
      expectedBucketCount: window.expectedBucketCount,
      providerRowCount: extracted.rows.length,
      presentCount: counters.present,
      signalNullCount: counters.signalNull,
      rowAbsentCount: counters.rowAbsent,
      duplicateBucketCount: counters.duplicateBuckets,
      invalidCoordinateCount: counters.invalidCoordinate,
      counters,
      qualityFlags,
      rejectedProviderRows,
      buckets,
      observations: buckets.map((b) => b.observation),
      snapshotIdentity,
      acquisitionProvenance: {
        provider: DI_V0_POSITION_QUERY_SPEC_V0_1.provider,
        queryFamily: DI_V0_POSITION_QUERY_SPEC_V0_1.queryFamily,
        querySpecificationId: DI_V0_POSITION_QUERY_SPEC_V0_1.id,
        interval: DI_V0_POSITION_QUERY_SPEC_V0_1.interval,
        coordinateAggregation: DI_V0_POSITION_QUERY_SPEC_V0_1.coordinateAggregation,
        organizationId: request.organizationId,
        vehicleId: request.vehicleId,
        tripId: request.tripId,
        dimoTokenId: request.dimoTokenId,
        requestedFromUtc: window.fromUtc,
        requestedToUtc: window.toUtc,
        sourceFamilyPolicyVersion: sourceFamilyResolution.policyVersion,
        adapterVersion: DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1,
        acquiredAtUtc: input.acquiredAt.toISOString(),
      },
    },
  };
}
