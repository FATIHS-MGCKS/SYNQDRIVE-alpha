import type { NormalizedR1ObdObservation } from '../core/types';
import { formatBucketLabel } from '../position-acquisition/di-v0-position-window';
import type { DiV0SourceFamilyResolution } from '../position-acquisition/di-v0-position-acquisition.types';
import {
  buildR1ObdFailure,
  classifyDiV0R1ObdTransportError,
} from './di-v0-r1-obd-errors';
import { computeDiV0R1ObdSnapshotIdentity } from './di-v0-r1-obd-snapshot';
import type {
  DiV0R1ObdAcquiredBucket,
  DiV0R1ObdAcquisitionFailure,
  DiV0R1ObdAcquisitionResult,
  DiV0R1ObdQualityFlag,
  DiV0R1ObdScalarSignal,
  DiV0R1SignalAvailability,
  DiV0ValidatedR1ObdRequest,
} from './di-v0-r1-obd-acquisition.types';
import {
  DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_3,
  DI_V0_R1_OBD_QUERY_SPEC_V0_3,
} from './di-v0-r1-obd-acquisition.versions';

const PROVIDER_LABEL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d+))?(?:Z|[+-]\d{2}:\d{2})$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function parseProviderLabel(raw: unknown): { ok: true; ms: number } | { ok: false } {
  if (typeof raw !== 'string') return { ok: false };
  const match = PROVIDER_LABEL.exec(raw);
  if (!match) return { ok: false };
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms) || ms % 1000 !== 0) return { ok: false };
  const fraction = match[1];
  if (fraction != null && /[1-9]/.test(fraction)) return { ok: false };
  return { ok: true, ms };
}

function evaluateNumericSignal(
  row: Record<string, unknown>,
  field: string,
  rowAbsent: boolean,
): DiV0R1ObdScalarSignal {
  const spec = DI_V0_R1_OBD_QUERY_SPEC_V0_3.signals.find((s) => s.providerField === field)!;
  if (rowAbsent) {
    return { signal: spec.id, unit: spec.unit, availability: 'ROW_ABSENT', value: null };
  }
  if (!Object.prototype.hasOwnProperty.call(row, field)) {
    return { signal: spec.id, unit: spec.unit, availability: 'SIGNAL_NULL', value: null };
  }
  const raw = row[field];
  if (raw === null) {
    return { signal: spec.id, unit: spec.unit, availability: 'SIGNAL_NULL', value: null };
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return { signal: spec.id, unit: spec.unit, availability: 'SIGNAL_NULL', value: null };
  }
  if (field === 'speed' && raw < 0) {
    return { signal: spec.id, unit: spec.unit, availability: 'SIGNAL_NULL', value: null };
  }
  return { signal: spec.id, unit: spec.unit, availability: 'VALUE_PRESENT', value: raw };
}

function compareNullableNumber(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a - b;
}

/**
 * Per-signal merge of all rows sharing one bucket label. Agreeing rows collapse; any
 * disagreement (including value vs null) withholds only that signal. Order-independent.
 */
function mergeDuplicateSignal(rows: Record<string, unknown>[], field: string): DiV0R1ObdScalarSignal {
  const evaluated = rows.map((row) => evaluateNumericSignal(row, field, false));
  const first = evaluated[0];
  const agrees = evaluated.every((s) => s.availability === first.availability && s.value === first.value);
  if (agrees) return first;
  const distinct: (number | null)[] = [];
  for (const s of evaluated) {
    const v = s.availability === 'VALUE_PRESENT' ? s.value : null;
    if (!distinct.some((d) => d === v)) distinct.push(v);
  }
  distinct.sort(compareNullableNumber);
  return {
    signal: first.signal,
    unit: first.unit,
    availability: 'CONFLICTING_DUPLICATE',
    value: null,
    conflictingValues: distinct,
  };
}

function toNormalizedObservation(bucket: DiV0R1ObdAcquiredBucket): NormalizedR1ObdObservation | null {
  if (bucket.rowAvailability === 'ROW_ABSENT') return null;
  const get = (id: DiV0R1ObdScalarSignal['signal']) =>
    bucket.signals.find((s) => s.signal === id);
  const obs: NormalizedR1ObdObservation = {
    bucketLabel: bucket.bucketLabel,
    temporalConfidence: 'INTERVAL_ONLY',
    provenance: {
      sourceSignal: DI_V0_R1_OBD_QUERY_SPEC_V0_3.id,
      derivedFrom: [DI_V0_R1_OBD_QUERY_SPEC_V0_3.id, 'INTERVAL_ONLY'],
    },
  };
  const speed = get('speed');
  if (speed?.availability === 'VALUE_PRESENT' && speed.value != null) obs.speedKmh = speed.value;
  const rpm = get('powertrainCombustionEngineSpeed');
  if (rpm?.availability === 'VALUE_PRESENT' && rpm.value != null) obs.rpm = rpm.value;
  const tps = get('obdThrottlePosition');
  if (tps?.availability === 'VALUE_PRESENT' && tps.value != null) obs.throttlePct = tps.value;
  const load = get('obdEngineLoad');
  if (load?.availability === 'VALUE_PRESENT' && load.value != null) obs.loadPct = load.value;
  const ect = get('powertrainCombustionEngineECT');
  if (ect?.availability === 'VALUE_PRESENT' && ect.value != null) obs.coolantC = ect.value;
  return obs;
}

function computeGapFlags(
  buckets: DiV0R1ObdAcquiredBucket[],
  longGapThresholdSeconds: number,
): void {
  let lastSpeedLabelMs: number | null = null;
  for (const bucket of buckets) {
    const speed = bucket.signals.find((s) => s.signal === 'speed');
    const hasSpeed = speed?.availability === 'VALUE_PRESENT';
    const labelMs = Date.parse(bucket.bucketLabel);
    if (hasSpeed) {
      if (lastSpeedLabelMs != null) {
        const gapSec = (labelMs - lastSpeedLabelMs) / 1000;
        if (gapSec > longGapThresholdSeconds) {
          if (!bucket.qualityFlags.includes('LONG_GAP')) bucket.qualityFlags.push('LONG_GAP');
        }
      }
      lastSpeedLabelMs = labelMs;
    }
  }
}

export interface NormalizeDiV0R1ObdInput {
  request: DiV0ValidatedR1ObdRequest;
  sourceFamilyResolution: DiV0SourceFamilyResolution;
  responseBody: unknown;
  longGapThresholdSeconds: number;
}

export type NormalizeDiV0R1ObdOutcome =
  | { ok: true; result: DiV0R1ObdAcquisitionResult }
  | { ok: false; failure: DiV0R1ObdAcquisitionFailure };

function extractProviderRows(
  body: unknown,
): { ok: true; rows: unknown[]; signalsNull: boolean } | { ok: false; failure: DiV0R1ObdAcquisitionFailure } {
  if (!isPlainObject(body)) {
    return { ok: false, failure: buildR1ObdFailure('MALFORMED_RESPONSE', 'response body is not an object') };
  }
  const errors = body.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const messages = errors
      .map((e) => (isPlainObject(e) && typeof e.message === 'string' ? e.message : 'GraphQL error'))
      .join('; ');
    return { ok: false, failure: buildR1ObdFailure('GRAPHQL_ERROR', messages) };
  }
  const data = body.data;
  if (!isPlainObject(data) || !Object.prototype.hasOwnProperty.call(data, 'signals')) {
    return { ok: false, failure: buildR1ObdFailure('MALFORMED_RESPONSE', 'data.signals missing') };
  }
  const signals = data.signals;
  if (signals === null) return { ok: true, rows: [], signalsNull: true };
  if (!Array.isArray(signals)) {
    return { ok: false, failure: buildR1ObdFailure('MALFORMED_RESPONSE', 'data.signals is not an array') };
  }
  return { ok: true, rows: signals, signalsNull: false };
}

export function normalizeDiV0R1ObdResponse(input: NormalizeDiV0R1ObdInput): NormalizeDiV0R1ObdOutcome {
  const extracted = extractProviderRows(input.responseBody);
  if (!extracted.ok) return extracted;

  const { request, sourceFamilyResolution, longGapThresholdSeconds } = input;
  const { window } = request;
  const intervalMs = DI_V0_R1_OBD_QUERY_SPEC_V0_3.intervalMs;
  const rowsByIndex = new Map<number, Record<string, unknown>[]>();

  for (const row of extracted.rows) {
    if (!isPlainObject(row)) continue;
    const parsed = parseProviderLabel(row[DI_V0_R1_OBD_QUERY_SPEC_V0_3.bucketLabelField]);
    if (!parsed.ok) continue;
    if (parsed.ms < window.fromMs || parsed.ms >= window.toMs) continue;
    const index = (parsed.ms - window.fromMs) / intervalMs;
    const existing = rowsByIndex.get(index);
    if (existing) existing.push(row);
    else rowsByIndex.set(index, [row]);
  }

  const buckets: DiV0R1ObdAcquiredBucket[] = [];
  let rowAbsent = 0;
  let rowPresent = 0;
  let speedValuePresent = 0;
  let duplicateBuckets = 0;
  let conflictingDuplicateBuckets = 0;

  for (let i = 0; i < window.expectedBucketCount; i++) {
    const labelMs = window.fromMs + i * intervalMs;
    const label = formatBucketLabel(labelMs);
    const rows = rowsByIndex.get(i) ?? [];
    const rowAbsentBucket = rows.length === 0;
    if (rowAbsentBucket) rowAbsent += 1;
    else rowPresent += 1;

    const signals = DI_V0_R1_OBD_QUERY_SPEC_V0_3.signals.map((s) =>
      rows.length > 1
        ? mergeDuplicateSignal(rows, s.providerField)
        : evaluateNumericSignal(rows[0] ?? {}, s.providerField, rowAbsentBucket),
    );
    if (signals.find((s) => s.signal === 'speed')?.availability === 'VALUE_PRESENT') {
      speedValuePresent += 1;
    }

    const qualityFlags: DiV0R1ObdQualityFlag[] = ['TEMPORAL_UNCERTAINTY'];
    if (rows.length > 1) {
      duplicateBuckets += 1;
      if (signals.some((s) => s.availability === 'CONFLICTING_DUPLICATE')) {
        conflictingDuplicateBuckets += 1;
        qualityFlags.push('DUPLICATE_BUCKET_CONFLICTING');
      } else {
        qualityFlags.push('DUPLICATE_BUCKET_IDENTICAL');
      }
    }

    buckets.push({
      bucketLabel: label,
      rowAvailability: rowAbsentBucket ? 'ROW_ABSENT' : 'ROW_PRESENT',
      providerRowCount: rows.length,
      temporalSemantics: 'INTERVAL_ONLY',
      signals,
      qualityFlags,
    });
  }

  computeGapFlags(buckets, longGapThresholdSeconds);

  const coverage = speedValuePresent / Math.max(1, window.expectedBucketCount);
  const qualityFlags: DiV0R1ObdQualityFlag[] = ['TEMPORAL_UNCERTAINTY'];
  if (extracted.signalsNull || extracted.rows.length === 0) qualityFlags.push('NO_PROVIDER_ROWS');
  if (extracted.signalsNull) qualityFlags.push('PROVIDER_SIGNALS_NULL');
  if (coverage < 0.15) qualityFlags.push('SPARSE_SIGNAL');
  if (buckets.some((b) => b.qualityFlags.includes('LONG_GAP'))) qualityFlags.push('LONG_GAP');
  if (buckets.some((b) => b.qualityFlags.includes('DUPLICATE_BUCKET_IDENTICAL'))) {
    qualityFlags.push('DUPLICATE_BUCKET_IDENTICAL');
  }
  if (conflictingDuplicateBuckets > 0) qualityFlags.push('DUPLICATE_BUCKET_CONFLICTING');

  const observations = buckets
    .map(toNormalizedObservation)
    .filter((o): o is NormalizedR1ObdObservation => o != null);

  const snapshotIdentity = computeDiV0R1ObdSnapshotIdentity({
    dimoTokenId: request.dimoTokenId,
    vehicleId: request.vehicleId,
    window,
    sourceFamily: sourceFamilyResolution.sourceFamily,
    sourceFamilyPolicyVersion: sourceFamilyResolution.policyVersion,
    buckets,
  });

  return {
    ok: true,
    result: {
      adapterVersion: DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_3,
      querySpecId: DI_V0_R1_OBD_QUERY_SPEC_V0_3.id,
      sourceFamily: sourceFamilyResolution.sourceFamily,
      sourceFamilyResolution,
      window,
      buckets,
      observations,
      qualityFlags,
      counters: {
        requestedBuckets: window.expectedBucketCount,
        providerRows: extracted.rows.length,
        rowAbsent,
        rowPresent,
        speedValuePresent,
        duplicateBuckets,
        conflictingDuplicateBuckets,
      },
      snapshotIdentity,
      fixedTimeCorrectionApplied: false,
    },
  };
}

export function normalizeDiV0R1ObdFromProviderRows(
  request: DiV0ValidatedR1ObdRequest,
  sourceFamilyResolution: DiV0SourceFamilyResolution,
  rows: unknown[],
  options: { longGapThresholdSeconds?: number } = {},
): NormalizeDiV0R1ObdOutcome {
  try {
    return normalizeDiV0R1ObdResponse({
      request,
      sourceFamilyResolution,
      responseBody: { data: { signals: rows } },
      longGapThresholdSeconds: options.longGapThresholdSeconds ?? 120,
    });
  } catch (error) {
    return { ok: false, failure: classifyDiV0R1ObdTransportError(error) };
  }
}
