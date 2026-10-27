const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const { createClient } = require('@clickhouse/client');

function loadBackendEnv(path) {
  const text = fs.readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const TRIP_IDS = process.argv.slice(2);
const VEHICLE = process.env.RPM_EXPORT_VEHICLE_ID ?? '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const SIGNAL = 'powertrainCombustionEngineSpeed';

async function main() {
  if (TRIP_IDS.length === 0) {
    console.error('usage: export-rpm-interval-fixture.cjs <tripId> ...');
    process.exit(1);
  }

  loadBackendEnv('/opt/synqdrive/shared/backend.env');

  const p = new PrismaClient();
  const ch = createClient({
    url: process.env.CLICKHOUSE_URL,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
    database: process.env.CLICKHOUSE_DATABASE ?? 'synqdrive',
    clickhouse_settings: { max_execution_time: 120 },
  });

  const out = [];
  for (const tripId of TRIP_IDS) {
    const trip = await p.vehicleTrip.findUnique({
      where: { id: tripId },
      select: { id: true, startTime: true, endTime: true },
    });
    if (!trip || !trip.endTime) {
      out.push({ tripId, error: trip ? 'NO_END_TIME' : 'NOT_IN_PG' });
      continue;
    }
    const r = await ch.query({
      query: `
        SELECT toUnixTimestamp64Milli(recorded_at) AS ms
        FROM synqdrive.telemetry_hf_points
        WHERE vehicle_id = {v:String}
          AND trip_id = {t:String}
          AND signal_name = {s:String}
        ORDER BY recorded_at
      `,
      query_params: { v: VEHICLE, t: tripId, s: SIGNAL },
      format: 'JSONEachRow',
    });
    const rows = await r.json();
    const intervals = [];
    for (let i = 1; i < rows.length; i += 1) {
      const d = (Number(rows[i].ms) - Number(rows[i - 1].ms)) / 1000;
      if (d > 0) intervals.push(Math.round(d * 10) / 10);
    }
    out.push({
      tripId,
      startMs: trip.startTime.getTime(),
      endMs: trip.endTime.getTime(),
      rpmPoints: rows.length,
      intervalsSec: intervals,
      source: 'production_clickhouse_export',
      exportedAt: new Date().toISOString(),
    });
  }

  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  await p.$disconnect();
  await ch.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
