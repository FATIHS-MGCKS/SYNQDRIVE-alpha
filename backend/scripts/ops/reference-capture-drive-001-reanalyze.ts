/**
 * Re-analyze Reference Drive #001 from sealed JSONL export (read-only).
 * Does NOT modify the sealed raw export.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  ACQUISITION_SURFACES,
  OUT_OF_ORDER_PREVIOUS_INVALIDATED_NOTE,
  analyzeSignalGroup,
  auditFingerprintSemantics,
  buildCoverageWindows,
  buildSurfaceCoverage,
  classifyBrakeEvidence,
  type SignalMetricsObsRow,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-signal-metrics';

const REFERENCE_DRIVE_ID = 'DIMO_LTE_R1_REFERENCE_DRIVE_001';
const SESSION_ID = '06638509-6213-419b-9df4-3def6c024f41';
const EXPECTED_SHA256 = 'f8e3097e28899d7a2cbdd269b266c16e5cf3eed69be810aba4e1247ec9a65bbd';
const HF_FIELDS = [
  'speed',
  'obdEngineLoad',
  'powertrainCombustionEngineSpeed',
  'powertrainCombustionEngineTPS',
  'obdThrottlePosition',
] as const;

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function compactAcquisitionStateSnapshot(state: unknown): Record<string, unknown> | null {
  if (!state || typeof state !== 'object') return null;
  const src = state as Record<string, unknown>;
  const fingerprints = Array.isArray(src.seenPhysicalSampleFingerprints)
    ? (src.seenPhysicalSampleFingerprints as string[])
    : [];
  const unique = [...new Set(fingerprints)].sort();
  const fingerprintSetSha256 = unique.length
    ? crypto.createHash('sha256').update(unique.join('\n')).digest('hex')
    : null;
  return {
    cycleCount: src.cycleCount ?? null,
    lastCycleAt: src.lastCycleAt ?? null,
    hfWatermarkAt: src.hfWatermarkAt ?? null,
    eventWatermarkAt: src.eventWatermarkAt ?? null,
    lastSequenceNumber: src.lastSequenceNumber ?? null,
    lastFailureAt: src.lastFailureAt ?? null,
    lastFailureClass: src.lastFailureClass ?? null,
    activeCycleJobId: src.activeCycleJobId ?? null,
    consecutiveTransientFailures: src.consecutiveTransientFailures ?? null,
    seenEventFingerprintCount: Array.isArray(src.seenEventFingerprints)
      ? (src.seenEventFingerprints as string[]).length
      : 0,
    seenPhysicalSampleFingerprintSummary: {
      fingerprintCount: fingerprints.length,
      uniqueFingerprintCount: unique.length,
      fingerprintSetSha256,
      rawExportSha256: EXPECTED_SHA256,
      sealedExportReference:
        '/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-001/observations-export.jsonl',
    },
    quarantinedProviderFields: src.quarantinedProviderFields ?? [],
  };
}

function compactNestedAcquisitionState(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compactNestedAcquisitionState);
  if (!value || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  if (Array.isArray(obj.seenPhysicalSampleFingerprints)) {
    return compactAcquisitionStateSnapshot(obj);
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(obj)) {
    if (key === 'acquisitionStateJson') {
      out[key] = compactAcquisitionStateSnapshot(child);
    } else {
      out[key] = compactNestedAcquisitionState(child);
    }
  }
  return out;
}

function compactSessionMeta(meta: Record<string, unknown>): Record<string, unknown> {
  return compactNestedAcquisitionState(meta) as Record<string, unknown>;
}

function parseJsonl(filePath: string): SignalMetricsObsRow[] {
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SignalMetricsObsRow);
}

function main(): void {
  const inputPath =
    parseArg('--input') ??
    '/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-001/observations-export.jsonl';
  const outDir = parseArg('--out-dir') ?? path.resolve(process.cwd(), 'docs/audits/data');
  const sessionMetaPath = parseArg('--session-meta') ?? path.join(outDir, 'dimo-lte-r1-reference-drive-001-session-summary.json');

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input JSONL not found: ${inputPath}`);
  }

  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(inputPath)).digest('hex');
  if (sha256 !== EXPECTED_SHA256) {
    throw new Error(`SHA-256 mismatch: expected ${EXPECTED_SHA256}, got ${sha256}`);
  }

  const allObs = parseJsonl(inputPath);
  const signalObs = allObs.filter((o) => o.observationKind === 'SIGNAL_POINT');
  const eventObs = allObs.filter((o) => o.observationKind === 'NATIVE_EVENT');

  const sessionMetaRaw = fs.existsSync(sessionMetaPath)
    ? (JSON.parse(fs.readFileSync(sessionMetaPath, 'utf8')) as Record<string, unknown>)
    : {};
  const sessionMeta = compactSessionMeta(sessionMetaRaw);

  const sessionStartedAt = (sessionMeta.sessionStartedAt as string | undefined) ?? '2026-09-01T19:00:43.252Z';
  const sessionCompletedAt = (sessionMeta.sessionCompletedAt as string | undefined) ?? '2026-09-01T19:34:52.360Z';
  const firstAcquisition = (sessionMeta.firstActualCaptureAt as string | undefined) ?? '2026-09-01T19:12:27.239Z';
  const ctx = {
    sessionStartedAtMs: Date.parse(sessionStartedAt),
    firstAcquisitionMs: Date.parse(firstAcquisition),
  };

  const byField: Record<string, SignalMetricsObsRow[]> = {};
  const byFieldSurface: Record<string, Record<string, SignalMetricsObsRow[]>> = {};
  for (const o of signalObs) {
    const field = o.providerField ?? 'UNKNOWN';
    const surface = o.acquisitionSurface ?? 'UNKNOWN';
    if (!byField[field]) byField[field] = [];
    byField[field].push(o);
    if (!byFieldSurface[field]) byFieldSurface[field] = {};
    if (!byFieldSurface[field][surface]) byFieldSurface[field][surface] = [];
    byFieldSurface[field][surface].push(o);
  }

  const perFieldSurface: Array<{
    providerField: string;
    acquisitionSurface: string;
    metrics: ReturnType<typeof analyzeSignalGroup>;
  }> = [];
  for (const [field, surfaces] of Object.entries(byFieldSurface)) {
    for (const [surface, rows] of Object.entries(surfaces)) {
      perFieldSurface.push({
        providerField: field,
        acquisitionSurface: surface,
        metrics: analyzeSignalGroup(rows, ctx),
      });
    }
  }

  const perFieldCombined = Object.fromEntries(
    Object.entries(byField).map(([field, rows]) => [field, analyzeSignalGroup(rows, ctx)]),
  );

  const hfHistorical = {
    totalRows: signalObs.filter((o) => o.acquisitionSurface === 'HF_HISTORICAL').length,
    perField: Object.fromEntries(
      HF_FIELDS.map((field) => {
        const rows = signalObs.filter(
          (o) => o.acquisitionSurface === 'HF_HISTORICAL' && o.providerField === field,
        );
        return [field, analyzeSignalGroup(rows, ctx)];
      }),
    ),
    requestedIntervalNote: 'HF planner requests 1s interval — this is NOT observed cadence',
  };

  const dynamicsSummary = Object.fromEntries(
    Object.entries(byField).map(([field, rows]) => [
      field,
      analyzeSignalGroup(rows, ctx).dynamics,
    ]),
  );

  const dynamicsCounts = Object.values(dynamicsSummary).reduce(
    (acc, d) => {
      acc[d.classification] = (acc[d.classification] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const discovered = (sessionMeta as { capabilityVsObserved?: { discovered?: string[] } }).capabilityVsObserved
    ?.discovered ?? Object.keys(byField);
  const brake = classifyBrakeEvidence(discovered, Object.keys(byField));

  const coverageWindows = buildCoverageWindows({
    sessionStartedAt,
    sessionCompletedAt,
    rows: allObs,
  });
  const surfaceCoverage = buildSurfaceCoverage(signalObs);
  const fingerprintAudit = auditFingerprintSemantics(allObs);

  const metricsOut = {
    referenceDriveId: REFERENCE_DRIVE_ID,
    sessionId: SESSION_ID,
    generatedAt: new Date().toISOString(),
    methodologyVersion: '2026-09-01-aggregation-semantics-corrected',
    hfAggregationSemantics: {
      HF_AGGREGATION_SEMANTICS: 'CONFIRMED_FROM_CODE_AND_PROVIDER_SOURCE',
      dimoHistoricalSurface: 'DIMO_AGGREGATED_HISTORICAL_1S',
      observationType: 'HF_AGGREGATE_BUCKET_OBSERVATION',
      aggregator: 'AVG',
      interval: '1s',
      bucketTimestampMeaning: 'INTERVAL_START_ANCHORED_TO_QUERY_FROM',
      cadenceHierarchy: {
        DEVICE_RAW_SAMPLE_CADENCE: 'UNKNOWN',
        DIMO_INGESTED_SOURCE_CADENCE: 'UNKNOWN',
        DIMO_AGGREGATE_BUCKET_CADENCE: 'PARTIALLY_OBSERVED',
        SYNQDRIVE_RETRIEVAL_CADENCE: 'OBSERVED',
      },
      dimoHistoricalNonemptyBucketCadenceP50Seconds: hfHistorical.perField.speed?.providerCadence.deltaTSeconds.p50 ?? null,
      priorPhysicalSampleClaimsInvalidated: true,
      prior225PosthocClaim: 'INVALIDATED_BY_AGGREGATION_GRID_MISMATCH',
    },
    sealedRawExport: {
      path: inputPath,
      sha256,
      unchanged: true,
      rowCount: allObs.length,
    },
    previousAnalysisInvalidations: {
      outOfOrderZeroResult: OUT_OF_ORDER_PREVIOUS_INVALIDATED_NOTE,
    },
    coverageWindows,
    surfaceCoverage,
    fingerprintAudit,
    perFieldSurface,
    perFieldCombinedDeprecated: perFieldCombined,
    hfHistorical,
    nativeEvents: {
      count: eventObs.length,
      verdict: 'DIMO returned no native events for the captured session/window',
      inferenceNote:
        'Does not infer that no harsh physical maneuver occurred; does not infer provider event detector quality from one zero-event drive.',
      events: eventObs,
    },
    brakeEvidence: brake,
    signalDynamicsSummary: dynamicsSummary,
    signalDynamicsCounts: dynamicsCounts,
    signalDynamicsMaturity: 'ANALYSIS_HEURISTIC_PROVISIONAL',
    signalDynamicsCrossSurfaceNote:
      'Cross-surface duplicate retrieval inflates observation counts; dynamics labels are provisional until model-feature suitability is validated separately',
    dualReplicaSerialization: {
      verdict: 'INFERENCE',
      reason:
        'cycleCount monotonic; activeCycleJobId null at rest; worker/process identity not recorded — true cross-replica contention not independently proven',
      missingEvidenceForConfirmation: ['workerId', 'processId/replicaId', 'cycleJobId', 'cycleExecutionStartEnd'],
    },
    acquisitionSurfaces: ACQUISITION_SURFACES,
  };

  const csvLines = [
    'providerField,acquisitionSurface,observationCount,uniqueProviderTimestamps,positiveDeltaTSamples,p50_dt_s,p90_dt_s,p95_dt_s,p99_dt_s,max_gap_s,outOfOrderCount,outOfOrderRate,providerSampleAge_p50_ms,httpRequest_p50_ms,dynamicsClassification',
  ];
  for (const row of perFieldSurface) {
    const m = row.metrics;
    csvLines.push(
      [
        row.providerField,
        row.acquisitionSurface,
        m.observationCount,
        m.providerCadence.uniqueProviderTimestampCount,
        m.providerCadence.positiveDeltaTSampleCount,
        m.providerCadence.deltaTSeconds.p50 ?? '',
        m.providerCadence.deltaTSeconds.p90 ?? '',
        m.providerCadence.deltaTSeconds.p95 ?? '',
        m.providerCadence.deltaTSeconds.p99 ?? '',
        m.providerCadence.maxGapSeconds ?? '',
        m.outOfOrder.outOfOrderCount,
        m.outOfOrder.outOfOrderRate.toFixed(6),
        m.latency.providerSampleAgeAtIngressMs.p50 ?? '',
        m.latency.httpRequestDurationMs.p50 ?? '',
        m.dynamics.classification,
      ].join(','),
    );
  }

  fs.mkdirSync(outDir, { recursive: true });
  const metricsPath = path.join(outDir, 'dimo-lte-r1-reference-drive-001-signal-quality-metrics.json');
  const csvPath = path.join(outDir, 'dimo-lte-r1-reference-drive-001-signal-quality-metrics.csv');
  fs.writeFileSync(metricsPath, JSON.stringify(metricsOut, null, 2));
  fs.writeFileSync(csvPath, csvLines.join('\n'));

  const sessionSummary = {
    ...sessionMeta,
    referenceDriveId: REFERENCE_DRIVE_ID,
    sessionId: SESSION_ID,
    metricsMethodologyVersion: '2026-09-01-aggregation-semantics-corrected',
    RD001_METRICS_CORRECTION: 'COMPLETE',
    RD001_AGGREGATION_SEMANTICS_CORRECTION: 'COMPLETE',
    coverageWindows,
    surfaceCoverage,
    fingerprintAudit,
    signalDynamicsCounts: dynamicsCounts,
    brakeEvidence: brake,
    hfHistoricalSummary: Object.fromEntries(
      HF_FIELDS.map((f) => [
        f,
        {
          hfRows: hfHistorical.perField[f]?.observationCount ?? 0,
          providerCadence: hfHistorical.perField[f]?.providerCadence.deltaTSeconds ?? null,
          outOfOrder: hfHistorical.perField[f]?.outOfOrder ?? null,
          maxGapClassification: hfHistorical.perField[f]?.maxGapClassification ?? null,
        },
      ]),
    ),
    rawEvidenceExport: {
      ...(sessionMeta.rawEvidenceExport as object),
      sha256,
      unchanged: true,
      state: 'SEALED_EXPORT_AVAILABLE',
      purgeBlockedReferenceEvidence: true,
    },
    outOfOrderPreviousResultInvalidated: true,
    dualReplicaSerialization: metricsOut.dualReplicaSerialization,
    coverageWindowDefinitions: {
      SESSION_LIFECYCLE_WINDOW: coverageWindows.SESSION_LIFECYCLE_WINDOW,
      ACQUISITION_EXECUTION_WINDOW: coverageWindows.ACQUISITION_EXECUTION_WINDOW,
      PROVIDER_DATA_COVERAGE_WINDOW: coverageWindows.PROVIDER_DATA_COVERAGE_WINDOW,
      ROW_PRODUCING_HF_REQUEST_WINDOW: {
        firstRequestStartedAt: '2026-09-01T19:12:27.500Z',
        lastRequestStartedAt: '2026-09-01T19:14:09.726Z',
        rowProducingRequestCount: 13,
        note: 'Does not prove zero-row HF requests were absent after last row-producing request',
      },
    },
    hfCompletenessForensic: {
      phase: '3A.3 HF aggregate bucket completeness / late-arrival audit',
      exactWindowReplayArtifact: 'docs/audits/data/dimo-lte-r1-reference-drive-001-hf-exact-window-replay.json',
      invalidatedChunkedPosthocArtifact: 'docs/audits/data/dimo-lte-r1-reference-drive-001-hf-posthoc-forensic.json',
      HF_AGGREGATION_SEMANTICS: 'CONFIRMED_FROM_CODE_AND_PROVIDER_SOURCE',
      '225_POSTHOC_PHYSICAL_SAMPLE_CLAIM': 'INVALIDATED_BY_AGGREGATION_GRID_MISMATCH',
      HF_LATE_ARRIVAL_WATERMARK_RISK: 'CONFIRMED_FROM_CODE_RISK',
      HF_LATE_ARRIVAL_RUNTIME_SKIP: 'UNKNOWN_REQUIRES_VALIDATION',
      HF_LATE_ARRIVAL_AGGREGATE_BUCKET: 'CONFIRMED_FROM_RUNTIME',
      RD001_HF_COMPLETENESS: 'INCOMPLETE',
      RD001_UPSTREAM_DATA_STALL_AFTER_1914: 'CONFIRMED_FROM_RUNTIME',
      UPSTREAM_DATA_STALL_ROOT_CAUSE: 'UNKNOWN_REQUIRES_VALIDATION',
      HF_WATERMARK_REMEDIATION_REQUIRED: 'YES',
      PHYSICAL_SAMPLE_FINGERPRINT_REMEDIATION_REQUIRED: 'YES',
    },
    nextRequiredPhase: 'PHASE_3A.3.1_FAST_ARM_WORKFLOW',
    nextRequiredPhaseAlso: 'HF_WATERMARK_LATE_ARRIVAL_REMEDIATION',
    ARM_WORKFLOW_REMEDIATION_REQUIRED: true,
  };

  const summaryPath = path.join(outDir, 'dimo-lte-r1-reference-drive-001-session-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(sessionSummary, null, 2));

  console.log(
    JSON.stringify(
      {
        ok: true,
        sha256,
        metricsPath,
        summaryPath,
        dynamicsCounts,
        coverageWindows,
        hfSpeed: hfHistorical.perField.speed?.providerCadence.deltaTSeconds,
        hfRpm: hfHistorical.perField.powertrainCombustionEngineSpeed?.providerCadence.deltaTSeconds,
      },
      null,
      2,
    ),
  );
}

main();
