/**
 * Phase-0 diagnostic: LTE_R1 native driving-event quality analysis.
 *
 * Quantifies event spam, burst duplicates, raw-vs-visible gap, and fleet baseline
 * for a target vehicle (default: WOB L 7503 Tiguan).
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/analyze-lte-r1-driving-event-quality.ts
 *   npx ts-node -r tsconfig-paths/register scripts/analyze-lte-r1-driving-event-quality.ts --plate "7503" --days 14
 */
import { PrismaClient, type DrivingEventType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

{
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

const TIMESTAMP_BUCKET_MS = 2_000;

type DrivingEventRow = {
  id: string;
  eventType: DrivingEventType;
  recordedAt: Date;
  metadataJson: unknown;
};

function parseArgs(): { plate: string; days: number; vehicleId?: string } {
  const args = process.argv.slice(2);
  let plate = '7503';
  let days = 14;
  let vehicleId: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--plate' && args[i + 1]) plate = args[++i];
    else if (args[i] === '--days' && args[i + 1]) days = Number(args[++i]);
    else if (args[i] === '--vehicleId' && args[i + 1]) vehicleId = args[++i];
  }
  return { plate, days, vehicleId };
}

function normalizeDedupeEventType(eventType: DrivingEventType): string {
  switch (eventType) {
    case 'HARSH_BRAKING':
    case 'EXTREME_BRAKING':
      return 'braking';
    case 'HARSH_ACCELERATION':
      return 'acceleration';
    case 'HARSH_CORNERING':
      return 'cornering';
    default:
      return `native:${eventType.toLowerCase()}`;
  }
}

function dedupeNativeEvents(events: DrivingEventRow[]): DrivingEventRow[] {
  const sorted = [...events].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const merged: DrivingEventRow[] = [];
  for (const event of sorted) {
    const normType = normalizeDedupeEventType(event.eventType);
    const t = event.recordedAt.getTime();
    let mergedInto = false;
    for (let i = merged.length - 1; i >= 0; i -= 1) {
      const existing = merged[i];
      if (normalizeDedupeEventType(existing.eventType) !== normType) continue;
      if (Math.abs(existing.recordedAt.getTime() - t) > TIMESTAMP_BUCKET_MS) break;
      mergedInto = true;
      break;
    }
    if (!mergedInto) merged.push(event);
  }
  return merged;
}

function burstDuplicateCount(events: DrivingEventRow[]): number {
  if (events.length < 2) return 0;
  const sorted = [...events].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  let bursts = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const sameType = prev.eventType === cur.eventType;
    const within2s = Math.abs(cur.recordedAt.getTime() - prev.recordedAt.getTime()) <= TIMESTAMP_BUCKET_MS;
    if (sameType && within2s) bursts += 1;
  }
  return bursts;
}

function sameSecondDuplicateGroups(events: DrivingEventRow[]): Array<{ second: string; type: string; count: number }> {
  const buckets = new Map<string, number>();
  for (const e of events) {
    const sec = Math.floor(e.recordedAt.getTime() / 1000);
    const key = `${sec}|${e.eventType}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .filter(([, c]) => c > 1)
    .map(([key, count]) => {
      const [sec, type] = key.split('|');
      return { second: new Date(Number(sec) * 1000).toISOString(), type, count };
    })
    .sort((a, b) => b.count - a.count);
}

function readCounterValue(meta: unknown): number | null {
  if (!meta || typeof meta !== 'object') return null;
  const raw = meta as Record<string, unknown>;
  if (typeof raw.dimoCounterValue === 'number') return raw.dimoCounterValue;
  return null;
}

interface TripMetrics {
  tripId: string;
  startTime: string;
  endTime: string | null;
  distanceKm: number | null;
  durationMin: number | null;
  enrichStatus: string | null;
  kpiHardBraking: number | null;
  kpiAbuse: number | null;
  rawNativeCount: number;
  visibleDedupedCount: number;
  rawVsVisibleRatio: number | null;
  eventsPerKm: number | null;
  eventsPerMin: number | null;
  burstDuplicates: number;
  burstDuplicateRatio: number | null;
  sameSecondGroups: number;
  topSameSecond: Array<{ second: string; type: string; count: number }>;
  typeBreakdown: Record<string, number>;
  tripAssessmentStatus: string | null;
  analysisAssessability: string | null;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function pct(nums: number[], p: number): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[idx];
}

async function main() {
  const { plate, days, vehicleId: argVehicleId } = parseArgs();
  const prisma = new PrismaClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const vehicle = argVehicleId
      ? await prisma.vehicle.findUnique({
          where: { id: argVehicleId },
          select: {
            id: true,
            licensePlate: true,
            make: true,
            model: true,
            hardwareType: true,
            organizationId: true,
            dimoVehicle: { select: { tokenId: true, connectionStatus: true } },
          },
        })
      : await prisma.vehicle.findFirst({
          where: { licensePlate: { contains: plate, mode: 'insensitive' } },
          select: {
            id: true,
            licensePlate: true,
            make: true,
            model: true,
            hardwareType: true,
            organizationId: true,
            dimoVehicle: { select: { tokenId: true, connectionStatus: true } },
          },
        });

    if (!vehicle) {
      console.error(`[lte-r1-quality] No vehicle for plate fragment "${plate}"`);
      process.exit(1);
    }

    console.log('=== TARGET VEHICLE ===');
    console.log(JSON.stringify(vehicle, null, 2));

    const trips = await prisma.vehicleTrip.findMany({
      where: {
        vehicleId: vehicle.id,
        startTime: { gte: since },
        tripStatus: 'COMPLETED',
        endTime: { not: null },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        distanceKm: true,
        behaviorEnrichmentStatus: true,
        hardBrakingCount: true,
        abuseEvents: true,
        behaviorSummaryJson: true,
      },
      orderBy: { startTime: 'desc' },
      take: 50,
    });

    const tripMetrics: TripMetrics[] = [];

    for (const trip of trips) {
      const events = await prisma.drivingEvent.findMany({
        where: { tripId: trip.id, source: 'TELEMETRY_EVENTS' },
        select: { id: true, eventType: true, recordedAt: true, metadataJson: true },
        orderBy: { recordedAt: 'asc' },
      });

      const deduped = dedupeNativeEvents(events);
      const durationMin =
        trip.endTime && trip.startTime
          ? (trip.endTime.getTime() - trip.startTime.getTime()) / 60_000
          : null;
      const raw = events.length;
      const visible = deduped.length;
      const bursts = burstDuplicateCount(events);
      const sameSec = sameSecondDuplicateGroups(events);
      const typeBreakdown: Record<string, number> = {};
      for (const e of events) {
        typeBreakdown[e.eventType] = (typeBreakdown[e.eventType] ?? 0) + 1;
      }

      const summary =
        trip.behaviorSummaryJson && typeof trip.behaviorSummaryJson === 'object'
          ? (trip.behaviorSummaryJson as Record<string, unknown>)
          : {};

      tripMetrics.push({
        tripId: trip.id,
        startTime: trip.startTime.toISOString(),
        endTime: trip.endTime?.toISOString() ?? null,
        distanceKm: trip.distanceKm,
        durationMin,
        enrichStatus: trip.behaviorEnrichmentStatus,
        kpiHardBraking: trip.hardBrakingCount,
        kpiAbuse: trip.abuseEvents,
        rawNativeCount: raw,
        visibleDedupedCount: visible,
        rawVsVisibleRatio: visible > 0 ? raw / visible : raw > 0 ? raw : null,
        eventsPerKm:
          trip.distanceKm && trip.distanceKm > 0 ? raw / trip.distanceKm : null,
        eventsPerMin: durationMin && durationMin > 0 ? raw / durationMin : null,
        burstDuplicates: bursts,
        burstDuplicateRatio: raw > 0 ? bursts / raw : null,
        sameSecondGroups: sameSec.length,
        topSameSecond: sameSec.slice(0, 5),
        typeBreakdown,
        tripAssessmentStatus: null,
        analysisAssessability:
          typeof summary.analysisAssessability === 'string'
            ? summary.analysisAssessability
            : null,
      });
    }

    console.log(`\n=== TRIP METRICS (last ${days}d, n=${tripMetrics.length}) ===`);
    for (const m of tripMetrics) {
      console.log(
        `\n[${m.tripId.slice(0, 8)}] ${m.startTime} (${m.distanceKm?.toFixed(1) ?? '—'} km, ${m.durationMin?.toFixed(0) ?? '—'} min)`,
      );
      console.log(
        `  raw=${m.rawNativeCount} visible=${m.visibleDedupedCount} ratio=${m.rawVsVisibleRatio?.toFixed(2) ?? '—'} ` +
          `perKm=${m.eventsPerKm?.toFixed(2) ?? '—'} perMin=${m.eventsPerMin?.toFixed(2) ?? '—'}`,
      );
      console.log(
        `  burstDup=${m.burstDuplicates} (${((m.burstDuplicateRatio ?? 0) * 100).toFixed(0)}%) sameSecGroups=${m.sameSecondGroups}`,
      );
      console.log(
        `  KPI brake=${m.kpiHardBraking} abuse=${m.kpiAbuse} assessment=${m.tripAssessmentStatus} assessability=${m.analysisAssessability}`,
      );
      console.log(`  types=${JSON.stringify(m.typeBreakdown)}`);
      if (m.topSameSecond.length > 0) {
        console.log(`  topSameSecond=${JSON.stringify(m.topSameSecond)}`);
      }
    }

    const rawCounts = tripMetrics.map((m) => m.rawNativeCount);
    const perKm = tripMetrics.map((m) => m.eventsPerKm).filter((v): v is number => v != null);
    const burstRatios = tripMetrics
      .map((m) => m.burstDuplicateRatio)
      .filter((v): v is number => v != null);
    const ratios = tripMetrics
      .map((m) => m.rawVsVisibleRatio)
      .filter((v): v is number => v != null);

    console.log('\n=== TARGET SUMMARY ===');
    console.log(
      JSON.stringify(
        {
          trips: tripMetrics.length,
          totalRawEvents: rawCounts.reduce((a, b) => a + b, 0),
          medianRawPerTrip: median(rawCounts),
          maxRawPerTrip: rawCounts.length ? Math.max(...rawCounts) : null,
          medianEventsPerKm: median(perKm),
          maxEventsPerKm: perKm.length ? Math.max(...perKm) : null,
          medianBurstRatio: median(burstRatios),
          maxBurstRatio: burstRatios.length ? Math.max(...burstRatios) : null,
          medianRawVsVisible: median(ratios),
          maxRawVsVisible: ratios.length ? Math.max(...ratios) : null,
          tripsWithBurstRatioGte30Pct: burstRatios.filter((r) => r >= 0.3).length,
          tripsWithRawGte5: rawCounts.filter((c) => c >= 5).length,
        },
        null,
        2,
      ),
    );

    // Fleet baseline: other LTE_R1 in same org
    const fleetVehicles = await prisma.vehicle.findMany({
      where: {
        organizationId: vehicle.organizationId,
        hardwareType: 'LTE_R1',
        id: { not: vehicle.id },
      },
      select: { id: true, licensePlate: true },
    });

    const fleetPerKm: number[] = [];
    const fleetRawPerTrip: number[] = [];

    for (const fv of fleetVehicles) {
      const fTrips = await prisma.vehicleTrip.findMany({
        where: {
          vehicleId: fv.id,
          startTime: { gte: since },
          tripStatus: 'COMPLETED',
          endTime: { not: null },
          distanceKm: { gt: 1 },
        },
        select: { id: true, distanceKm: true },
        take: 30,
      });
      for (const ft of fTrips) {
        const cnt = await prisma.drivingEvent.count({
          where: { tripId: ft.id, source: 'TELEMETRY_EVENTS' },
        });
        if (cnt > 0) {
          fleetRawPerTrip.push(cnt);
          if (ft.distanceKm && ft.distanceKm > 0) fleetPerKm.push(cnt / ft.distanceKm);
        }
      }
    }

    console.log('\n=== FLEET BASELINE (org LTE_R1 peers, excl. target) ===');
    console.log(
      JSON.stringify(
        {
          peerVehicles: fleetVehicles.length,
          peerTripsWithEvents: fleetRawPerTrip.length,
          medianRawPerTrip: median(fleetRawPerTrip),
          p95RawPerTrip: pct(fleetRawPerTrip, 95),
          medianEventsPerKm: median(fleetPerKm),
          p95EventsPerKm: pct(fleetPerKm, 95),
        },
        null,
        2,
      ),
    );

    const connEvents = await prisma.dimoDeviceConnectionEvent.findMany({
      where: { vehicleId: vehicle.id, observedAt: { gte: since } },
      select: { eventType: true, observedAt: true },
      orderBy: { observedAt: 'desc' },
      take: 100,
    });
    const connByType: Record<string, number> = {};
    for (const e of connEvents) {
      connByType[e.eventType] = (connByType[e.eventType] ?? 0) + 1;
    }

    console.log('\n=== DEVICE CONNECTION EVENTS (last ' + days + 'd) ===');
    console.log(JSON.stringify({ total: connEvents.length, byType: connByType }, null, 2));

    // Sample raw event timeline for worst trip
    const worst = [...tripMetrics].sort((a, b) => b.rawNativeCount - a.rawNativeCount)[0];
    if (worst && worst.rawNativeCount > 0) {
      const sample = await prisma.drivingEvent.findMany({
        where: { tripId: worst.tripId, source: 'TELEMETRY_EVENTS' },
        select: { eventType: true, recordedAt: true, metadataJson: true },
        orderBy: { recordedAt: 'asc' },
        take: 40,
      });
      console.log(`\n=== SAMPLE TIMELINE (worst trip ${worst.tripId.slice(0, 8)}, first 40 events) ===`);
      for (const e of sample) {
        const meta = e.metadataJson as Record<string, unknown> | null;
        console.log(
          `  ${e.recordedAt.toISOString()} ${e.eventType} name=${meta?.dimoEventName ?? '—'} counter=${readCounterValue(meta) ?? '—'}`,
        );
      }
    }

    console.log('\n=== DETECTOR PREVIEW (proposed thresholds, not production) ===');
    const flagged = tripMetrics.filter(
      (m) =>
        (m.eventsPerKm != null && m.eventsPerKm >= 2) ||
        (m.burstDuplicateRatio != null && m.burstDuplicateRatio >= 0.3) ||
        (m.rawVsVisibleRatio != null && m.rawVsVisibleRatio >= 2) ||
        m.rawNativeCount >= 8,
    );
    console.log(
      JSON.stringify(
        {
          flaggedTrips: flagged.length,
          totalTrips: tripMetrics.length,
          wouldActivateVehicleState: flagged.length >= 2,
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
  console.error('[lte-r1-quality] Failed:', err);
  process.exit(1);
});
