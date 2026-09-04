/**
 * RD004-B.4 — HF_HISTORICAL capture completeness audit (read-only, no production changes).
 */
import {
  B3_108_VS_66_RESULT,
  B3_BROAD_REQUERY_SAMPLE_LOSS_PROOF_VALID,
  CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID,
  DIMO_BUCKET_SEMANTICS,
  type HfCaptureRootCause,
} from './reference-capture-rd004-b-hf-exact-window-replay';
import { DIMO_PROVIDER_SOURCE_AUTHORITY } from './reference-capture-hf-aggregate-bucket-analysis';
import {
  computePhysicalCadenceMetrics,
  identifyStaleHoldDuplicateRows,
} from './reference-capture-rd003-signal-quality';
import { dedupePhysicalSamples } from './reference-capture-rd003-video-gt-global-discovery-v2';
import { extractNumericValue } from './reference-capture-signal-metrics';
import type { Rd004ObservationRow } from './reference-capture-rd004-a-segment-a';
import { HF_AGGREGATE_BUCKET_INTERVAL_MS } from './reference-capture-hf-aggregate-bucket-analysis';

export const RD003_HF_SPEED_MEDIAN_CADENCE_REFERENCE_SECONDS = 2;

export const HF_CAPTURE_PIPELINE_TRACE = {
  provider: 'DIMO GraphQL signals(tokenId, from, to, interval)',
  acquisitionSurface: 'HF_HISTORICAL',
  requestedInterval: '1s',
  aggregation: 'AVG (provider-side aggregate buckets)',
  captureModule: 'reference-capture-acquisition.service.ts::captureHistoricalSurface',
  queryBuilder: 'reference-capture-query-builder.ts::buildBroadReferenceHistoricalSignalsQuery',
  watermarking: 'hfWatermarkState + hfQueryCoverageByField advance after persisted buckets',
  deduplication: 'physicalSampleFingerprint per field+timestamp+value+interval+aggregation',
  duplicatePolicy: 'IMMUTABLE_FIRST_SEEN — later revisions recorded separately',
  pagination: 'NONE — single GraphQL signals() query per capture cycle window',
  pageLimitRisk: 'NOT_APPLICABLE_TO_CURRENT_QUERY_SHAPE',
  segmentBSealPath:
    'full-session source-observations.jsonl → filter providerTimestamp envelope → segment-b source',
  segmentBSealMutatesProvider: 'NO — envelope filter only',
  productionRuntimeChanged: 'NO',
} as const;

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** @deprecated B.3 only — invalid for cross-origin bucket identity proof (see B.4). */
export function normalizeHfSpeedBucketTimestamp(iso: string): string {
  const ms = parseMs(iso);
  if (ms == null) return iso;
  const bucketStartMs =
    Math.floor(ms / HF_AGGREGATE_BUCKET_INTERVAL_MS) * HF_AGGREGATE_BUCKET_INTERVAL_MS;
  return new Date(bucketStartMs).toISOString();
}

export function extractSealedHfSpeedPhysicalTimestamps(rows: Rd004ObservationRow[]): string[] {
  const hf = rows.filter(
    (r) => r.providerField === 'speed' && r.acquisitionSurface === 'HF_HISTORICAL',
  );
  const stale = identifyStaleHoldDuplicateRows(hf);
  const deduped = dedupePhysicalSamples(hf).filter((r) => !stale.has(r.acquisitionOrdinal));
  return deduped
    .map((r) => r.providerTimestamp)
    .filter((t): t is string => typeof t === 'string')
    .sort();
}

export function compareHfSpeedTimestampSets(sealed: string[], requery: string[]) {
  const sealedNormalized = sealed.map(normalizeHfSpeedBucketTimestamp);
  const requeryNormalized = requery.map(normalizeHfSpeedBucketTimestamp);
  const sealedSet = new Set(sealedNormalized);
  const requerySet = new Set(requeryNormalized);
  const intersection = sealedNormalized.filter((t) => requerySet.has(t));
  const missingFromSealed = requeryNormalized.filter((t) => !sealedSet.has(t));
  const extraInSealed = sealedNormalized.filter((t) => !requerySet.has(t));

  return {
    CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID,
    B3_BROAD_REQUERY_SAMPLE_LOSS_PROOF_VALID,
    B3_108_VS_66_RESULT,
    comparisonMethodInvalidReason:
      'DIMO buckets are QUERY-FROM-ANCHORED; flooring timestamps across different query origins does not establish bucket identity equivalence',
    SEALED_HF_SPEED_COUNT: sealed.length,
    DIAGNOSTIC_REQUERY_HF_SPEED_COUNT: requery.length,
    SEALED_HF_SPEED_UNIQUE_BUCKET_COUNT: sealedSet.size,
    DIAGNOSTIC_REQUERY_HF_SPEED_UNIQUE_BUCKET_COUNT: requerySet.size,
    INTERSECTION_COUNT: new Set(intersection).size,
    MISSING_FROM_SEALED_COUNT: new Set(missingFromSealed).size,
    EXTRA_IN_SEALED_COUNT: new Set(extraInSealed).size,
    intersectionTimestamps: [...new Set(intersection)].sort(),
    missingFromSealedTimestamps: [...new Set(missingFromSealed)].sort(),
    extraInSealedTimestamps: [...new Set(extraInSealed)].sort(),
    comparisonNormalization: 'DEPRECATED_GLOBAL_1S_FLOOR_NOT_VALID_CROSS_ORIGIN',
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

export function auditSealedHfCaptureProvenance(
  allRows: Rd004ObservationRow[],
  envelopeRows: Rd004ObservationRow[],
  queryEnvelope: { startUtc: string; endUtc: string },
) {
  const hfAll = allRows.filter(
    (r) => r.providerField === 'speed' && r.acquisitionSurface === 'HF_HISTORICAL',
  );
  const hfEnvelope = envelopeRows.filter(
    (r) => r.providerField === 'speed' && r.acquisitionSurface === 'HF_HISTORICAL',
  );
  const cadence = computePhysicalCadenceMetrics(hfEnvelope);
  const staleDupes = identifyStaleHoldDuplicateRows(hfEnvelope);
  const physicalTimestamps = extractSealedHfSpeedPhysicalTimestamps(envelopeRows);

  const requestWindows = new Map<
    string,
    { hfWindowFrom: string; hfWindowTo: string; requestStartedAt: string; rowCount: number }
  >();
  for (const row of hfEnvelope) {
    const prov = (row.provenanceJson ?? {}) as Record<string, string>;
    const key = `${prov.hfWindowFrom ?? ''}|${prov.hfWindowTo ?? ''}|${row.requestStartedAt ?? ''}`;
    const existing = requestWindows.get(key);
    if (existing) existing.rowCount += 1;
    else {
      requestWindows.set(key, {
        hfWindowFrom: prov.hfWindowFrom ?? '',
        hfWindowTo: prov.hfWindowTo ?? '',
        requestStartedAt: row.requestStartedAt ?? '',
        rowCount: 1,
      });
    }
  }

  const fingerprintCounts = new Map<string, number>();
  for (const row of hfEnvelope) {
    const fp = row.physicalSampleFingerprint ?? 'null';
    fingerprintCounts.set(fp, (fingerprintCounts.get(fp) ?? 0) + 1);
  }
  const duplicateFingerprints = [...fingerprintCounts.entries()].filter(([, c]) => c > 1);

  const gaps: number[] = [];
  for (let i = 1; i < physicalTimestamps.length; i++) {
    gaps.push(
      (parseMs(physicalTimestamps[i])! - parseMs(physicalTimestamps[i - 1])!) / 1000,
    );
  }

  const fullSessionSpanSeconds =
    physicalTimestamps.length >= 2
      ? (parseMs(physicalTimestamps.at(-1)!)! - parseMs(physicalTimestamps[0]!)!) / 1000
      : null;
  const expectedAt2sHz = fullSessionSpanSeconds != null ? Math.floor(fullSessionSpanSeconds / 2) : null;

  return {
    pipelineTrace: HF_CAPTURE_PIPELINE_TRACE,
    queryEnvelope,
    fullSessionHfSpeedRowCount: hfAll.length,
    envelopeHfSpeedRowCount: hfEnvelope.length,
    uniquePhysicalSampleCount: cadence.UNIQUE_PHYSICAL_SAMPLE_COUNT,
    staleHoldDuplicateCount: staleDupes.size,
    medianPhysicalCadenceSeconds: cadence.NEW_PHYSICAL_SAMPLE_CADENCE_MEDIAN_SECONDS,
    p90PhysicalCadenceSeconds: cadence.NEW_PHYSICAL_SAMPLE_CADENCE_P90_SECONDS,
    maxGapSeconds: cadence.NEW_PHYSICAL_SAMPLE_CADENCE_MAX_GAP_SECONDS,
    uniqueHfRequestWindows: requestWindows.size,
    hfRequestWindows: [...requestWindows.values()].slice(0, 20),
    duplicatePhysicalFingerprintGroups: duplicateFingerprints.length,
    sampleLossFailureModesScreened: {
      paginationNotExhausted: 'NOT_APPLICABLE — no pagination in captureHistoricalSurface',
      apiResultLimit: 'UNKNOWN_WITHOUT_LIVE_REQUERY',
      pageCursorIgnored: 'NOT_APPLICABLE',
      queryWindowTooWide: 'POSSIBLE — watermark advances by actualQueryTo per cycle',
      latestPerIntervalOnly: 'NO — historical aggregate buckets retained',
      chunkBoundaryGaps: 'POSSIBLE — inspect hfWindowFrom/hfWindowTo per request',
      physicalFingerprintOverDedup: duplicateFingerprints.length > 0 ? 'OBSERVED_GROUPS' : 'NO_DUPLICATE_FPS_IN_ENVELOPE',
      envelopeTrimming: 'YES — segment B is envelope-filtered subset of full session',
      snapshotCadenceConfusion: 'SCREENED — physical cadence computed on deduped HF_HISTORICAL',
    },
    physicalTimestamps,
    cadenceFromPhysicalTimestamps: {
      medianGapSeconds: median(gaps),
      maxGapSeconds: gaps.length ? Math.max(...gaps) : null,
    },
    rd003Comparison: {
      rd003HfSpeedMedianCadenceSeconds: RD003_HF_SPEED_MEDIAN_CADENCE_REFERENCE_SECONDS,
      segmentBMedianCadenceSeconds: cadence.NEW_PHYSICAL_SAMPLE_CADENCE_MEDIAN_SECONDS,
      segmentASealedMedianCadenceSeconds: 4.732,
      expectedSamplesIf2sContinuous: expectedAt2sHz,
      actualPhysicalSamples: physicalTimestamps.length,
      coverageRatioVs2sContinuous:
        expectedAt2sHz != null && expectedAt2sHz > 0
          ? physicalTimestamps.length / expectedAt2sHz
          : null,
    },
  };
}

export type HfSparsityOrigin =
  | 'PROVIDER_OR_UPSTREAM_CONFIRMED'
  | 'CAPTURE_PIPELINE_SAMPLE_LOSS'
  | 'HISTORICAL_ENDPOINT_DOWNSAMPLING'
  | 'DATABASE_DOWNSAMPLING'
  | 'MIXED_CAUSES'
  | 'NOT_DETERMINABLE';

export function classifyHfSparsityOrigin(args: {
  sealedAudit: ReturnType<typeof auditSealedHfCaptureProvenance>;
  requeryComparison: ReturnType<typeof compareHfSpeedTimestampSets> | null;
  liveRequeryAttempted: boolean;
  liveRequerySucceeded: boolean;
  exactWindowReplay?: {
    HF_SPARSE_CADENCE_ORIGIN: string;
    HF_CAPTURE_COMPLETENESS_VALIDATED: 'YES' | 'NO' | 'PARTIAL';
    RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED: string;
    HF_CAPTURE_ROOT_CAUSE: HfCaptureRootCause;
  } | null;
}): {
  HF_SPARSE_CADENCE_ORIGIN: HfSparsityOrigin;
  HF_CAPTURE_COMPLETENESS_VALIDATED: 'YES' | 'NO' | 'PARTIAL';
  HF_CAPTURE_ROOT_CAUSE: HfCaptureRootCause;
  RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED: string;
} {
  if (args.exactWindowReplay) {
    const origin =
      args.exactWindowReplay.HF_SPARSE_CADENCE_ORIGIN === 'PROVIDER_OR_UPSTREAM_CONFIRMED'
        ? 'PROVIDER_OR_UPSTREAM_CONFIRMED'
        : 'NOT_DETERMINABLE';
    return {
      HF_SPARSE_CADENCE_ORIGIN: origin,
      HF_CAPTURE_COMPLETENESS_VALIDATED: args.exactWindowReplay.HF_CAPTURE_COMPLETENESS_VALIDATED,
      HF_CAPTURE_ROOT_CAUSE: args.exactWindowReplay.HF_CAPTURE_ROOT_CAUSE,
      RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED:
        args.exactWindowReplay.RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED,
    };
  }

  const { liveRequeryAttempted, liveRequerySucceeded } = args;

  if (args.requeryComparison && liveRequerySucceeded) {
    return {
      HF_SPARSE_CADENCE_ORIGIN: 'NOT_DETERMINABLE',
      HF_CAPTURE_COMPLETENESS_VALIDATED: 'PARTIAL',
      HF_CAPTURE_ROOT_CAUSE: 'QUERY_ORIGIN_MISMATCH',
      RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED:
        'B.3 broad requery density (e.g. 108 vs 66) is diagnostic only — cross-origin bucket identity comparison invalid until exact-window replay (B.4)',
    };
  }

  if (!liveRequeryAttempted) {
    return {
      HF_SPARSE_CADENCE_ORIGIN: 'NOT_DETERMINABLE',
      HF_CAPTURE_COMPLETENESS_VALIDATED: 'PARTIAL',
      HF_CAPTURE_ROOT_CAUSE: 'NOT_DETERMINABLE',
      RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED:
        'Sealed-only audit — exact-window replay not performed',
    };
  }

  return {
    HF_SPARSE_CADENCE_ORIGIN: 'NOT_DETERMINABLE',
    HF_CAPTURE_COMPLETENESS_VALIDATED: 'NO',
    HF_CAPTURE_ROOT_CAUSE: 'NOT_DETERMINABLE',
    RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED:
      'Live requery failed or unavailable — completeness not validated',
  };
}

export function buildHfCaptureCompletenessDiagnostic(args: {
  allRows: Rd004ObservationRow[];
  envelopeRows: Rd004ObservationRow[];
  queryEnvelope: { startUtc: string; endUtc: string };
  requeryTimestamps?: string[] | null;
  liveRequeryError?: string | null;
  exactWindowReplay?: {
    HF_SPARSE_CADENCE_ORIGIN: string;
    HF_CAPTURE_COMPLETENESS_VALIDATED: 'YES' | 'NO' | 'PARTIAL';
    RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED: string;
    HF_CAPTURE_ROOT_CAUSE: HfCaptureRootCause;
    aggregate?: Record<string, number>;
    watermarkRecoveryAnalysis?: Record<string, unknown>;
  } | null;
}) {
  const sealedAudit = auditSealedHfCaptureProvenance(
    args.allRows,
    args.envelopeRows,
    args.queryEnvelope,
  );
  const sealedTimestamps = sealedAudit.physicalTimestamps;
  const liveRequeryAttempted = args.requeryTimestamps != null || args.liveRequeryError != null;
  const liveRequerySucceeded =
    args.requeryTimestamps != null && args.requeryTimestamps.length > 0 && !args.liveRequeryError;
  const requeryComparison =
    liveRequerySucceeded
      ? compareHfSpeedTimestampSets(sealedTimestamps, args.requeryTimestamps!)
      : null;
  const classification = classifyHfSparsityOrigin({
    sealedAudit,
    requeryComparison,
    liveRequeryAttempted,
    liveRequerySucceeded,
    exactWindowReplay: args.exactWindowReplay,
  });

  return {
    evidenceId: 'DI-EV-0035B.4',
    mode: 'HF_CAPTURE_COMPLETENESS_DIAGNOSTIC',
    RAW_SOURCE_OBSERVATIONS_CHANGED: 'NO',
    DIMO_BUCKET_SEMANTICS,
    dimoProviderSourceAuthority: DIMO_PROVIDER_SOURCE_AUTHORITY,
    CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID,
    B3_BROAD_REQUERY_SAMPLE_LOSS_PROOF_VALID,
    B3_108_VS_66_RESULT,
    b3BroadRequerySuperseded: 'YES',
    sealedAudit,
    broadRequery: {
      attempted: liveRequeryAttempted,
      succeeded: liveRequerySucceeded,
      error: args.liveRequeryError ?? null,
      requeryTimestamps: liveRequerySucceeded ? args.requeryTimestamps ?? [] : null,
      comparison: requeryComparison,
      note: 'Density diagnostic only — NOT canonical bucket-identity proof (B.4 exact-window replay required)',
    },
    exactWindowReplaySummary: args.exactWindowReplay
      ? {
          aggregate: args.exactWindowReplay.aggregate ?? null,
          watermarkRecoveryAnalysis: args.exactWindowReplay.watermarkRecoveryAnalysis ?? null,
        }
      : null,
    ...classification,
    note:
      'Diagnostic artifact only — does not modify sealed Segment A/B source bytes. B.3 CAPTURE_PIPELINE_SAMPLE_LOSS from broad requery superseded by B.4.',
  };
}
