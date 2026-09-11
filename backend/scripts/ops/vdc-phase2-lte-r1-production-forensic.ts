/**
 * VDC Phase 2 — read-only LTE_R1 Production forensics (single vehicle).
 * Usage (on VPS):
 *   SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env \
 *   npx ts-node -r tsconfig-paths/register scripts/ops/vdc-phase2-lte-r1-production-forensic.ts \
 *     --vehicle-id=<uuid> --org-id=<uuid> [--control-vehicle-id=<uuid>]
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { DimoPollJobType, DimoPollStatus, PrismaClient } from '@prisma/client';

async function loadClickHouseDistinctRecordedAt(
  vehicleId: string,
  since: Date | null,
): Promise<string[]> {
  const sinceClause = since
    ? `AND recorded_at >= parseDateTime64BestEffort('${since.toISOString()}')`
    : '';
  const query = `
    SELECT DISTINCT recorded_at
    FROM synqdrive.telemetry_snapshots
    WHERE vehicle_id = '${vehicleId}'
    ${sinceClause}
    ORDER BY recorded_at ASC
    FORMAT JSONEachRow
  `;
  try {
    if (fs.existsSync('/opt/synqdrive/shared/clickhouse-backup.env')) {
      for (const line of fs.readFileSync('/opt/synqdrive/shared/clickhouse-backup.env', 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
        }
      }
    }
    const user = process.env.CLICKHOUSE_USER ?? 'synqdrive';
    const password = process.env.CLICKHOUSE_PASSWORD ?? '';
    const database = process.env.CLICKHOUSE_DATABASE ?? 'synqdrive';
    const dockerArgs = [
      'exec',
      'synqdrive-clickhouse',
      'clickhouse-client',
      '--user',
      user,
      '--database',
      database,
      '--query',
      query,
    ];
    if (password) dockerArgs.push('--password', password);
    const out = execFileSync('docker', dockerArgs, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    if (!out.trim()) return [];
    return out
      .trim()
      .split('\n')
      .map((line) => {
        const row = JSON.parse(line) as { recorded_at: string };
        return new Date(row.recorded_at).toISOString();
      });
  } catch {
    return [];
  }
}

async function countProviderFetchedAdvances(
  _prisma: PrismaClient,
  _vehicleId: string,
  _since: Date | null,
): Promise<{ note: string }> {
  return {
    note: 'Historical provider_fetched_at series not retained in Postgres; infer from poll SUCCESS minus strict source advances',
  };
}

function loadEnv(): void {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function parseArg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function stats(nums: number[]) {
  if (nums.length === 0) {
    return { count: 0, min: null, max: null, mean: null, median: null, stdev: null };
  }
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((a, b) => a + b, 0);
  const mean = sum / nums.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const variance = nums.reduce((acc, n) => acc + (n - mean) ** 2, 0) / nums.length;
  return {
    count: nums.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Math.round(mean * 1000) / 1000,
    median: Math.round(median * 1000) / 1000,
    stdev: Math.round(Math.sqrt(variance) * 1000) / 1000,
  };
}

function formatHms(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function strictAdvances(timestamps: Date[]): Array<{ at: string; deltaSec: number | null; deltaHms: string | null }> {
  const out: Array<{ at: string; deltaSec: number | null; deltaHms: string | null }> = [];
  let prev: Date | null = null;
  for (const ts of timestamps) {
    const deltaSec = prev ? (ts.getTime() - prev.getTime()) / 1000 : null;
    out.push({
      at: ts.toISOString(),
      deltaSec: deltaSec == null ? null : Math.round(deltaSec),
      deltaHms: deltaSec == null ? null : formatHms(deltaSec),
    });
    prev = ts;
  }
  return out;
}

function extractSignalTimestamps(raw: Record<string, unknown> | null | undefined) {
  if (!raw) return {};
  const out: Record<string, string | null> = {};
  for (const [key, val] of Object.entries(raw)) {
    if (val && typeof val === 'object' && 'timestamp' in (val as object)) {
      const ts = (val as { timestamp?: string | null }).timestamp;
      out[key] = ts ?? null;
    }
  }
  return out;
}

async function analyzeVehicle(prisma: PrismaClient, vehicleId: string, organizationId: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, organizationId },
    select: {
      id: true,
      organizationId: true,
      licensePlate: true,
      hardwareType: true,
      dimoVehicleId: true,
      dimoVehicle: {
        select: { tokenId: true, connectionStatus: true, lastSignal: true, externalId: true },
      },
      latestState: {
        select: {
          sourceTimestamp: true,
          providerFetchedAt: true,
          lastSeenAt: true,
          providerBindingId: true,
          rawPayloadJson: true,
          updatedAt: true,
        },
      },
      dataSourceLinks: {
        where: { provider: 'DIMO' },
        orderBy: { activatedAt: 'desc' },
        select: {
          id: true,
          sourceType: true,
          sourceSubtype: true,
          isActive: true,
          activatedAt: true,
        },
      },
    },
  });
  if (!vehicle) return { error: 'vehicle_not_found' };

  const trips = await prisma.vehicleTrip.findMany({
    where: { vehicleId },
    orderBy: { startTime: 'desc' },
    take: 10,
    select: {
      id: true,
      startTime: true,
      endTime: true,
      tripStatus: true,
      distanceKm: true,
      maxSpeedKmh: true,
    },
  });

  const lastTrip = trips[0] ?? null;
  const stationaryStart = lastTrip?.endTime ?? lastTrip?.startTime ?? null;

  const pollLogs = stationaryStart
    ? await prisma.dimoPollLog.findMany({
        where: {
          vehicleId,
          jobType: DimoPollJobType.SNAPSHOT,
          startedAt: { gte: stationaryStart },
        },
        orderBy: { startedAt: 'asc' },
        select: {
          id: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          durationMs: true,
          errorCode: true,
        },
      })
    : [];

  const vlsHistory = await prisma.$queryRaw<
    Array<{ source_timestamp: Date | null; provider_fetched_at: Date | null; updated_at: Date }>
  >`
    SELECT source_timestamp, provider_fetched_at, updated_at
    FROM vehicle_latest_states
    WHERE vehicle_id = ${vehicleId}
  `;

  const clickhouseDistinctRecordedAt = await loadClickHouseDistinctRecordedAt(vehicleId, stationaryStart);

  const allSourceTs = new Map<string, Date>();
  if (vehicle.latestState?.sourceTimestamp) {
    allSourceTs.set(vehicle.latestState.sourceTimestamp.toISOString(), vehicle.latestState.sourceTimestamp);
  }
  for (const iso of clickhouseDistinctRecordedAt) {
    allSourceTs.set(iso, new Date(iso));
  }

  const uniqueSourceAsc = [...allSourceTs.values()].sort((a, b) => a.getTime() - b.getTime());
  const postTripSources = stationaryStart
    ? uniqueSourceAsc.filter((ts) => ts.getTime() >= stationaryStart.getTime())
    : uniqueSourceAsc;

  const strictTimeline = strictAdvances(postTripSources);
  const strictDeltas = strictTimeline
    .map((x) => x.deltaSec)
    .filter((x): x is number => x != null);

  const thresholdAnalysis = strictDeltas.map((delta) => ({
    deltaSec: delta,
    deltaHms: formatHms(delta),
    diffFrom86400: delta - 86400,
    diffFrom21600: delta - 21600,
    crosses24hBeforeNextAdvance: delta > 86400,
    transientSignalDelayedWindowSec: delta > 86400 ? delta - 86400 : 0,
  }));

  const pollSuccess = pollLogs.filter((p) => p.status === DimoPollStatus.SUCCESS).length;
  const pollFailure = pollLogs.length - pollSuccess;

  const events = await prisma.dimoDeviceConnectionEvent.findMany({
    where: { vehicleId, organizationId },
    orderBy: { observedAt: 'asc' },
    select: {
      id: true,
      eventType: true,
      observedAt: true,
      receivedAt: true,
      processedAt: true,
      rawPayloadJson: true,
    },
  });

  const inbox = await prisma.deviceConnectionWebhookInbox.findMany({
    where: { vehicleId, organizationId },
    orderBy: { receivedAt: 'asc' },
    select: {
      id: true,
      eventType: true,
      observedAt: true,
      receivedAt: true,
      processedAt: true,
      processingStatus: true,
    },
  });

  const episodes = await prisma.deviceConnectionEpisode.findMany({
    where: { vehicleId, organizationId },
    orderBy: { openedAt: 'asc' },
    select: {
      id: true,
      status: true,
      openedAt: true,
      resolvedAt: true,
      resolutionMethod: true,
      resolutionEvidenceAt: true,
      openedReason: true,
    },
  });

  const alerts = await prisma.notification.findMany({
    where: {
      organizationId,
      entityId: vehicleId,
      eventType: {
        in: [
          'TELEMETRY_SOFT_OFFLINE',
          'TELEMETRY_OFFLINE',
          'DEVICE_UNPLUGGED',
          'DEVICE_PLUGGED_IN',
          'OBD_DEVICE_UNPLUGGED',
          'OBD_DEVICE_PLUGGED_IN',
        ],
      },
    },
    orderBy: { lastSeenAt: 'desc' },
    take: 50,
    select: {
      id: true,
      eventType: true,
      firstSeenAt: true,
      lastSeenAt: true,
      status: true,
      conditionCode: true,
    },
  });

  const raw = vehicle.latestState?.rawPayloadJson as Record<string, unknown> | null | undefined;
  const signalTimestamps = extractSignalTimestamps(raw);

  const io174Search: Record<string, boolean> = {};
  const searchTerms = ['IO174', '174', 'sleep', 'wakeup', 'Ruptela', '0x10', 'keepalive', 'heartbeat'];
  const rawStr = JSON.stringify(raw ?? {});
  for (const term of searchTerms) {
    io174Search[term] = rawStr.toLowerCase().includes(term.toLowerCase());
  }
  for (const ev of events) {
    const s = JSON.stringify(ev.rawPayloadJson ?? {});
    for (const term of searchTerms) {
      if (s.toLowerCase().includes(term.toLowerCase())) io174Search[`event_${term}`] = true;
    }
  }

  const providerFetchedAdvances = await countProviderFetchedAdvances(prisma, vehicleId, stationaryStart);

  return {
    vehicle: {
      id: vehicle.id,
      organizationId: vehicle.organizationId,
      licensePlate: vehicle.licensePlate,
      hardwareType: vehicle.hardwareType,
      tokenId: vehicle.dimoVehicle?.tokenId ?? null,
      connectionStatus: vehicle.dimoVehicle?.connectionStatus ?? null,
      lastSignal: toIso(vehicle.dimoVehicle?.lastSignal ?? null),
      dataSourceLinks: vehicle.dataSourceLinks,
      latestState: {
        sourceTimestamp: toIso(vehicle.latestState?.sourceTimestamp ?? null),
        providerFetchedAt: toIso(vehicle.latestState?.providerFetchedAt ?? null),
        lastSeenAt: toIso(vehicle.latestState?.lastSeenAt ?? null),
        obdIsPluggedIn: (raw?.obdIsPluggedIn as { value?: boolean } | undefined)?.value ?? null,
      },
    },
    trips: trips.map((t) => ({
      id: t.id,
      startTime: toIso(t.startTime),
      endTime: toIso(t.endTime),
      tripStatus: t.tripStatus,
      distanceKm: t.distanceKm,
      maxSpeedKmh: t.maxSpeedKmh,
    })),
    lastTripStandbyStart: toIso(stationaryStart),
    strictSourceAdvances: {
      postTripCount: postTripSources.length,
      timeline: strictTimeline,
      deltaStatsSec: stats(strictDeltas),
      thresholdAnalysis,
    },
    polling: {
      windowStart: toIso(stationaryStart),
      total: pollLogs.length,
      success: pollSuccess,
      failure: pollFailure,
      strictSourceAdvances: postTripSources.length > 1 ? postTripSources.length - 1 : 0,
      successToStrictAdvanceRatio:
        postTripSources.length > 1 ? `${pollSuccess}:${postTripSources.length - 1}` : null,
      equalTimestampFullUpsertsEstimate: pollSuccess - (postTripSources.length > 1 ? postTripSources.length - 1 : 0),
      providerFetchedAdvances,
      pollLogsSample: pollLogs.slice(0, 5).map((p) => ({
        status: p.status,
        startedAt: toIso(p.startedAt),
      })),
      pollLogsTail: pollLogs.slice(-5).map((p) => ({
        status: p.status,
        startedAt: toIso(p.startedAt),
      })),
    },
    clickhouseTelemetrySnapshots: {
      distinctRecordedAtCount: clickhouseDistinctRecordedAt.length,
      note: 'CH recorded_at mirrors signalsLatest.lastSeen (source observation time), deduped per timestamp',
      postTripDistinctRecordedAt: clickhouseDistinctRecordedAt.filter(
        (iso) => !stationaryStart || new Date(iso).getTime() >= stationaryStart.getTime(),
      ),
    },
    deviceConnection: {
      events: events.map((e) => ({
        eventType: e.eventType,
        observedAt: toIso(e.observedAt),
        receivedAt: toIso(e.receivedAt),
        providerLatencySec: Math.round((e.receivedAt.getTime() - e.observedAt.getTime()) / 1000),
        processedAt: toIso(e.processedAt),
      })),
      inbox: inbox.map((r) => ({
        eventType: r.eventType,
        observedAt: toIso(r.observedAt),
        receivedAt: toIso(r.receivedAt),
        processingStatus: r.processingStatus,
      })),
      episodes: episodes.map((ep) => ({
        status: ep.status,
        openedAt: toIso(ep.openedAt),
        resolvedAt: toIso(ep.resolvedAt),
        resolutionMethod: ep.resolutionMethod,
        resolutionEvidenceAt: toIso(ep.resolutionEvidenceAt),
        openedReason: ep.openedReason,
      })),
    },
    alerts: alerts.map((a) => ({
      eventType: a.eventType,
      firstSeenAt: toIso(a.firstSeenAt),
      lastSeenAt: toIso(a.lastSeenAt),
      status: a.status,
      conditionCode: a.conditionCode,
    })),
    signalTimestampsLatest: signalTimestamps,
    io174Search,
    vlsRow: vlsHistory[0]
      ? {
          sourceTimestamp: toIso(vlsHistory[0].source_timestamp),
          providerFetchedAt: toIso(vlsHistory[0].provider_fetched_at),
          updatedAt: toIso(vlsHistory[0].updated_at),
        }
      : null,
  };
}

async function main(): Promise<void> {
  loadEnv();
  const vehicleId = parseArg('vehicle-id');
  const orgId = parseArg('org-id');
  const controlId = parseArg('control-vehicle-id');
  if (!vehicleId || !orgId) {
    console.error('Usage: --vehicle-id= --org-id= [--control-vehicle-id=]');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const primary = await analyzeVehicle(prisma, vehicleId, orgId);

    let control: unknown = null;
    if (controlId) {
      const cv = await prisma.vehicle.findFirst({
        where: { id: controlId },
        select: { organizationId: true },
      });
      if (cv) control = await analyzeVehicle(prisma, controlId, cv.organizationId);
    } else {
      const alt = await prisma.vehicle.findFirst({
        where: {
          hardwareType: 'LTE_R1',
          id: { not: vehicleId },
          latestState: { sourceTimestamp: { not: null } },
        },
        select: { id: true, organizationId: true, licensePlate: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (alt) {
        control = {
          candidate: alt,
          analysis: await analyzeVehicle(prisma, alt.id, alt.organizationId),
        };
      }
    }

    const lteR1Fleet = await prisma.vehicle.count({ where: { hardwareType: 'LTE_R1' } });

    console.log(
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          primary,
          control,
          lteR1FleetCount: lteR1Fleet,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
