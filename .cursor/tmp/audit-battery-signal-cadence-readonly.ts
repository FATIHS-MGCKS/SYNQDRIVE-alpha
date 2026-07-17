import * as fs from 'fs';
import { PrismaClient, DimoPollJobType, DimoPollStatus } from '@prisma/client';

const DAYS = 30;
const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000);

function pct(arr: number[], q: number): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor(q * s.length));
  return s[i];
}
function median(arr: number[]): number | null { return pct(arr, 0.5); }

async function chQuery(sql: string): Promise<string[][]> {
  const url = process.env.CLICKHOUSE_URL || 'http://127.0.0.1:8123';
  const user = process.env.CLICKHOUSE_USER || 'default';
  const pass = process.env.CLICKHOUSE_PASSWORD || '';
  const db = process.env.CLICKHOUSE_DATABASE || 'synqdrive';
  const u = new URL(url);
  const auth = Buffer.from(`${user}:${pass}`).toString('base64');
  const res = await fetch(`${u.origin}/?database=${encodeURIComponent(db)}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'text/plain' },
    body: sql,
  });
  if (!res.ok) throw new Error(`CH ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.text()).trim().split('\n').filter(Boolean).map((l) => l.split('\t'));
}

function loadEnv() {
  const envPath = '/opt/synqdrive/shared/backend.env';
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

async function main() {
  loadEnv();
  const p = new PrismaClient();
  const out: Record<string, unknown> = { generatedAt: new Date().toISOString(), periodDays: DAYS, since: since.toISOString() };

  const vehicles = await p.vehicle.findMany({
    where: { dimoVehicleId: { not: null } },
    select: {
      id: true, licensePlate: true, fuelType: true, make: true, model: true,
      dimoVehicle: { select: { connectionStatus: true } },
      _count: { select: { trips: true, pollLogs: true } },
    },
  });
  vehicles.sort((a, b) => b._count.pollLogs - a._count.pollLogs);
  const label = (v: { id: string; licensePlate: string | null }) =>
    v.licensePlate === 'KS FH 660E' ? 'KS FH 660E' : `veh-${v.id.slice(0, 8)}`;

  out.vehicles = vehicles.map((v) => ({
    id: v.id, label: label(v), fuelType: v.fuelType,
    makeModel: `${v.make ?? ''} ${v.model ?? ''}`.trim(),
    connected: v.dimoVehicle?.connectionStatus,
    tripCount: v._count.trips, pollLogCount: v._count.pollLogs,
  }));

  out.pollLogRange = await p.dimoPollLog.aggregate({
    where: { jobType: DimoPollJobType.SNAPSHOT, createdAt: { gte: since } },
    _min: { createdAt: true }, _max: { createdAt: true }, _count: true,
  });

  const pollIntervals: Record<string, unknown> = {};
  for (const v of vehicles) {
    const logs = await p.dimoPollLog.findMany({
      where: { vehicleId: v.id, jobType: DimoPollJobType.SNAPSHOT, createdAt: { gte: since } },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true, status: true, finishedAt: true },
    });
    const gaps: number[] = [];
    const freshness: number[] = [];
    for (let i = 1; i < logs.length; i++) {
      gaps.push((logs[i].startedAt.getTime() - logs[i - 1].startedAt.getTime()) / 1000);
    }
    for (const l of logs) {
      if (l.finishedAt) freshness.push(l.finishedAt.getTime() - l.startedAt.getTime());
    }
    pollIntervals[v.id] = {
      label: label(v), fuelType: v.fuelType, polls: logs.length,
      success: logs.filter((l) => l.status === DimoPollStatus.SUCCESS).length,
      failure: logs.filter((l) => l.status === DimoPollStatus.FAILURE).length,
      gapMedianSec: median(gaps), gapP95Sec: pct(gaps, 0.95), gapMaxSec: gaps.length ? Math.max(...gaps) : null,
      durationMedianMs: median(freshness), durationP95Ms: pct(freshness, 0.95),
    };
  }
  out.pollIntervals = pollIntervals;

  try {
    const chRange = await chQuery(`SELECT min(recorded_at), max(recorded_at), count() FROM telemetry_snapshots WHERE recorded_at >= now() - INTERVAL ${DAYS} DAY FORMAT TabSeparated`);
    out.chRange = { min: chRange[0][0], max: chRange[0][1], count: Number(chRange[0][2]) };
  } catch (e) { out.chRange = { error: e instanceof Error ? e.message : String(e) }; }

  const chVehicles = await chQuery(`SELECT vehicle_id, count() FROM telemetry_snapshots WHERE recorded_at >= now() - INTERVAL ${DAYS} DAY GROUP BY vehicle_id ORDER BY count() DESC FORMAT TabSeparated`).catch(() => []);

  const chPerVehicle: Record<string, unknown> = {};
  for (const [vehicleId] of chVehicles) {
    const rows = await chQuery(`SELECT recorded_at, speed_kmh, is_ignition_on, ev_soc, traction_kw, odometer_km FROM telemetry_snapshots WHERE vehicle_id = '${vehicleId}' AND recorded_at >= now() - INTERVAL ${DAYS} DAY ORDER BY recorded_at FORMAT TabSeparated`);
    const gaps: number[] = [];
    let repeatRec = 0;
    const uniqueRec = new Set<string>();
    let socRepeat = 0;
    let prevSoc: number | null = null;
    let maxSocStreak = 0, streak = 0;

    for (let i = 0; i < rows.length; i++) {
      uniqueRec.add(rows[i][0]);
      if (i > 0) {
        if (rows[i][0] === rows[i - 1][0]) repeatRec++;
        gaps.push((new Date(rows[i][0] + 'Z').getTime() - new Date(rows[i - 1][0] + 'Z').getTime()) / 1000);
      }
      const soc = rows[i][3] === '\\N' || !rows[i][3] ? null : Number(rows[i][3]);
      if (soc != null && prevSoc === soc) { streak++; socRepeat++; } else { maxSocStreak = Math.max(maxSocStreak, streak); streak = 0; }
      prevSoc = soc;
    }
    maxSocStreak = Math.max(maxSocStreak, streak);

    const v = vehicles.find((x) => x.id === vehicleId);
    chPerVehicle[vehicleId] = {
      label: v ? label(v) : `veh-${vehicleId.slice(0, 8)}`, fuelType: v?.fuelType,
      rows: rows.length, uniqueRecordedAt: uniqueRec.size,
      repeatRecordedAtPct: rows.length > 1 ? (repeatRec / (rows.length - 1)) * 100 : 0,
      gapMedianSec: median(gaps), gapP95Sec: pct(gaps, 0.95), gapMaxSec: gaps.length ? Math.max(...gaps) : null,
      maxSameEvSocStreak: maxSocStreak, socUnchangedBetweenPolls: socRepeat,
      pctIgnition: rows.filter((r) => r[2] !== '\\N' && r[2] !== '').length / Math.max(rows.length, 1),
      pctEvSoc: rows.filter((r) => r[3] !== '\\N' && r[3] !== '').length / Math.max(rows.length, 1),
      pctSpeed: rows.filter((r) => r[1] !== '\\N' && r[1] !== '').length / Math.max(rows.length, 1),
      pctTraction: rows.filter((r) => r[4] !== '\\N' && r[4] !== '').length / Math.max(rows.length, 1),
    };
  }
  out.chPerVehicle = chPerVehicle;

  out.pollVsPersist = Object.fromEntries(vehicles.map((v) => {
    const pi = pollIntervals[v.id] as { polls: number };
    const ch = chPerVehicle[v.id] as { rows?: number } | undefined;
    return [v.id, { label: label(v), requestPolls: pi.polls, chRows: ch?.rows ?? 0, ratioPct: pi.polls ? ((ch?.rows ?? 0) / pi.polls) * 100 : null }];
  }));

  out.batteryHealthSnapshots = await p.batteryHealthSnapshot.groupBy({
    by: ['vehicleId'], where: { recordedAt: { gte: since } },
    _count: true, _min: { recordedAt: true }, _max: { recordedAt: true },
  });

  out.hvSnapshots = await p.$queryRaw`SELECT vehicle_id, COUNT(*)::bigint cnt, COUNT(DISTINCT recorded_at)::bigint unique_rec, MIN(recorded_at) min_at, MAX(recorded_at) max_at FROM hv_battery_health_snapshots WHERE recorded_at >= ${since} GROUP BY vehicle_id`;

  const hvGaps: Record<string, unknown> = {};
  for (const v of vehicles.filter((x) => ['ELECTRIC', 'PLUGIN_HYBRID'].includes(x.fuelType))) {
    const snaps = await p.hvBatteryHealthSnapshot.findMany({
      where: { vehicleId: v.id, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' }, select: { recordedAt: true, socPercent: true }, take: 10000,
    });
    const gaps: number[] = [];
    let sameSoc = 0;
    for (let i = 1; i < snaps.length; i++) {
      gaps.push((snaps[i].recordedAt.getTime() - snaps[i - 1].recordedAt.getTime()) / 1000);
      if (snaps[i].socPercent === snaps[i - 1].socPercent) sameSoc++;
    }
    hvGaps[v.id] = { label: label(v), rows: snaps.length, gapMedianSec: median(gaps), gapP95Sec: pct(gaps, 0.95), gapMaxSec: gaps.length ? Math.max(...gaps) : null, sameSocRows: sameSoc };
  }
  out.hvGaps = hvGaps;

  const ks = vehicles.find((v) => v.licensePlate === 'KS FH 660E');
  if (ks) {
    const vls = await p.vehicleLatestState.findUnique({ where: { vehicleId: ks.id } });
    const det = await p.vehicleTripDetectionState.findUnique({ where: { vehicleId: ks.id } });
    const ageMs = vls?.sourceTimestamp && vls?.providerFetchedAt ? vls.providerFetchedAt.getTime() - vls.sourceTimestamp.getTime() : null;
    out.ksFh660e = { fuelType: ks.fuelType, state: det?.state, lastSeenAt: vls?.lastSeenAt, sourceTimestamp: vls?.sourceTimestamp, providerFetchedAt: vls?.providerFetchedAt, fetchMinusSourceMs: ageMs, lv: vls?.lvBatteryVoltage, evSoc: vls?.evSoc, speed: vls?.speedKmh, ignition: vls?.isIgnitionOn };
    const rows = await chQuery(`SELECT recorded_at, speed_kmh, is_ignition_on, ev_soc FROM telemetry_snapshots WHERE vehicle_id = '${ks.id}' AND recorded_at >= now() - INTERVAL ${DAYS} DAY ORDER BY recorded_at FORMAT TabSeparated`).catch(() => []);
    let driving = 0, lowSpeed = 0;
    for (const r of rows) {
      const speed = r[1] === '\\N' ? 0 : Number(r[1]);
      if (speed > 5) driving++; else lowSpeed++;
    }
    out.ksFh660eMotion = { drivingRows: driving, lowSpeedRows: lowSpeed, total: rows.length };
  }

  console.log(JSON.stringify(out, null, 2));
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
