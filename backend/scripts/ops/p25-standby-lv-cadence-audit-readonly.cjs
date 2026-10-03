#!/usr/bin/env node
/**
 * P2.5 addendum — LTE_R1 standby low-voltage (battery) source cadence (read-only).
 * Uses battery_measurements LIVE_VOLTAGE provider_timestamp — NOT API fetch time.
 *
 * Run on VPS:
 *   sudo bash -c 'set -a; source /opt/synqdrive/shared/backend.env; set +a; node /path/to/p25-standby-lv-cadence-audit-readonly.cjs'
 */
'use strict';

const { Client } = require('pg');

const R9_TOKEN_IDS = [186946, 187336, 187361, 187784, 192922];

function quantile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function bucketHistogram(intervalsSec) {
  const buckets = {
    lt1h: 0,
    h1_4: 0,
    h4_6: 0,
    h6_7: 0,
    h7_9: 0,
    h9_12: 0,
    h12_24: 0,
    gt24h: 0,
  };
  for (const s of intervalsSec) {
    const h = s / 3600;
    if (h < 1) buckets.lt1h++;
    else if (h < 4) buckets.h1_4++;
    else if (h < 6) buckets.h4_6++;
    else if (h < 7) buckets.h6_7++;
    else if (h < 9) buckets.h7_9++;
    else if (h < 12) buckets.h9_12++;
    else if (h < 24) buckets.h12_24++;
    else buckets.gt24h++;
  }
  return buckets;
}

function match8hWindow(intervalSec) {
  const h = intervalSec / 3600;
  return h >= 7 && h <= 9;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL required');
    process.exit(2);
  }
  const client = new Client({ connectionString: url });
  await client.connect();

  const { rows: vehicles } = await client.query(
    `
    SELECT v.id AS vehicle_id, v.license_plate, dv.token_id
    FROM vehicles v
    JOIN dimo_vehicles dv ON v.dimo_vehicle_id = dv.id
    WHERE v.hardware_type = 'LTE_R1'
      AND dv.token_id = ANY($1::int[])
    ORDER BY dv.token_id
    `,
    [R9_TOKEN_IDS],
  );

  const perVehicle = [];
  const allIntervals = [];

  for (const v of vehicles) {
    const { rows } = await client.query(
      `
      WITH lv AS (
        SELECT m.provider_timestamp AS pt
        FROM battery_measurements m
        WHERE m.vehicle_id = $1
          AND m.type = 'LIVE_VOLTAGE'
          AND m.quality = 'VALID'
          AND m.provider_timestamp IS NOT NULL
          AND (m.context->>'engineRunning')::boolean IS FALSE
          AND (m.context->>'speedKmh')::float IS NOT NULL
          AND (m.context->>'speedKmh')::float <= 0.5
          AND (m.context->>'ignitionOn')::boolean IS FALSE
          AND NOT COALESCE((m.context->>'isLvCharging')::boolean, false)
          AND NOT COALESCE((m.context->>'isHvCharging')::boolean, false)
        ORDER BY m.provider_timestamp
      ),
      dedup AS (
        SELECT DISTINCT pt FROM lv
      ),
      gaps AS (
        SELECT
          EXTRACT(EPOCH FROM (pt - LAG(pt) OVER (ORDER BY pt))) AS gap_s
        FROM dedup
      )
      SELECT gap_s FROM gaps WHERE gap_s IS NOT NULL AND gap_s > 60
      `,
      [v.vehicle_id],
    );
    const intervals = rows.map((r) => Number(r.gap_s)).filter((n) => Number.isFinite(n));
    intervals.sort((a, b) => a - b);
    for (const g of intervals) allIntervals.push(g);

    const in8h = intervals.filter(match8hWindow);
    perVehicle.push({
      tokenId: v.token_id,
      licensePlate: v.license_plate,
      intervalCount: intervals.length,
      p50: quantile(intervals, 0.5),
      p90: quantile(intervals, 0.9),
      p95: quantile(intervals, 0.95),
      p99: quantile(intervals, 0.99),
      max: intervals.length ? intervals[intervals.length - 1] : null,
      match8hCount: in8h.length,
      match8hRate: intervals.length ? in8h.length / intervals.length : null,
    });
  }

  allIntervals.sort((a, b) => a - b);
  const fleet = {
    vehicleCount: vehicles.length,
    intervalCount: allIntervals.length,
    p10: quantile(allIntervals, 0.1),
    p25: quantile(allIntervals, 0.25),
    median: quantile(allIntervals, 0.5),
    p75: quantile(allIntervals, 0.75),
    p90: quantile(allIntervals, 0.9),
    p95: quantile(allIntervals, 0.95),
    p99: quantile(allIntervals, 0.99),
    max: allIntervals.length ? allIntervals[allIntervals.length - 1] : null,
    histogram: bucketHistogram(allIntervals),
    match8hCount: allIntervals.filter(match8hWindow).length,
    match8hRate: allIntervals.length
      ? allIntervals.filter(match8hWindow).length / allIntervals.length
      : null,
  };

  const vehiclesWith8h =
    perVehicle.filter((p) => p.intervalCount > 0 && (p.match8hRate ?? 0) >= 0.25).length;

  console.log(
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        cohort: 'R9_AUTHORIZED_LTE_R1',
        signal: 'lowVoltageBatteryCurrentVoltage',
        measurementType: 'LIVE_VOLTAGE',
        timestampField: 'battery_measurements.provider_timestamp',
        CONFIGURED_STANDBY_VOLTAGE_INTERVAL_HOURS: 8,
        fleet,
        perVehicle,
        OBSERVED_8H_CADENCE_VEHICLE_COUNT: vehiclesWith8h,
      },
      null,
      2,
    ),
  );

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
