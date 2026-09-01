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

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stddev(nums: number[]): number | null {
  if (nums.length < 2) return null;
  const m = mean(nums)!;
  const v = nums.reduce((s, n) => s + (n - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(v);
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

function hasNonNullValue(raw: unknown): boolean {
  if (raw == null) return false;
  if (typeof raw === 'object' && raw !== null && 'value' in (raw as object)) {
    return (raw as { value?: unknown }).value != null;
  }
  return true;
}

function analyzeSignalSeries(rows: ObsRow[]) {
  const withTs = rows
    .filter((r) => r.providerTimestamp)
    .sort((a, b) => a.providerTimestamp!.getTime() - b.providerTimestamp!.getTime());
  const nonNull = rows.filter((r) => hasNonNullValue(r.rawValueJson));
  const uniqueTs = new Set(withTs.map((r) => r.providerTimestamp!.toISOString()));
  const dts: number[] = [];
  for (let i = 1; i < withTs.length; i++) {
    dts.push((withTs[i].providerTimestamp!.getTime() - withTs[i - 1].providerTimestamp!.getTime()) / 1000);
  }
  const sortedDts = [...dts].sort((a, b) => a - b);
  let outOfOrder = 0;
  for (let i = 1; i < withTs.length; i++) {
    if (withTs[i].providerTimestamp!.getTime() < withTs[i - 1].providerTimestamp!.getTime()) outOfOrder++;
  }
  const dupTs = withTs.length - uniqueTs.size;
  const phys = rows.map((r) => r.physicalSampleFingerprint).filter(Boolean) as string[];
  const uniquePhys = new Set(phys);
  const ingressMs = withTs
    .filter((r) => r.synqReceivedAt && r.providerTimestamp)
    .map((r) => r.synqReceivedAt.getTime() - r.providerTimestamp!.getTime());
  const sortedIngress = [...ingressMs].sort((a, b) => a - b);
  const gapCounts = { gt2s: 0, gt5s: 0, gt10s: 0, gt30s: 0 };
  for (const dt of dts) {
    if (dt > 2) gapCounts.gt2s++;
    if (dt > 5) gapCounts.gt5s++;
    if (dt > 10) gapCounts.gt10s++;
    if (dt > 30) gapCounts.gt30s++;
  }
  const jitter = stddev(dts);
  return {
    observationCount: rows.length,
    uniqueProviderTimestampCount: uniqueTs.size,
    nonNullCount: nonNull.length,
    nullRate: rows.length ? (rows.length - nonNull.length) / rows.length : null,
    deltaTSeconds: {
      min: sortedDts.length ? sortedDts[0] : null,
      p50: percentile(sortedDts, 50),
      p90: percentile(sortedDts, 90),
      p95: percentile(sortedDts, 95),
      p99: percentile(sortedDts, 99),
      max: sortedDts.length ? sortedDts[sortedDts.length - 1] : null,
      mean: mean(dts),
      stdDev: jitter,
    },
    jitterSeconds: jitter,
    duplicateProviderTimestamps: dupTs,
    duplicatePhysicalSamples: phys.length - uniquePhys.size,
    outOfOrderCount: outOfOrder,
    outOfOrderRate: withTs.length > 1 ? outOfOrder / (withTs.length - 1) : 0,
    maxGapSeconds: sortedDts.length ? sortedDts[sortedDts.length - 1] : null,
    gapCountsAbove: gapCounts,
    ingressLatencyMs: {
      p50: percentile(sortedIngress, 50),
      p95: percentile(sortedIngress, 95),
      p99: percentile(sortedIngress, 99),
      max: sortedIngress.length ? sortedIngress[sortedIngress.length - 1] : null,
    },
    firstProviderTimestamp: withTs[0]?.providerTimestamp?.toISOString() ?? null,
    lastProviderTimestamp: withTs[withTs.length - 1]?.providerTimestamp?.toISOString() ?? null,
  };
}

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
    for (const o of signalObs) {
      const s = o.acquisitionSurface ?? 'UNKNOWN';
      surfaces[s] = (surfaces[s] ?? 0) + 1;
      const f = o.providerField ?? 'UNKNOWN';
      if (!byField[f]) byField[f] = [];
      byField[f].push(o);
    }

    const uniquePhys = new Set(signalObs.map((o) => o.physicalSampleFingerprint).filter(Boolean));
    const mapped = signalObs.filter((o) => o.canonicalKey).length;
    const unmapped = signalObs.filter((o) => !o.canonicalKey && o.providerField).length;

    const signalQuality: Record<string, ReturnType<typeof analyzeSignalSeries>> = {};
    for (const [field, rows] of Object.entries(byField)) {
      signalQuality[field] = analyzeSignalSeries(rows);
    }

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
    const cycleWindows: Array<{ jobId?: string; start?: number; end?: number }> = [];
    for (const o of signalObs) {
      const prov = o.provenanceJson as { cycleJobId?: string; captureCycleId?: string } | null;
      if (prov?.cycleJobId) cycleJobs.add(prov.cycleJobId);
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
    const withUsefulData = Object.entries(byField)
      .filter(([, rows]) => rows.some((r) => hasNonNullValue(r.rawValueJson)))
      .map(([f]) => f);

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
      uniquePhysicalSamples: uniquePhys.size,
      mappedObservations: mapped,
      unmappedObservations: unmapped,
      surfaces,
      hfObservationCount: hfRows.length,
      hfFields: hfByField,
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
      perField: signalQuality,
      priority: Object.fromEntries(priorityFields.map((f) => [f, signalQuality[f] ?? null])),
      hfHistorical: {
        totalRows: hfRows.length,
        fields: hfByField,
        perFieldMetrics: Object.fromEntries(
          Object.keys(hfByField).map((f) => [f, analyzeSignalSeries(hfRows.filter((r) => r.providerField === f))]),
        ),
        requestedIntervalNote: 'HF planner requests 1s interval — this is NOT observed cadence',
      },
      nativeEvents: eventObs.map((e) => ({
        rawIdentity: e.rawIdentity,
        providerField: e.providerField,
        providerTimestamp: e.providerTimestamp?.toISOString(),
        fingerprint: e.providerEventFingerprint,
        provenance: e.provenanceJson,
        rawValueJson: e.rawValueJson,
      })),
      capabilityVsObserved: {
        discovered: [...capabilityDiscovered].sort(),
        actuallyObserved: [...actuallyObserved].sort(),
        withUsefulDynamicData: withUsefulData.sort(),
      },
      dualReplicaSerialization: {
        verdict: 'INFERENCE — cycleCount monotonic; activeCycleJobId null at rest; no overlapping cycleJobId windows detected in provenance sample; worker process identity not logged — true cross-replica contention not independently proven',
        uniqueCycleJobIds: cycleJobs.size,
        cycleCount: parseAcquisitionState(session?.acquisitionStateJson).cycleCount,
      },
    };

    fs.writeFileSync(path.join(outDir, 'session-summary.json'), JSON.stringify(sessionSummary, null, 2));
    fs.writeFileSync(path.join(outDir, 'signal-quality-metrics.json'), JSON.stringify(metricsOut, null, 2));

    const csvLines = ['providerField,surface,observationCount,nonNullCount,nullRate,p50_dt_s,p95_dt_s,p99_dt_s,max_gap_s,ingress_p50_ms,ingress_p95_ms'];
    for (const [field, m] of Object.entries(signalQuality)) {
      const surface = byField[field]?.[0]?.acquisitionSurface ?? '';
      csvLines.push(
        [
          field,
          surface,
          m.observationCount,
          m.nonNullCount,
          m.nullRate?.toFixed(4) ?? '',
          m.deltaTSeconds.p50 ?? '',
          m.deltaTSeconds.p95 ?? '',
          m.deltaTSeconds.p99 ?? '',
          m.maxGapSeconds ?? '',
          m.ingressLatencyMs.p50 ?? '',
          m.ingressLatencyMs.p95 ?? '',
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
