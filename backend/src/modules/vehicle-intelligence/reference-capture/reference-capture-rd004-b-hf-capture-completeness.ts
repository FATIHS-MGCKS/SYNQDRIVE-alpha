/**
 * RD004-B.3 — HF_HISTORICAL capture completeness audit (read-only, no production changes).
 */
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

/** Normalize HF 1s aggregate bucket timestamps for sealed vs live requery comparison. */
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
    comparisonNormalization: 'HF_1S_BUCKET_FLOOR_ISO',
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
}): {
  HF_SPARSE_CADENCE_ORIGIN: HfSparsityOrigin;
  HF_CAPTURE_COMPLETENESS_VALIDATED: 'YES' | 'NO' | 'PARTIAL';
  RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED: string;
} {
  const { sealedAudit, requeryComparison, liveRequeryAttempted, liveRequerySucceeded } = args;
  const median = sealedAudit.medianPhysicalCadenceSeconds ?? 0;
  const rd003 = RD003_HF_SPEED_MEDIAN_CADENCE_REFERENCE_SECONDS;

  if (requeryComparison && liveRequerySucceeded) {
    const missing = requeryComparison.MISSING_FROM_SEALED_COUNT;
    const extra = requeryComparison.EXTRA_IN_SEALED_COUNT;
    const sealedCount = requeryComparison.SEALED_HF_SPEED_UNIQUE_BUCKET_COUNT;
    const requeryCount = requeryComparison.DIAGNOSTIC_REQUERY_HF_SPEED_UNIQUE_BUCKET_COUNT;
    const intersection = requeryComparison.INTERSECTION_COUNT;

    if (intersection >= Math.max(1, sealedCount * 0.9) && missing <= Math.max(3, sealedCount * 0.05)) {
      return {
        HF_SPARSE_CADENCE_ORIGIN:
          median > rd003 * 3 ? 'PROVIDER_OR_UPSTREAM_CONFIRMED' : 'PROVIDER_OR_UPSTREAM_CONFIRMED',
        HF_CAPTURE_COMPLETENESS_VALIDATED: 'YES',
        RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED:
          'Sealed bucket timestamps align with fresh DIMO historical requery after 1s normalization; RD004 sparsity is upstream/provider-side not capture loss',
      };
    }
    if (missing > Math.max(5, sealedCount * 0.1)) {
      return {
        HF_SPARSE_CADENCE_ORIGIN: 'CAPTURE_PIPELINE_SAMPLE_LOSS',
        HF_CAPTURE_COMPLETENESS_VALIDATED: 'PARTIAL',
        RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED:
          'Live requery returned materially more speed buckets than sealed capture — pipeline/watermark loss suspected',
      };
    }
    if (requeryCount > sealedCount * 1.5 && median > rd003 * 3) {
      return {
        HF_SPARSE_CADENCE_ORIGIN: 'HISTORICAL_ENDPOINT_DOWNSAMPLING',
        HF_CAPTURE_COMPLETENESS_VALIDATED: 'PARTIAL',
        RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED:
          'Provider returns sparse aggregate buckets; sealed capture matches live requery density',
      };
    }
    if (missing <= 2 && extra <= 2 && median > rd003 * 3) {
      return {
        HF_SPARSE_CADENCE_ORIGIN: 'PROVIDER_OR_UPSTREAM_CONFIRMED',
        HF_CAPTURE_COMPLETENESS_VALIDATED: 'YES',
        RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED:
          'Sealed timestamps align with fresh DIMO historical requery; RD004 sparsity is upstream/provider-side not capture loss',
      };
    }
    return {
      HF_SPARSE_CADENCE_ORIGIN: 'MIXED_CAUSES',
      HF_CAPTURE_COMPLETENESS_VALIDATED: 'PARTIAL',
      RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED:
        'Partial overlap between sealed and requery — mixed watermark/provider effects',
    };
  }

  if (!liveRequeryAttempted) {
    return {
      HF_SPARSE_CADENCE_ORIGIN: median > rd003 * 3 ? 'NOT_DETERMINABLE' : 'NOT_DETERMINABLE',
      HF_CAPTURE_COMPLETENESS_VALIDATED: 'PARTIAL',
      RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED:
        'Sealed-only audit — live requery not performed; cannot fully exclude capture loss',
    };
  }

  return {
    HF_SPARSE_CADENCE_ORIGIN: 'NOT_DETERMINABLE',
    HF_CAPTURE_COMPLETENESS_VALIDATED: 'NO',
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
  });

  return {
    evidenceId: 'DI-EV-0035B.3',
    mode: 'HF_CAPTURE_COMPLETENESS_DIAGNOSTIC',
    RAW_SOURCE_OBSERVATIONS_CHANGED: 'NO',
    sealedAudit,
    requery: {
      attempted: liveRequeryAttempted,
      succeeded: liveRequerySucceeded,
      error: args.liveRequeryError ?? null,
      requeryTimestamps: liveRequerySucceeded ? args.requeryTimestamps ?? [] : null,
      comparison: requeryComparison,
    },
    ...classification,
    note:
      'Diagnostic artifact only — does not modify sealed Segment A/B source bytes',
  };
}
