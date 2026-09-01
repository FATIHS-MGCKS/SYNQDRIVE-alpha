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

  const sessionMeta = fs.existsSync(sessionMetaPath)
    ? (JSON.parse(fs.readFileSync(sessionMetaPath, 'utf8')) as Record<string, unknown>)
    : {};

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
    methodologyVersion: '2026-09-01-corrected',
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
    metricsMethodologyVersion: '2026-09-01-corrected',
    RD001_METRICS_CORRECTION: 'COMPLETE',
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
    nextRequiredPhase: 'PHASE_3A.3.1_FAST_ARM_WORKFLOW',
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
