#!/usr/bin/env node
/**
 * Read-only ClickHouse HF extract for KS MX 2026-09-04 refuel incident.
 * Usage on VPS: BACKEND_ENV=/opt/synqdrive/shared/backend.env node refuel-incident-ch-extract.mjs
 * Uses production credential pattern: CLICKHOUSE_URL + USER + PASSWORD + DATABASE.
 */
import { createClient } from '@clickhouse/client';
import { readFileSync } from 'fs';

const VEHICLE_ID = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63';
const FROM = '2026-09-04 03:30:00';
const TO = '2026-09-04 04:10:00';

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    env[t.slice(0, i)] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

async function main() {
  const env = loadEnv(process.env.BACKEND_ENV || '/opt/synqdrive/shared/backend.env');
  const url = env.CLICKHOUSE_URL;
  if (!url) {
    console.log(JSON.stringify({ ok: false, error: 'CLICKHOUSE_URL unset' }));
    return;
  }

  const client = createClient({
    url,
    username: env.CLICKHOUSE_USER,
    password: env.CLICKHOUSE_PASSWORD,
    database: env.CLICKHOUSE_DATABASE || 'synqdrive',
  });

  const signals = [
    'currentLocationLatitude',
    'currentLocationLongitude',
    'speed',
    'powertrainFuelSystemAbsoluteLevel',
    'powertrainFuelSystemRelativeLevel',
    'odometer',
    'isIgnitionOn',
  ];

  try {
    const ping = await client.ping();
    const q = `
      SELECT
        formatDateTime(recorded_at, '%Y-%m-%d %H:%i:%S') AS recorded_utc,
        formatDateTime(ingested_at, '%Y-%m-%d %H:%i:%S') AS ingested_utc,
        signal_name,
        value_float,
        value_string,
        source
      FROM telemetry_hf_points
      WHERE vehicle_id = {vehicleId:String}
        AND recorded_at >= toDateTime64({fromTs:String}, 3, 'UTC')
        AND recorded_at < toDateTime64({toTs:String}, 3, 'UTC')
        AND signal_name IN {signals:Array(String)}
      ORDER BY recorded_at, signal_name
      LIMIT 8000
    `;
    const result = await client.query({
      query: q,
      query_params: { vehicleId: VEHICLE_ID, fromTs: FROM, toTs: TO, signals },
      format: 'JSONEachRow',
    });
    const rows = await result.json();
    console.log(JSON.stringify({ ok: true, ping, row_count: rows.length, rows }, null, 0));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: err.message }));
  } finally {
    await client.close();
  }
}

main();
