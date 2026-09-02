/**
 * Reference Drive #001 — STOP + evidence freeze + telemetry audit (production).
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { ReferenceCaptureSessionStatus } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCaptureSessionService } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.service';
import { parseAcquisitionState } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.repository';
import {
  ACQUISITION_SURFACES,
  analyzeSignalGroup,
  auditFingerprintSemantics,
  buildCoverageWindows,
  buildSurfaceCoverage,
  classifyBrakeEvidence,
  hasNonNullValue,
  OUT_OF_ORDER_PREVIOUS_INVALIDATED_NOTE,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-signal-metrics';

const ORG_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const SESSION_ID = '06638509-6213-419b-9df4-3def6c024f41';
const REFERENCE_DRIVE_ID = 'DIMO_LTE_R1_REFERENCE_DRIVE_001';
const ARCHIVE_DIR = '/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-001';

function loadEnv(): void {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type ObsRow = {
  id: string;
  observationKind: string;
  providerField: string | null;
  canonicalKey: string | null;
  rawIdentity: string;
  acquisitionSurface: string | null;
  providerTimestamp: Date | null;
  synqReceivedAt: Date;
  requestStartedAt: Date | null;
  requestCompletedAt: Date | null;
  sequenceNumber: number | null;
  physicalSampleFingerprint: string | null;
  providerEventFingerprint: string | null;
  rawValueJson: unknown;
  provenanceJson: unknown;
  createdAt: Date;
};

async function snapshotSession(prisma: PrismaService, redisCli: string) {
  const session = await prisma.referenceCaptureSession.findUnique({ where: { id: SESSION_ID } });
  const obsCount = await prisma.referenceCaptureObservation.count({ where: { sessionId: SESSION_ID } });
  const seq = await prisma.referenceCaptureObservation.aggregate({
    where: { sessionId: SESSION_ID, sequenceNumber: { not: null } },
    _min: { sequenceNumber: true },
    _max: { sequenceNumber: true },
  });
  const bull = await new Promise<string>((resolve) => {
    const { exec } = require('child_process');
    exec(
      `redis-cli llen bull:reference.capture.recording:wait; redis-cli llen bull:reference.capture.recording:active; redis-cli llen bull:reference.capture.recording:delayed; redis-cli --scan --pattern "*${SESSION_ID}*"`,
      (_e: Error | null, stdout: string) => resolve(stdout),
    );
  });
  const state = parseAcquisitionState(session?.acquisitionStateJson);
  return {
    capturedAt: new Date().toISOString(),
    status: session?.status,
    cycleCount: state.cycleCount ?? null,
    observationCount: obsCount,
    pendingCycleJobId: session?.pendingCycleJobId,
    activeCycleJobId: state.activeCycleJobId ?? null,
    eventWatermarkAt: session?.eventWatermarkAt?.toISOString() ?? state.eventWatermarkAt ?? null,
    hfWatermarkAt: state.hfWatermarkAt ?? null,
    sequenceMin: seq._min.sequenceNumber,
    sequenceMax: seq._max.sequenceNumber,
    bullMqProbe: bull.trim(),
    acquisitionStateJson: session?.acquisitionStateJson,
  };
}

async function main(): Promise<void> {
  if (!process.argv.includes('--confirm-drive-001-stop-audit')) {
    throw new Error('Refusing without --confirm-drive-001-stop-audit');
  }
  loadEnv();
  if (process.env.REFERENCE_CAPTURE_ENABLED !== 'true') {
    throw new Error('REFERENCE_CAPTURE_ENABLED must be true');
  }

  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const outDir = process.env.AUDIT_OUT_DIR ?? ARCHIVE_DIR;

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const sessionService = app.get(ReferenceCaptureSessionService);

  try {
    const preStop = await snapshotSession(prisma, '');
    fs.writeFileSync(path.join(outDir, 'pre-stop-snapshot.json'), JSON.stringify(preStop, null, 2));

    const stopView = await sessionService.stopRecording(ORG_ID, SESSION_ID);
    const stopResult = {
      stoppedAt: new Date().toISOString(),
      finalStatus: stopView.status,
      expectedPath: ['RECORDING', 'STOPPING', 'COMPLETED'],
    };
    fs.writeFileSync(path.join(outDir, 'stop-result.json'), JSON.stringify(stopResult, null, 2));

    await sleep(12_000);
    const postStop1 = await snapshotSession(prisma, '');
    await sleep(6_000);
    const postStop2 = await snapshotSession(prisma, '');

    const allObs: ObsRow[] = [];
    const batch = 2000;
    let skip = 0;
    while (true) {
      const chunk = await prisma.referenceCaptureObservation.findMany({
        where: { sessionId: SESSION_ID },
        orderBy: { sequenceNumber: 'asc' },
        skip,
        take: batch,
        select: {
          id: true,
          observationKind: true,
          providerField: true,
          canonicalKey: true,
          rawIdentity: true,
          acquisitionSurface: true,
          providerTimestamp: true,
          synqReceivedAt: true,
          requestStartedAt: true,
          requestCompletedAt: true,
          sequenceNumber: true,
          physicalSampleFingerprint: true,
          providerEventFingerprint: true,
          rawValueJson: true,
          provenanceJson: true,
          createdAt: true,
        },
      });
      allObs.push(...(chunk as ObsRow[]));
      if (chunk.length < batch) break;
      skip += batch;
    }

    const exportPath = path.join(outDir, 'observations-export.jsonl');
    const lines = allObs.map((o) =>
      JSON.stringify({
        ...o,
        providerTimestamp: o.providerTimestamp?.toISOString() ?? null,
        synqReceivedAt: o.synqReceivedAt.toISOString(),
        requestStartedAt: o.requestStartedAt?.toISOString() ?? null,
        requestCompletedAt: o.requestCompletedAt?.toISOString() ?? null,
        createdAt: o.createdAt.toISOString(),
      }),
    );
    fs.writeFileSync(exportPath, lines.join('\n'));
    const exportBytes = fs.statSync(exportPath).size;
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(exportPath)).digest('hex');

    const session = await prisma.referenceCaptureSession.findUnique({
      where: { id: SESSION_ID },
      include: { vehicle: { select: { licensePlate: true, id: true, dimoVehicle: { select: { tokenId: true } } } } },
    });
    const preflight = session?.preflightJson as {
      availableSignals?: string[];
      broadObservationFields?: Array<{ providerField: string; canonicalKey: string | null; capabilityState?: string }>;
    } | null;

    const signalObs = allObs.filter((o) => o.observationKind === 'SIGNAL_POINT');
    const eventObs = allObs.filter((o) => o.observationKind === 'NATIVE_EVENT');
    const metaObs = allObs.filter((o) => o.observationKind !== 'SIGNAL_POINT' && o.observationKind !== 'NATIVE_EVENT');

    const surfaces: Record<string, number> = {};
    const byField: Record<string, ObsRow[]> = {};
    const byFieldSurface: Record<string, Record<string, ObsRow[]>> = {};
    for (const o of signalObs) {
      const s = o.acquisitionSurface ?? 'UNKNOWN';
      surfaces[s] = (surfaces[s] ?? 0) + 1;
      const f = o.providerField ?? 'UNKNOWN';
      if (!byField[f]) byField[f] = [];
      byField[f].push(o);
      if (!byFieldSurface[f]) byFieldSurface[f] = {};
      if (!byFieldSurface[f][s]) byFieldSurface[f][s] = [];
      byFieldSurface[f][s].push(o);
    }

    const firstSignal = [...signalObs]
      .filter((o) => o.requestStartedAt)
      .sort((a, b) => a.requestStartedAt!.getTime() - b.requestStartedAt!.getTime())[0];
    const lastSignal = [...signalObs]
      .filter((o) => o.synqReceivedAt)
      .sort((a, b) => b.synqReceivedAt.getTime() - a.synqReceivedAt.getTime())[0];

    const sessionStartedAt = session?.startedAt?.toISOString() ?? null;
    const firstActualCaptureAt = firstSignal?.requestStartedAt?.toISOString() ?? null;
    const lastActualCaptureAt = lastSignal?.synqReceivedAt?.toISOString() ?? null;
    const acquisitionGapMs =
      session?.startedAt && firstSignal?.requestStartedAt
        ? firstSignal.requestStartedAt.getTime() - session.startedAt.getTime()
        : null;

    const capabilityDiscovered = new Set(preflight?.availableSignals ?? []);
    const actuallyObserved = new Set(Object.keys(byField));
    const mapped = signalObs.filter((o) => o.canonicalKey).length;
    const unmapped = signalObs.filter((o) => !o.canonicalKey && o.providerField).length;

    const ctx = {
      sessionStartedAtMs: session?.startedAt?.getTime() ?? null,
      firstAcquisitionMs: firstSignal?.requestStartedAt?.getTime() ?? null,
    };

    const perFieldSurface: Array<{
      providerField: string;
      acquisitionSurface: string;
      metrics: ReturnType<typeof analyzeSignalGroup>;
    }> = [];
    for (const [field, surfaceMap] of Object.entries(byFieldSurface)) {
      for (const [surface, rows] of Object.entries(surfaceMap)) {
        perFieldSurface.push({ providerField: field, acquisitionSurface: surface, metrics: analyzeSignalGroup(rows, ctx) });
      }
    }

    const fingerprintAudit = auditFingerprintSemantics(allObs);
    const coverageWindows = buildCoverageWindows({
      sessionStartedAt,
      sessionCompletedAt: session?.completedAt?.toISOString() ?? null,
      rows: allObs,
    });
    const surfaceCoverage = buildSurfaceCoverage(signalObs);
    const brakeEvidence = classifyBrakeEvidence([...capabilityDiscovered], Object.keys(byField));
    const signalDynamicsCounts = Object.values(
      Object.fromEntries(
        Object.entries(byField).map(([field, rows]) => [
          field,
          analyzeSignalGroup(rows, ctx).dynamics.classification,
        ]),
      ),
    ).reduce(
      (acc: Record<string, number>, c) => {
        acc[c] = (acc[c] ?? 0) + 1;
        return acc;
      },
      {},
    );

    const priorityFields = [
      'speed',
      'powertrainCombustionEngineSpeed',
      'powertrainCombustionEngineTPS',
      'obdThrottlePosition',
      'obdEngineLoad',
      'powertrainTransmissionActualGear',
      'isIgnitionOn',
      'currentLocationCoordinates',
      'currentLocationHeading',
      'powertrainCombustionEngineECT',
      'obdOilTemperature',
      'lowVoltageBatteryCurrentVoltage',
    ];

    const hfRows = signalObs.filter((o) => o.acquisitionSurface === 'HF_HISTORICAL');
    const hfByField: Record<string, number> = {};
    for (const o of hfRows) {
      const f = o.providerField ?? 'UNKNOWN';
      hfByField[f] = (hfByField[f] ?? 0) + 1;
    }

    const cycleJobs = new Set<string>();
    for (const o of signalObs) {
      const prov = o.provenanceJson as { cycleJobId?: string; captureCycleId?: string } | null;
      if (prov?.cycleJobId) cycleJobs.add(prov.cycleJobId);
    }

    const hfHistorical = {
      totalRows: hfRows.length,
      fields: hfByField,
      perField: Object.fromEntries(
        Object.keys(hfByField).map((f) => [
          f,
          analyzeSignalGroup(
            hfRows.filter((r) => r.providerField === f),
            ctx,
          ),
        ]),
      ),
      requestedIntervalNote: 'HF planner requests 1s interval — this is NOT observed cadence',
    };

    const sessionSummary = {
      referenceDriveId: REFERENCE_DRIVE_ID,
      sessionId: SESSION_ID,
      vehicle: session?.vehicle?.licensePlate,
      vehicleId: session?.vehicle?.id,
      tokenId: session?.vehicle?.dimoVehicle?.tokenId,
      connectionProfile: session?.connectionProfile,
      powertrainProfile: session?.powertrainProfile,
      manifestVersion: session?.manifestVersion,
      deployedSha: process.env.DEPLOYED_SHA ?? null,
      sessionCreatedAt: session?.createdAt?.toISOString(),
      sessionStartedAt,
      sessionStoppedAt: session?.stoppedAt?.toISOString(),
      sessionCompletedAt: session?.completedAt?.toISOString(),
      firstActualCaptureAt,
      lastActualCaptureAt,
      acquisitionStartGapSeconds: acquisitionGapMs != null ? acquisitionGapMs / 1000 : null,
      actualCaptureDurationSeconds:
        firstSignal?.requestStartedAt && lastSignal?.synqReceivedAt
          ? (lastSignal.synqReceivedAt.getTime() - firstSignal.requestStartedAt.getTime()) / 1000
          : null,
      sessionLifecycleDurationSeconds:
        session?.startedAt && session?.completedAt
          ? (session.completedAt.getTime() - session.startedAt.getTime()) / 1000
          : null,
      finalStatus: session?.status,
      cycleCount: parseAcquisitionState(session?.acquisitionStateJson).cycleCount ?? null,
      totalObservations: allObs.length,
      signalObservations: signalObs.length,
      nativeEvents: eventObs.length,
      metadataObservations: metaObs.length,
      uniquePhysicalSamplesNote:
        'Counts unique physicalSampleFingerprint values where populated (RD001: HF_HISTORICAL only, 38.6% row coverage).',
      uniqueAggregateBucketFingerprints: fingerprintAudit.uniqueAggregateBucketFingerprintsAllSurfaces,
      fingerprintAudit,
      mappedObservations: mapped,
      unmappedObservations: unmapped,
      surfaces,
      hfObservationCount: hfRows.length,
      hfFields: hfByField,
      coverageWindows,
      surfaceCoverage,
      signalDynamicsCounts,
      brakeEvidence,
      metricsMethodologyVersion: '2026-09-01-corrected',
      RD001_METRICS_CORRECTION: 'COMPLETE',
      nextRequiredPhase: 'PHASE_3A.3.1_FAST_ARM_WORKFLOW',
      ARM_WORKFLOW_REMEDIATION_REQUIRED: true,
      outOfOrderPreviousResultInvalidated: true,
      videoGroundTruthAvailable: false,
      rawEvidenceExport: {
        path: exportPath,
        rowCount: allObs.length,
        bytes: exportBytes,
        sha256,
        exportedAt: new Date().toISOString(),
        state: 'SEALED_EXPORT_AVAILABLE',
      },
      armIncident: {
        sessionStartedAt,
        firstSuccessfulAcquisitionAt: firstActualCaptureAt,
        gapSeconds: acquisitionGapMs != null ? acquisitionGapMs / 1000 : null,
        classification: 'CONFIRMED_FROM_RUNTIME',
        rootCause: 'Nest bootstrap timeout on ARM script; first BullMQ cycle lost/cancelled; runner recovered via manual re-enqueue at ~19:12:27Z',
        sessionWasRecordingDuringGap: true,
        observationsBeforeRecovery: 1,
        drivingBeforeFirstCapture: 'UNKNOWN',
      },
      preStop,
      stopResult,
      postStop: { t12s: postStop1, t18s: postStop2 },
    };

    const metricsOut = {
      referenceDriveId: REFERENCE_DRIVE_ID,
      sessionId: SESSION_ID,
      generatedAt: new Date().toISOString(),
      methodologyVersion: '2026-09-01-corrected',
      previousAnalysisInvalidations: {
        outOfOrderZeroResult: OUT_OF_ORDER_PREVIOUS_INVALIDATED_NOTE,
      },
      coverageWindows,
      surfaceCoverage,
      fingerprintAudit,
      perFieldSurface,
      hfHistorical,
      nativeEvents: {
        count: eventObs.length,
        verdict: 'DIMO returned no native events for the captured session/window',
        inferenceNote:
          'Does not infer that no harsh physical maneuver occurred; does not infer provider event detector quality from one zero-event drive.',
        events: eventObs.map((e) => ({
          rawIdentity: e.rawIdentity,
          providerField: e.providerField,
          providerTimestamp: e.providerTimestamp?.toISOString(),
          fingerprint: e.providerEventFingerprint,
          provenance: e.provenanceJson,
          rawValueJson: e.rawValueJson,
        })),
      },
      capabilityVsObserved: {
        discovered: [...capabilityDiscovered].sort(),
        actuallyObserved: [...actuallyObserved].sort(),
        observedNonNull: Object.entries(byField)
          .filter(([, rows]) => rows.some((r) => hasNonNullValue(r.rawValueJson)))
          .map(([f]) => f)
          .sort(),
        signalDynamicsCounts,
      },
      brakeEvidence,
      dualReplicaSerialization: {
        verdict: 'INFERENCE',
        reason:
          'cycleCount monotonic; activeCycleJobId null at rest; worker/process identity not recorded — true cross-replica contention not independently proven',
        missingEvidenceForConfirmation: ['workerId', 'processId/replicaId', 'cycleJobId', 'cycleExecutionStartEnd'],
        uniqueCycleJobIds: cycleJobs.size,
        cycleCount: parseAcquisitionState(session?.acquisitionStateJson).cycleCount,
      },
      acquisitionSurfaces: ACQUISITION_SURFACES,
      priority: Object.fromEntries(
        priorityFields.map((f) => [
          f,
          perFieldSurface.filter((r) => r.providerField === f),
        ]),
      ),
    };

    fs.writeFileSync(path.join(outDir, 'session-summary.json'), JSON.stringify(sessionSummary, null, 2));
    fs.writeFileSync(path.join(outDir, 'signal-quality-metrics.json'), JSON.stringify(metricsOut, null, 2));

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
    fs.writeFileSync(path.join(outDir, 'signal-quality-metrics.csv'), csvLines.join('\n'));

    console.log(JSON.stringify({ ok: true, outDir, sessionSummary, metricsSummary: {
      finalStatus: sessionSummary.finalStatus,
      totalObservations: sessionSummary.totalObservations,
      hfCount: sessionSummary.hfObservationCount,
      events: sessionSummary.nativeEvents,
      firstActualCaptureAt,
      lastActualCaptureAt,
      exportSha256: sha256,
    }}, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
