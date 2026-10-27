import { PrismaClient } from '@prisma/client';
import { createClient } from '@clickhouse/client';
import { writeFileSync } from 'node:fs';

const TRIP_IDS = process.argv.slice(2);
const VEHICLE = process.env.RPM_EXPORT_VEHICLE_ID ?? '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const SIGNAL = 'powertrainCombustionEngineSpeed';

async function main() {
  if (TRIP_IDS.length === 0) {
    console.error('Usage: export-rpm-interval-fixture.mts <tripId> [...]');
    process.exit(1);
  }
  const p = new PrismaClient();
  const ch = createClient({
    url: process.env.CLICKHOUSE_URL!,
    clickhouse_settings: { max_execution_time: 120 },
  });

  const out: unknown[] = [];
  for (const tripId of TRIP_IDS) {
    const trip = await p.vehicleTrip.findUnique({
      where: { id: tripId },
      select: { id: true, startTime: true, endTime: true },
    });
    if (!trip) {
      out.push({ tripId, error: 'NOT_IN_PG' });
      continue;
    }
    const r = await ch.query({
      query: `
        SELECT toUnixTimestamp64Milli(recorded_at) AS ms
        FROM synqdrive.telemetry_hf_points
        WHERE vehicle_id = {v:String}
          AND trip_id = {t:String}
          AND signal_name = {s:String}
        ORDER BY ts
      `,
      query_params: { v: VEHICLE, t: tripId, s: SIGNAL },
      format: 'JSONEachRow',
    });
    const rows = (await r.json()) as { ms: string }[];
    const intervals: number[] = [];
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

  writeFileSync(process.stdout.fd, `${JSON.stringify(out, null, 2)}\n`);
  await p.$disconnect();
  await ch.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
