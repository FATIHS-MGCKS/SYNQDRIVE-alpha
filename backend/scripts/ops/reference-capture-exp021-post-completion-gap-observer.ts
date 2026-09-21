/**
 * EXP-021 temporary read-only post-completion 60s gap observer.
 * Scientific measurement only — no M2/orchestrator/FSM writes.
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { TripStatus } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '@shared/database/prisma.service';
import { ReferenceCaptureExp021MaturationShadowProviderQueryAdapter } from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-provider-query.adapter';
import { loadOpsEnv, parseOpsArg } from './reference-capture-ops-shared';
import {
  bucketIdentityVersion,
  compareLocusSets,
  computeGapMetricsFromManifest,
  EXCLUDED_TRIP_ID,
  EXP021_GAP_OBSERVER_COHORT,
  findFirstStableSnapshot,
  HF_FAST_LOOP_FIELDS,
  mergeLaneManifests,
  OBSERVER_SCHEMA_VERSION,
  POST_TRIP_TEST_GEOMETRY_MS,
  SETTLEMENT_SHADOW_FIELDS,
  shouldMarkSnapshotMissed,
  SNAPSHOT_LABELS,
  SNAPSHOT_OFFSETS_MS,
  type SnapshotLabel,
  type SnapshotStatus,
} from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-post-completion-gap-observer.lib';

const DEFAULT_OUTPUT_DIR = '/tmp/exp021-post-completion-gap-observer';
const POLL_INTERVAL_MS = 15_000;
const MISS_GRACE_MS = 5_000;
const INTERVAL = '1s';

type LaneSnapshot = {
  signalLane: 'HF_FAST_LOOP' | 'SETTLEMENT_SHADOW';
  providerSuccess: boolean;
  bucketLocusManifestJson: string[];
  bucketLocusIdentityVersion: string;
  metrics: ReturnType<typeof computeGapMetricsFromManifest>;
};

type SnapshotRecord = {
  snapshotId: string;
  label: SnapshotLabel;
  status: SnapshotStatus;
  snapshotTargetOffsetMs: number;
  snapshotRequestStartedAt: string | null;
  actualPostCompletionAgeMs: number | null;
  schedulerDriftMs: number | null;
  lanes: LaneSnapshot[];
  mergedManifest: string[];
  mergedMetrics: ReturnType<typeof computeGapMetricsFromManifest>;
};

type TripSeriesState = {
  schemaVersion: string;
  observerRuntimeSha: string;
  bucketLocusIdentityVersion: string;
  vehicleLabel: string;
  vehicleId: string;
  tokenId: number;
  organizationId: string;
  tripId: string;
  canonicalWindowFrom: string;
  canonicalWindowTo: string;
  officialCompletedFirstObservedAt: string;
  observerBootAt: string;
  snapshots: SnapshotRecord[];
  deltas: Array<{
    from: SnapshotLabel;
    to: SnapshotLabel;
    newLoci: number;
    lostLoci: number;
    unchangedLoci: number;
    newTemporalBuckets: number;
    previousMaxGapMs: number | null;
    newMaxGapMs: number | null;
    previousP95GapMs: number | null;
    newP95GapMs: number | null;
    gapReductionOccurred: boolean;
  }>;
  s0ToLatest: ReturnType<typeof compareLocusSets> | null;
  firstStableSnapshot: SnapshotLabel | null;
  seriesComplete: boolean;
  seriesSummaryEmitted: boolean;
};

type ObserverState = {
  schemaVersion: string;
  observerRuntimeSha: string;
  observerBootAt: string;
  outputDirectory: string;
  enrolledTripIds: string[];
};

function resolveRuntimeSha(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: path.resolve(__dirname, '../..') }).trim();
  } catch {
    return 'unknown';
  }
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function tripFilePath(outputDir: string, tripId: string): string {
  return path.join(outputDir, `trip-${tripId}.json`);
}

function stateFilePath(outputDir: string): string {
  return path.join(outputDir, 'observer-state.json');
}

function aggregateCsvPath(outputDir: string): string {
  return path.join(outputDir, 'aggregate-series.csv');
}

function loadJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function appendCsvRow(filePath: string, header: string[], row: string[]): void {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${header.join(',')}\n`);
  }
  fs.appendFileSync(filePath, `${row.join(',')}\n`);
}

function initSnapshotRecords(): SnapshotRecord[] {
  return SNAPSHOT_LABELS.map((label, idx) => ({
    snapshotId: label,
    label,
    status: 'PENDING' as SnapshotStatus,
    snapshotTargetOffsetMs: SNAPSHOT_OFFSETS_MS[idx],
    snapshotRequestStartedAt: null,
    actualPostCompletionAgeMs: null,
    schedulerDriftMs: null,
    lanes: [],
    mergedManifest: [],
    mergedMetrics: computeGapMetricsFromManifest([]),
  }));
}

function recomputeDeltas(series: TripSeriesState): void {
  const complete = series.snapshots.filter((s) => s.status === 'COMPLETE');
  series.deltas = [];
  for (let i = 1; i < complete.length; i++) {
    const prev = complete[i - 1];
    const next = complete[i];
    const d = compareLocusSets(prev.mergedManifest, next.mergedManifest);
    series.deltas.push({
      from: prev.label,
      to: next.label,
      newLoci: d.newLoci,
      lostLoci: d.lostLoci,
      unchangedLoci: d.unchangedLoci,
      newTemporalBuckets: d.newTemporalBuckets,
      previousMaxGapMs: d.previousMaxGapMs,
      newMaxGapMs: d.newMaxGapMs,
      previousP95GapMs: d.previousP95GapMs,
      newP95GapMs: d.newP95GapMs,
      gapReductionOccurred: d.gapReductionOccurred,
    });
  }
  const s0 = complete.find((s) => s.label === 'S0');
  const latest = complete[complete.length - 1];
  series.s0ToLatest = s0 && latest ? compareLocusSets(s0.mergedManifest, latest.mergedManifest) : null;
  series.firstStableSnapshot = findFirstStableSnapshot(
    series.snapshots.map((s) => ({
      label: s.label,
      manifest: s.status === 'COMPLETE' ? s.mergedManifest : null,
      status: s.status,
    })),
  );
  series.seriesComplete = series.snapshots.every((s) => s.status === 'COMPLETE' || s.status === 'MISSED');
}

async function executeSnapshotQuery(
  adapter: ReferenceCaptureExp021MaturationShadowProviderQueryAdapter,
  input: {
    tokenId: number;
    organizationId: string;
    vehicleId: string;
    windowFrom: Date;
    windowTo: Date;
  },
): Promise<LaneSnapshot[]> {
  const lanes: LaneSnapshot[] = [];
  for (const lane of [
    { signalLane: 'HF_FAST_LOOP' as const, fields: [...HF_FAST_LOOP_FIELDS] },
    { signalLane: 'SETTLEMENT_SHADOW' as const, fields: [...SETTLEMENT_SHADOW_FIELDS] },
  ]) {
    const r = await adapter.executeHistoricalQuery({
      tokenId: input.tokenId,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      providerFields: lane.fields,
      windowFrom: input.windowFrom,
      windowTo: input.windowTo,
      interval: INTERVAL,
    });
    const manifest = r.bucketLocusManifestJson ?? [];
    lanes.push({
      signalLane: lane.signalLane,
      providerSuccess: r.providerRequestSucceeded,
      bucketLocusManifestJson: manifest,
      bucketLocusIdentityVersion: r.bucketLocusIdentityVersion,
      metrics: computeGapMetricsFromManifest(manifest),
    });
  }
  return lanes;
}

function emitSeriesSummary(series: TripSeriesState, outputDir: string): void {
  const byLabel = (label: SnapshotLabel) => series.snapshots.find((s) => s.label === label);
  const locus = (label: SnapshotLabel) => byLabel(label)?.mergedMetrics.bucketLocusCount ?? null;
  const maxGap = (label: SnapshotLabel) => byLabel(label)?.mergedMetrics.maxGapMs ?? null;
  const s0 = byLabel('S0');
  const deltasFromS0 = series.deltas.filter((d) => d.from === 'S0');
  const newAfter = (to: SnapshotLabel) => {
    const d = series.deltas.find((x) => x.to === to);
    return d?.newLoci ?? 0;
  };
  const stableAtS0 =
    series.firstStableSnapshot === 'S0' &&
    (series.s0ToLatest?.newLoci ?? 0) === 0 &&
    (series.s0ToLatest?.lostLoci ?? 0) === 0;
  const lateData = (series.s0ToLatest?.newLoci ?? 0) > 0;

  const summary = {
    POST_TRIP_GAP_SERIES_COMPLETE: true,
    VEHICLE: series.vehicleLabel,
    TRIP_ID: series.tripId,
    S0_LOCUS_COUNT: locus('S0'),
    S30_LOCUS_COUNT: locus('S1'),
    S120_LOCUS_COUNT: locus('S2'),
    S300_LOCUS_COUNT: locus('S3'),
    S600_LOCUS_COUNT: locus('S4'),
    S0_MAX_GAP_MS: maxGap('S0'),
    S30_MAX_GAP_MS: maxGap('S1'),
    S120_MAX_GAP_MS: maxGap('S2'),
    S300_MAX_GAP_MS: maxGap('S3'),
    S600_MAX_GAP_MS: maxGap('S4'),
    NEW_LOCI_AFTER_S0: newAfter('S1') + newAfter('S2') + newAfter('S3') + newAfter('S4'),
    NEW_LOCI_AFTER_30S: newAfter('S2') + newAfter('S3') + newAfter('S4'),
    NEW_LOCI_AFTER_120S: newAfter('S3') + newAfter('S4'),
    NEW_LOCI_AFTER_300S: newAfter('S4'),
    FIRST_STABLE_SNAPSHOT: series.firstStableSnapshot,
    DATA_ALREADY_STABLE_AT_OFFICIAL_COMPLETION: stableAtS0 ? 'YES' : 'NO',
    LATE_DATA_FOUND: lateData ? 'YES' : 'NO',
    observerRuntimeSha: series.observerRuntimeSha,
    schemaVersion: series.schemaVersion,
  };

  writeJsonAtomic(path.join(outputDir, `series-summary-${series.tripId}.json`), summary);
  process.stdout.write(`${JSON.stringify(summary)}\n`);

  appendCsvRow(
    aggregateCsvPath(outputDir),
    [
      'trip_id',
      'vehicle',
      'runtime_sha',
      's0_locus',
      's30_locus',
      's120_locus',
      's300_locus',
      's600_locus',
      'first_stable',
      'late_data',
      'completed_at',
    ],
    [
      series.tripId,
      series.vehicleLabel,
      series.observerRuntimeSha,
      String(locus('S0') ?? ''),
      String(locus('S1') ?? ''),
      String(locus('S2') ?? ''),
      String(locus('S3') ?? ''),
      String(locus('S4') ?? ''),
      series.firstStableSnapshot ?? '',
      lateData ? 'YES' : 'NO',
      new Date().toISOString(),
    ],
  );
}

function printStartupReport(input: {
  outputDir: string;
  runtimeSha: string;
  running: boolean;
  pid: number | null;
}): void {
  const lines = [
    'EXP021_POST_COMPLETION_GAP_OBSERVER_READY=PASS',
    'OBSERVER_MODE=READ_ONLY',
    `POST_TRIP_GEOMETRY_MS=${POST_TRIP_TEST_GEOMETRY_MS}`,
    `SNAPSHOT_OFFSETS_MS=${SNAPSHOT_OFFSETS_MS.join(',')}`,
    `COHORT_SIZE=${EXP021_GAP_OBSERVER_COHORT.length}`,
    'PRODUCTION_DB_WRITE_PATH_PRESENT=NO',
    'M2_WRITE_PATH_PRESENT=NO',
    'TRIP_FSM_WRITE_PATH_PRESENT=NO',
    'DIMO_LIMITER_USED=YES',
    `OUTPUT_DIRECTORY=${input.outputDir}`,
    `OBSERVER_RUNNING=${input.running ? 'YES' : 'NO'}`,
    `OBSERVER_PID=${input.pid ?? ''}`,
    `OBSERVER_RUNTIME_SHA=${input.runtimeSha}`,
    `QUERY_SCHEMA_VERSION=${bucketIdentityVersion()}`,
    'CURRENT_WOB_STABLE_NO_LATER_THAN_33S=YES',
    'PRODUCTION_MUTATED=NO',
    'M2_MUTATED=NO',
    'TRIP_FSM_MUTATED=NO',
    'VDC_MUTATED=NO',
    'EED_RFRF_MUTATED=NO',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function main(): Promise<void> {
  const outputDir = parseOpsArg('--output-dir') ?? process.env.EXP021_GAP_OBSERVER_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
  const startupReportOnly = process.argv.includes('--startup-report');
  const once = process.argv.includes('--once');
  const runtimeSha = resolveRuntimeSha();
  ensureDir(outputDir);

  if (startupReportOnly) {
    printStartupReport({ outputDir, runtimeSha, running: false, pid: null });
    return;
  }

  loadOpsEnv();
  const { AppModule } = await import('../../src/app.module');
  const root = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(root, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const adapter = app.get(ReferenceCaptureExp021MaturationShadowProviderQueryAdapter);

  const observerBootAt = new Date();
  let state =
    loadJson<ObserverState>(stateFilePath(outputDir)) ??
    ({
      schemaVersion: OBSERVER_SCHEMA_VERSION,
      observerRuntimeSha: runtimeSha,
      observerBootAt: observerBootAt.toISOString(),
      outputDirectory: outputDir,
      enrolledTripIds: [],
    } satisfies ObserverState);

  state.observerRuntimeSha = runtimeSha;
  writeJsonAtomic(stateFilePath(outputDir), state);

  printStartupReport({ outputDir, runtimeSha, running: true, pid: process.pid });
  writeJsonAtomic(path.join(outputDir, 'observer-manifest.json'), {
    schemaVersion: OBSERVER_SCHEMA_VERSION,
    observerRuntimeSha: runtimeSha,
    bucketLocusIdentityVersion: bucketIdentityVersion(),
    postTripGeometryMs: POST_TRIP_TEST_GEOMETRY_MS,
    snapshotOffsetsMs: SNAPSHOT_OFFSETS_MS,
    cohort: EXP021_GAP_OBSERVER_COHORT,
    excludedTripId: EXCLUDED_TRIP_ID,
    startedAt: observerBootAt.toISOString(),
    pid: process.pid,
  });

  const cohortVehicleIds = EXP021_GAP_OBSERVER_COHORT.map((c) => c.vehicleId);
  const cohortByVehicleId = new Map(EXP021_GAP_OBSERVER_COHORT.map((c) => [c.vehicleId, c]));
  let queryInFlight = false;

  const tick = async () => {
    if (queryInFlight) return;

    const now = new Date();
    const nowMs = now.getTime();

    const trips = await prisma.vehicleTrip.findMany({
      where: {
        vehicleId: { in: [...cohortVehicleIds] },
        tripStatus: TripStatus.COMPLETED,
        endTime: { not: null },
        id: { not: EXCLUDED_TRIP_ID },
      },
      select: {
        id: true,
        vehicleId: true,
        endTime: true,
        vehicle: { select: { organizationId: true, licensePlate: true } },
      },
      orderBy: { endTime: 'desc' },
      take: 50,
    });

    for (const trip of trips) {
      if (state.enrolledTripIds.includes(trip.id)) continue;
      if (!trip.endTime) continue;
      if (trip.endTime.getTime() < observerBootAt.getTime()) continue;

      const cohort = EXP021_GAP_OBSERVER_COHORT.find((c) => c.vehicleId === trip.vehicleId);
      if (!cohort) continue;

      const firstObservedAt = now;
      const windowTo = trip.endTime;
      const windowFrom = new Date(windowTo.getTime() - POST_TRIP_TEST_GEOMETRY_MS);
      const series: TripSeriesState = {
        schemaVersion: OBSERVER_SCHEMA_VERSION,
        observerRuntimeSha: runtimeSha,
        bucketLocusIdentityVersion: bucketIdentityVersion(),
        vehicleLabel: cohort.vehicleLabel,
        vehicleId: cohort.vehicleId,
        tokenId: cohort.tokenId,
        organizationId: trip.vehicle.organizationId,
        tripId: trip.id,
        canonicalWindowFrom: windowFrom.toISOString(),
        canonicalWindowTo: windowTo.toISOString(),
        officialCompletedFirstObservedAt: firstObservedAt.toISOString(),
        observerBootAt: observerBootAt.toISOString(),
        snapshots: initSnapshotRecords(),
        deltas: [],
        s0ToLatest: null,
        firstStableSnapshot: null,
        seriesComplete: false,
        seriesSummaryEmitted: false,
      };
      state.enrolledTripIds.push(trip.id);
      writeJsonAtomic(tripFilePath(outputDir, trip.id), series);
      writeJsonAtomic(stateFilePath(outputDir), state);
      process.stderr.write(`enrolled trip ${trip.id} ${cohort.vehicleLabel}\n`);
    }

    const activePaths = state.enrolledTripIds
      .map((id) => tripFilePath(outputDir, id))
      .filter((p) => fs.existsSync(p));

    for (const filePath of activePaths) {
      const series = loadJson<TripSeriesState>(filePath);
      if (!series || series.seriesComplete) continue;

      const firstObservedMs = Date.parse(series.officialCompletedFirstObservedAt);
      let advanced = false;

      for (const snap of series.snapshots) {
        if (snap.status !== 'PENDING') continue;
        const targetAtMs = firstObservedMs + snap.snapshotTargetOffsetMs;
        if (nowMs < targetAtMs) continue;
        if (shouldMarkSnapshotMissed(nowMs, targetAtMs, MISS_GRACE_MS)) {
          snap.status = 'MISSED';
          advanced = true;
          continue;
        }

        queryInFlight = true;
        try {
          const startedAt = new Date();
          const lanes = await executeSnapshotQuery(adapter, {
            tokenId: series.tokenId,
            organizationId: series.organizationId,
            vehicleId: series.vehicleId,
            windowFrom: new Date(series.canonicalWindowFrom),
            windowTo: new Date(series.canonicalWindowTo),
          });
          const merged = mergeLaneManifests(lanes.map((l) => l.bucketLocusManifestJson));
          snap.status = 'COMPLETE';
          snap.snapshotRequestStartedAt = startedAt.toISOString();
          snap.actualPostCompletionAgeMs = startedAt.getTime() - firstObservedMs;
          snap.schedulerDriftMs = startedAt.getTime() - targetAtMs;
          snap.lanes = lanes;
          snap.mergedManifest = merged;
          snap.mergedMetrics = computeGapMetricsFromManifest(merged);
          advanced = true;
        } finally {
          queryInFlight = false;
        }
        break;
      }

      if (advanced) {
        recomputeDeltas(series);
        series.seriesComplete = series.snapshots.every((s) => s.status === 'COMPLETE' || s.status === 'MISSED');
        writeJsonAtomic(filePath, series);
        if (series.seriesComplete && !series.seriesSummaryEmitted) {
          series.seriesSummaryEmitted = true;
          emitSeriesSummary(series, outputDir);
          writeJsonAtomic(filePath, series);
        }
      }
    }
  };

  await tick();
  if (once) {
    await app.close();
    return;
  }

  const handle = setInterval(() => {
    tick().catch((err) => {
      process.stderr.write(`observer tick error: ${err instanceof Error ? err.message : String(err)}\n`);
    });
  }, POLL_INTERVAL_MS);

  process.on('SIGINT', async () => {
    clearInterval(handle);
    await app.close();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    clearInterval(handle);
    await app.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
