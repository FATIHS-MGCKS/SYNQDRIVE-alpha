/**
 * RD003 HF runtime validation — acquisition-order proofs for watermark monotonicity
 * and per-execution query window boundedness.
 *
 * Used by reference-capture-drive-003-reanalyze.ts and unit tests.
 */
import { HF_QUERY_OVERLAP_MS } from './reference-capture-hf-watermark-policy';
import { sortByAcquisitionOrder, type SignalMetricsObsRow } from './reference-capture-signal-metrics';

export type HfRuntimeObservationRow = SignalMetricsObsRow & {
  provenanceJson?: Record<string, unknown> | null;
};

export type HfQueryExecution = {
  providerField: string;
  requestStartedAtMs: number;
  hfWindowFromMs: number;
  hfWindowToMs: number;
  hfActualQueryToMs: number;
  maxProviderTimestampMs: number | null;
};

export type HfValidationViolation = {
  providerField: string;
  executionIndex: number;
  code: string;
  detail: string;
};

export type HfFieldWatermarkValidation = {
  providerField: string;
  executionCount: number;
  validated: boolean;
  violations: HfValidationViolation[];
};

export type HfFieldBoundedValidation = {
  providerField: string;
  executionCount: number;
  validated: boolean;
  violations: HfValidationViolation[];
  windowMs: { p50: number | null; p95: number | null; max: number | null };
};

function toMs(v: Date | string | null | undefined): number | null {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

/** Group HF rows into unique per-field query executions in acquisition order. */
export function groupHfQueryExecutionsByField(
  hfRows: HfRuntimeObservationRow[],
): Map<string, HfQueryExecution[]> {
  const byField = new Map<string, Map<string, HfQueryExecution>>();
  const ordered = sortByAcquisitionOrder(hfRows);

  for (const row of ordered) {
    const field = row.providerField ?? 'UNKNOWN';
    const prov = row.provenanceJson ?? {};
    const fromMs = toMs(prov.hfWindowFrom as string | undefined);
    const toMsVal = toMs(prov.hfWindowTo as string | undefined);
    const qtoMs = toMs(prov.hfActualQueryTo as string | undefined);
    const reqMs = toMs(row.requestStartedAt);
    if (fromMs == null || toMsVal == null || qtoMs == null || reqMs == null) continue;

    const key = `${reqMs}|${fromMs}|${toMsVal}`;
    if (!byField.has(field)) byField.set(field, new Map());
    const fieldMap = byField.get(field)!;
    if (!fieldMap.has(key)) {
      fieldMap.set(key, {
        providerField: field,
        requestStartedAtMs: reqMs,
        hfWindowFromMs: fromMs,
        hfWindowToMs: toMsVal,
        hfActualQueryToMs: qtoMs,
        maxProviderTimestampMs: null,
      });
    }
    const exec = fieldMap.get(key)!;
    const ptMs = toMs(row.providerTimestamp);
    if (ptMs != null) {
      exec.maxProviderTimestampMs =
        exec.maxProviderTimestampMs == null ? ptMs : Math.max(exec.maxProviderTimestampMs, ptMs);
    }
  }

  const result = new Map<string, HfQueryExecution[]>();
  for (const [field, fieldMap] of byField) {
    result.set(
      field,
      [...fieldMap.values()].sort((a, b) => {
        if (a.requestStartedAtMs !== b.requestStartedAtMs) {
          return a.requestStartedAtMs - b.requestStartedAtMs;
        }
        return a.hfWindowFromMs - b.hfWindowFromMs;
      }),
    );
  }
  return result;
}

/**
 * Validate per-field watermark monotonicity in actual acquisition / request execution order.
 * Does NOT sort windowTo values lexicographically or numerically post-hoc.
 */
export function validateFieldWatermarkSequence(
  providerField: string,
  executions: HfQueryExecution[],
  overlapMs: number = HF_QUERY_OVERLAP_MS,
): HfFieldWatermarkValidation {
  const violations: HfValidationViolation[] = [];
  let prevWatermarkToMs: number | null = null;

  for (let i = 0; i < executions.length; i++) {
    const exec = executions[i];
    if (exec.hfWindowToMs !== exec.hfActualQueryToMs) {
      violations.push({
        providerField,
        executionIndex: i,
        code: 'WINDOW_TO_QUERY_TO_MISMATCH',
        detail: `hfWindowTo ${exec.hfWindowToMs} != hfActualQueryTo ${exec.hfActualQueryToMs}`,
      });
    }
    if (prevWatermarkToMs != null) {
      if (exec.hfWindowToMs < prevWatermarkToMs) {
        violations.push({
          providerField,
          executionIndex: i,
          code: 'WATERMARK_REGRESSION',
          detail: `hfWindowTo ${exec.hfWindowToMs} < previous ${prevWatermarkToMs}`,
        });
      }
      if (exec.hfWindowFromMs < prevWatermarkToMs - overlapMs) {
        violations.push({
          providerField,
          executionIndex: i,
          code: 'FROM_REGRESSION_BEYOND_OVERLAP',
          detail: `hfWindowFrom ${exec.hfWindowFromMs} < previous watermark ${prevWatermarkToMs} - overlap ${overlapMs}`,
        });
      }
    }
    prevWatermarkToMs = exec.hfWindowToMs;
  }

  return {
    providerField,
    executionCount: executions.length,
    validated: violations.length === 0,
    violations,
  };
}

/**
 * Validate per-execution query window boundedness in acquisition order.
 */
export function validateFieldQueryWindowBounded(
  providerField: string,
  executions: HfQueryExecution[],
  sessionStartedAtMs: number,
  options: {
    overlapMs?: number;
    maxWindowMs?: number;
  } = {},
): HfFieldBoundedValidation {
  const overlapMs = options.overlapMs ?? HF_QUERY_OVERLAP_MS;
  const maxWindowMs = options.maxWindowMs ?? 15_000;
  const violations: HfValidationViolation[] = [];
  const windowSizes: number[] = [];
  let prevQueryToMs: number | null = null;
  let prevFromMs: number | null = null;

  for (let i = 0; i < executions.length; i++) {
    const exec = executions[i];
    const windowMs = exec.hfWindowToMs - exec.hfWindowFromMs;
    windowSizes.push(windowMs);

    if (windowMs <= 0) {
      violations.push({
        providerField,
        executionIndex: i,
        code: 'NON_POSITIVE_WINDOW',
        detail: `windowMs=${windowMs}`,
      });
    }
    if (windowMs > maxWindowMs) {
      violations.push({
        providerField,
        executionIndex: i,
        code: 'UNBOUNDED_QUERY_WINDOW',
        detail: `windowMs=${windowMs} exceeds max ${maxWindowMs}`,
      });
    }
    if (exec.hfWindowToMs !== exec.hfActualQueryToMs) {
      violations.push({
        providerField,
        executionIndex: i,
        code: 'QUERY_TO_BOUNDARY_MISMATCH',
        detail: `hfWindowTo != hfActualQueryTo`,
      });
    }
    if (i > 0 && exec.hfWindowFromMs === sessionStartedAtMs && prevQueryToMs != null) {
      violations.push({
        providerField,
        executionIndex: i,
        code: 'STALE_SESSION_START_PIN',
        detail: `hfWindowFrom pinned to session start after prior coverage`,
      });
    }
    if (prevFromMs != null && exec.hfWindowFromMs < prevFromMs - overlapMs) {
      violations.push({
        providerField,
        executionIndex: i,
        code: 'FROM_REGRESSION_BEYOND_OVERLAP',
        detail: `hfWindowFrom regressed beyond allowed overlap`,
      });
    }
    if (prevQueryToMs != null && exec.hfActualQueryToMs < prevQueryToMs) {
      violations.push({
        providerField,
        executionIndex: i,
        code: 'QUERY_COVERAGE_REGRESSION',
        detail: `hfActualQueryTo ${exec.hfActualQueryToMs} < previous ${prevQueryToMs}`,
      });
    }

    prevQueryToMs = exec.hfActualQueryToMs;
    prevFromMs = exec.hfWindowFromMs;
  }

  const sorted = [...windowSizes].sort((a, b) => a - b);
  return {
    providerField,
    executionCount: executions.length,
    validated: violations.length === 0,
    violations,
    windowMs: {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      max: sorted.length ? sorted[sorted.length - 1] : null,
    },
  };
}

export type HfIdempotencyEvidence = {
  duplicateAggregateBucketIdentities: number;
  duplicateRetrievalObservations: number;
  explicitSameIdentityDedupProofObservations: number;
  NO_DUPLICATE_AGGREGATE_BUCKET_IDENTITIES_OBSERVED: 'YES' | 'NO';
  HF_IDEMPOTENCY_RUNTIME_VALIDATED: 'YES' | 'NO' | 'NOT_EXERCISED' | 'PARTIAL';
  HF_LATE_ARRIVAL_RECOVERY_RUNTIME_OBSERVED: 'YES' | 'NOT_EXERCISED';
  idempotencyEvidenceNote: string;
};

/** YES requires both fields; current RD003 sealed schema does not emit them. */
export const IDEMPOTENCY_EXPLICIT_PROOF_FIELDS = [
  'idempotencyDedupSuppressed',
  'retriedCanonicalIdentity',
] as const;

function readRetriedCanonicalIdentity(prov: Record<string, unknown>): string {
  const candidate =
    prov.retriedCanonicalIdentity ??
    prov.retriedAggregateBucketIdentity ??
    prov.bucketIdentity ??
    '';
  return String(candidate).trim();
}

/**
 * Explicit same-identity dedup proof: a retry marker names a canonical identity
 * that already exists in the export AND declares persistence dedup suppression.
 */
export function hasExplicitSameIdentityDedupProof(
  prov: Record<string, unknown>,
  persistedCanonicalIdentities: Set<string>,
): boolean {
  const suppressed =
    prov.idempotencyDedupSuppressed === true || prov.persistenceDedupSuppressed === true;
  const retriedIdentity = readRetriedCanonicalIdentity(prov);
  if (!suppressed || !retriedIdentity) return false;
  return persistedCanonicalIdentities.has(retriedIdentity);
}

/**
 * Classify HF idempotency evidence conservatively.
 *
 * Absence of duplicate persisted bucket identities proves only that no duplicate
 * identities were observed — NOT that runtime idempotency was exercised.
 * YES requires explicit proof that the same canonical identity was retried and
 * persistence deduplication suppressed the duplicate. duplicateRetrieval alone
 * is insufficient and yields PARTIAL at most.
 */
export function classifyHfIdempotencyEvidence(hfRows: HfRuntimeObservationRow[]): HfIdempotencyEvidence {
  let duplicateBuckets = 0;
  let duplicateRetrieval = 0;
  let explicitProofCount = 0;
  const bucketGlobal = new Set<string>();
  const persistedCanonicalIdentities = new Set<string>();

  for (const row of hfRows) {
    const prov = row.provenanceJson ?? {};
    const bucket = String(prov.aggregateBucketIdentity ?? '');
    if (bucket) {
      if (bucketGlobal.has(bucket)) duplicateBuckets++;
      bucketGlobal.add(bucket);
      persistedCanonicalIdentities.add(bucket);
    }
    if (row.physicalSampleFingerprint) {
      persistedCanonicalIdentities.add(String(row.physicalSampleFingerprint));
    }
    if (prov.duplicateRetrieval === true) duplicateRetrieval++;
  }

  for (const row of hfRows) {
    const prov = row.provenanceJson ?? {};
    if (hasExplicitSameIdentityDedupProof(prov, persistedCanonicalIdentities)) {
      explicitProofCount++;
    }
  }

  const noDuplicateObserved: 'YES' | 'NO' = duplicateBuckets === 0 ? 'YES' : 'NO';
  const hasExplicitProof = explicitProofCount > 0;

  let idempotencyValidated: HfIdempotencyEvidence['HF_IDEMPOTENCY_RUNTIME_VALIDATED'];
  let note: string;
  if (hasExplicitProof && duplicateBuckets === 0) {
    idempotencyValidated = 'YES';
    note =
      'explicit same-identity retry/dedup suppression proof observed with zero duplicate persisted identities';
  } else if (duplicateRetrieval > 0 && duplicateBuckets > 0) {
    idempotencyValidated = 'NO';
    note = 'duplicateRetrieval observed but duplicate aggregate bucket identities were persisted';
  } else if (duplicateBuckets > 0) {
    idempotencyValidated = 'NO';
    note = 'duplicate aggregate bucket identities persisted without exercised dedup evidence';
  } else if (duplicateRetrieval > 0) {
    idempotencyValidated = 'PARTIAL';
    note =
      'duplicateRetrieval observed without duplicate persistence, but no explicit same-identity dedup suppression proof in evidence schema';
  } else {
    idempotencyValidated = 'NOT_EXERCISED';
    note =
      'zero duplicate persisted bucket identities observed; no duplicate/retry retrieval exercised — idempotency not proven';
  }

  return {
    duplicateAggregateBucketIdentities: duplicateBuckets,
    duplicateRetrievalObservations: duplicateRetrieval,
    explicitSameIdentityDedupProofObservations: explicitProofCount,
    NO_DUPLICATE_AGGREGATE_BUCKET_IDENTITIES_OBSERVED: noDuplicateObserved,
    HF_IDEMPOTENCY_RUNTIME_VALIDATED: idempotencyValidated,
    HF_LATE_ARRIVAL_RECOVERY_RUNTIME_OBSERVED: duplicateRetrieval > 0 ? 'YES' : 'NOT_EXERCISED',
    idempotencyEvidenceNote: note,
  };
}

export type HfRuntimeMechanismValidation = {
  HF_PHYSICAL_IDENTITY_VERSION: 'AGGREGATE_BUCKET_V2' | 'MIXED';
  HF_QUERY_WINDOW_BOUNDED_RUNTIME_VALIDATED: 'YES' | 'PARTIAL' | 'NO';
  HF_DATA_WATERMARK_RUNTIME_VALIDATED: 'YES' | 'PARTIAL' | 'NO';
  NO_DUPLICATE_AGGREGATE_BUCKET_IDENTITIES_OBSERVED: 'YES' | 'NO';
  HF_IDEMPOTENCY_RUNTIME_VALIDATED: 'YES' | 'NO' | 'NOT_EXERCISED' | 'PARTIAL';
  HF_LATE_ARRIVAL_RECOVERY_RUNTIME_OBSERVED: 'YES' | 'NOT_EXERCISED';
  duplicateAggregateBucketIdentities: number;
  duplicateRetrievalObservations: number;
  explicitSameIdentityDedupProofObservations: number;
  idempotencyEvidenceNote: string;
  nonV2IdentityRows: number;
  perFieldWatermark: HfFieldWatermarkValidation[];
  perFieldBounded: HfFieldBoundedValidation[];
  proofMethod: 'ACQUISITION_ORDER_PER_FIELD_EXECUTION';
};

export function validateHfRuntimeMechanisms(
  hfRows: HfRuntimeObservationRow[],
  sessionStartedAtMs: number,
): HfRuntimeMechanismValidation {
  let nonV2 = 0;

  for (const row of hfRows) {
    const prov = row.provenanceJson ?? {};
    if (prov.hfPhysicalIdentityVersion !== 'AGGREGATE_BUCKET_V2') nonV2++;
  }

  const idempotency = classifyHfIdempotencyEvidence(hfRows);

  const executionsByField = groupHfQueryExecutionsByField(hfRows);
  const perFieldWatermark: HfFieldWatermarkValidation[] = [];
  const perFieldBounded: HfFieldBoundedValidation[] = [];

  for (const [field, executions] of [...executionsByField.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    perFieldWatermark.push(validateFieldWatermarkSequence(field, executions));
    perFieldBounded.push(validateFieldQueryWindowBounded(field, executions, sessionStartedAtMs));
  }

  const allWatermarkPass = perFieldWatermark.every((f) => f.validated);
  const allBoundedPass = perFieldBounded.every((f) => f.validated);
  const anyWatermarkData = perFieldWatermark.some((f) => f.executionCount > 0);
  const anyBoundedData = perFieldBounded.some((f) => f.executionCount > 0);

  return {
    HF_PHYSICAL_IDENTITY_VERSION: nonV2 === 0 ? 'AGGREGATE_BUCKET_V2' : 'MIXED',
    HF_QUERY_WINDOW_BOUNDED_RUNTIME_VALIDATED: !anyBoundedData
      ? 'NO'
      : allBoundedPass
        ? 'YES'
        : 'PARTIAL',
    HF_DATA_WATERMARK_RUNTIME_VALIDATED: !anyWatermarkData
      ? 'NO'
      : allWatermarkPass
        ? 'YES'
        : 'PARTIAL',
    HF_IDEMPOTENCY_RUNTIME_VALIDATED: idempotency.HF_IDEMPOTENCY_RUNTIME_VALIDATED,
    HF_LATE_ARRIVAL_RECOVERY_RUNTIME_OBSERVED: idempotency.HF_LATE_ARRIVAL_RECOVERY_RUNTIME_OBSERVED,
    NO_DUPLICATE_AGGREGATE_BUCKET_IDENTITIES_OBSERVED:
      idempotency.NO_DUPLICATE_AGGREGATE_BUCKET_IDENTITIES_OBSERVED,
    duplicateAggregateBucketIdentities: idempotency.duplicateAggregateBucketIdentities,
    duplicateRetrievalObservations: idempotency.duplicateRetrievalObservations,
    explicitSameIdentityDedupProofObservations: idempotency.explicitSameIdentityDedupProofObservations,
    idempotencyEvidenceNote: idempotency.idempotencyEvidenceNote,
    nonV2IdentityRows: nonV2,
    perFieldWatermark,
    perFieldBounded,
    proofMethod: 'ACQUISITION_ORDER_PER_FIELD_EXECUTION',
  };
}
