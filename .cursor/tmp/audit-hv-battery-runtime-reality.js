/* READ-ONLY Prompt 6/8 — HV battery runtime reality */
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

const DAYS = 30;
const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000);
const sinceIso = since.toISOString();

function loadEnv() {
  const envPath = '/opt/synqdrive/shared/backend.env';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

function explain(p, sql) {
  try {
    const rows = p.$queryRawUnsafe(`EXPLAIN (FORMAT JSON) ${sql}`);
    return rows;
  } catch (e) {
    return { error: e.message };
  }
}

function pct(n, d) {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

(async () => {
  loadEnv();
  const p = new PrismaClient();
  const out = { auditAt: new Date().toISOString(), since: sinceIso, days: DAYS };

  // ── Fleet / BEV vehicle ──
  const vehicles = await p.vehicle.findMany({
    where: { dimoVehicleId: { not: null } },
    select: {
      id: true,
      licensePlate: true,
      fuelType: true,
      make: true,
      model: true,
      hvBatteryCapacityKwh: true,
    },
  });
  const bevs = vehicles.filter((v) => ['ELECTRIC', 'EV', 'BEV', 'PLUGIN_HYBRID'].includes((v.fuelType || '').toUpperCase()));
  out.fleet = {
    totalDimo: vehicles.length,
    bevCount: bevs.length,
    bevs: bevs.map((v) => ({
      id: v.id,
      plate: v.licensePlate,
      fuelType: v.fuelType,
      make: v.make,
      model: v.model,
      nominalKwh: v.hvBatteryCapacityKwh,
    })),
  };

  const bevIds = bevs.map((v) => v.id);
  const bevId = bevs.find((v) => v.licensePlate === 'KS FH 660E')?.id ?? bevs[0]?.id;

  // ── Table sizes (safe) ──
  const [sizeRows] = await p.$queryRaw`
    SELECT
      pg_total_relation_size('hv_battery_health_snapshots')::bigint AS hv_snapshots_bytes,
      pg_relation_size('hv_battery_health_snapshots')::bigint AS hv_snapshots_table_bytes,
      pg_total_relation_size('battery_evidence')::bigint AS evidence_bytes,
      (SELECT reltuples::bigint FROM pg_class WHERE relname = 'hv_battery_health_snapshots') AS hv_est_rows
  `;
  out.tableSize = sizeRows;

  // ── HV snapshot totals ──
  const [totals30d] = await p.$queryRaw`
    SELECT
      COUNT(*)::int AS rows_30d,
      COUNT(DISTINCT vehicle_id)::int AS vehicles_30d,
      MIN(recorded_at) AS min_recorded,
      MAX(recorded_at) AS max_recorded
    FROM hv_battery_health_snapshots
    WHERE recorded_at >= ${since}
  `;
  const [totalsAll] = await p.$queryRaw`
    SELECT COUNT(*)::int AS rows_all FROM hv_battery_health_snapshots
  `;
  out.hvTotals = { ...totals30d, rows_all: totalsAll.rows_all };

  // Per vehicle (30d)
  out.perVehicle30d = await p.$queryRaw`
    SELECT vehicle_id, COUNT(*)::int AS rows,
      COUNT(DISTINCT recorded_at)::int AS distinct_recorded_at,
      MIN(recorded_at) AS min_at, MAX(recorded_at) AS max_at
    FROM hv_battery_health_snapshots
    WHERE recorded_at >= ${since}
    GROUP BY vehicle_id
    ORDER BY rows DESC
  `;

  // Per day fleet (30d)
  out.perDayFleet = await p.$queryRaw`
    SELECT DATE_TRUNC('day', recorded_at AT TIME ZONE 'UTC')::date AS day,
      COUNT(*)::int AS rows
    FROM hv_battery_health_snapshots
    WHERE recorded_at >= ${since}
    GROUP BY 1 ORDER BY 1
  `;

  // Per month
  out.perMonth = await p.$queryRaw`
    SELECT DATE_TRUNC('month', recorded_at AT TIME ZONE 'UTC')::date AS month,
      COUNT(*)::int AS rows
    FROM hv_battery_health_snapshots
    GROUP BY 1 ORDER BY 1
  `;

  // Avg row size estimate
  const totalBytes = Number(sizeRows.hv_snapshots_bytes || 0);
  const totalRows = Number(totalsAll.rows_all || 1);
  out.avgRowBytesEst = Math.round(totalBytes / totalRows);

  // ── Uniqueness (BEV only, 30d) ──
  if (bevId) {
    const [uniq] = await p.$queryRaw`
      SELECT
        COUNT(*)::int AS total,
        COUNT(DISTINCT recorded_at)::int AS distinct_recorded_at,
        COUNT(DISTINCT (soc_percent, energy_used_kwh, is_charging, charging_power_kw))::int AS distinct_payloads
      FROM hv_battery_health_snapshots
      WHERE vehicle_id = ${bevId} AND recorded_at >= ${since}
    `;
    const [dupTs] = await p.$queryRaw`
      SELECT COUNT(*)::int AS duplicate_timestamp_groups
      FROM (
        SELECT recorded_at FROM hv_battery_health_snapshots
        WHERE vehicle_id = ${bevId} AND recorded_at >= ${since}
        GROUP BY recorded_at HAVING COUNT(*) > 1
      ) t
    `;
    const [dupRows] = await p.$queryRaw`
      SELECT COALESCE(SUM(cnt - 1), 0)::int AS extra_rows_from_dup_ts
      FROM (
        SELECT recorded_at, COUNT(*)::int AS cnt
        FROM hv_battery_health_snapshots
        WHERE vehicle_id = ${bevId} AND recorded_at >= ${since}
        GROUP BY recorded_at HAVING COUNT(*) > 1
      ) t
    `;
    const [identicalPayload] = await p.$queryRaw`
      SELECT COUNT(*)::int AS groups
      FROM (
        SELECT soc_percent, energy_used_kwh, is_charging, charging_power_kw, COUNT(*)::int AS c
        FROM hv_battery_health_snapshots
        WHERE vehicle_id = ${bevId} AND recorded_at >= ${since}
        GROUP BY 1,2,3,4 HAVING COUNT(*) > 10
      ) t
    `;
    out.uniqueness = {
      ...uniq,
      duplicate_timestamp_groups: dupTs.duplicate_timestamp_groups,
      extra_rows_from_dup_ts: dupRows.extra_rows_from_dup_ts,
      heavy_identical_payload_groups: identicalPayload.groups,
      repeat_recorded_at_pct: pct(uniq.total - uniq.distinct_recorded_at, uniq.total),
    };

    // ── Poll vs HV ratio ──
    const [polls] = await p.$queryRaw`
      SELECT COUNT(*)::int AS polls
      FROM dimo_poll_logs
      WHERE vehicle_id = ${bevId} AND started_at >= ${since} AND job_type = 'SNAPSHOT'
    `;
    out.pollVsHv = {
      polls: polls.polls,
      hvRows: uniq.total,
      ratioPct: pct(uniq.total, polls.polls),
    };

    // ── SOC deltas (sample last 5000 rows ordered by recorded_at) ──
    const socPairs = await p.$queryRaw`
      WITH ordered AS (
        SELECT recorded_at, soc_percent, energy_used_kwh, is_charging, charging_power_kw,
          LAG(recorded_at) OVER (ORDER BY recorded_at) AS prev_at,
          LAG(soc_percent) OVER (ORDER BY recorded_at) AS prev_soc,
          LAG(energy_used_kwh) OVER (ORDER BY recorded_at) AS prev_energy,
          EXTRACT(EPOCH FROM (recorded_at - LAG(recorded_at) OVER (ORDER BY recorded_at))) AS gap_sec
        FROM hv_battery_health_snapshots
        WHERE vehicle_id = ${bevId} AND recorded_at >= ${since}
        ORDER BY recorded_at
        LIMIT 8000
      )
      SELECT
        COUNT(*)::int AS pairs,
        COUNT(*) FILTER (WHERE prev_soc IS NOT NULL AND soc_percent = prev_soc)::int AS soc_unchanged,
        COUNT(*) FILTER (WHERE prev_soc IS NOT NULL AND ABS(soc_percent - prev_soc) >= 5)::int AS delta_soc_ge5,
        COUNT(*) FILTER (WHERE prev_soc IS NOT NULL AND ABS(soc_percent - prev_soc) > 0 AND ABS(soc_percent - prev_soc) < 5)::int AS delta_soc_lt5,
        COUNT(*) FILTER (WHERE gap_sec = 0)::int AS zero_gap,
        COUNT(*) FILTER (WHERE gap_sec > 0 AND gap_sec <= 60)::int AS gap_le_60s,
        COUNT(*) FILTER (WHERE gap_sec > 3600)::int AS gap_gt_1h,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ABS(soc_percent - prev_soc)) FILTER (WHERE prev_soc IS NOT NULL) AS median_abs_delta_soc,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ABS(soc_percent - prev_soc)) FILTER (WHERE prev_soc IS NOT NULL) AS p95_abs_delta_soc,
        MAX(ABS(soc_percent - prev_soc)) FILTER (WHERE prev_soc IS NOT NULL) AS max_abs_delta_soc
      FROM ordered
      WHERE prev_at IS NOT NULL
    `;
    out.socBehavior = socPairs[0];
    if (socPairs[0]?.pairs) {
      const p = socPairs[0];
      out.socBehavior.soc_unchanged_pct = pct(p.soc_unchanged, p.pairs);
      out.socBehavior.delta_soc_ge5_pct = pct(p.delta_soc_ge5, p.pairs);
    }

    // ── Energy signal behavior ──
    const energyStats = await p.$queryRaw`
      WITH ordered AS (
        SELECT recorded_at, energy_used_kwh,
          LAG(energy_used_kwh) OVER (ORDER BY recorded_at) AS prev_energy,
          LAG(recorded_at) OVER (ORDER BY recorded_at) AS prev_at
        FROM hv_battery_health_snapshots
        WHERE vehicle_id = ${bevId} AND recorded_at >= ${since} AND energy_used_kwh IS NOT NULL
        ORDER BY recorded_at
        LIMIT 8000
      )
      SELECT
        COUNT(*)::int AS with_energy,
        COUNT(*) FILTER (WHERE prev_energy IS NOT NULL AND energy_used_kwh = prev_energy)::int AS energy_unchanged,
        COUNT(*) FILTER (WHERE prev_energy IS NOT NULL AND energy_used_kwh < prev_energy)::int AS energy_decreased,
        COUNT(*) FILTER (WHERE prev_energy IS NOT NULL AND energy_used_kwh > prev_energy)::int AS energy_increased,
        MIN(energy_used_kwh) AS min_kwh,
        MAX(energy_used_kwh) AS max_kwh,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY energy_used_kwh) AS median_kwh
      FROM ordered
    `;
    out.energySignal = energyStats[0];

    // ── Capacity measurements ──
    const [capMeas] = await p.$queryRaw`
      SELECT
        COUNT(*) FILTER (WHERE estimated_capacity_kwh IS NOT NULL)::int AS with_estimated_capacity,
        COUNT(*) FILTER (WHERE soh_percent IS NOT NULL)::int AS with_soh,
        COUNT(*)::int AS total
      FROM hv_battery_health_snapshots
      WHERE vehicle_id = ${bevId}
    `;
    const [capMeas30d] = await p.$queryRaw`
      SELECT COUNT(*)::int AS with_estimated_capacity_30d
      FROM hv_battery_health_snapshots
      WHERE vehicle_id = ${bevId} AND recorded_at >= ${since} AND estimated_capacity_kwh IS NOT NULL
    `;
    out.capacityMeasurements = { ...capMeas, ...capMeas30d };

    // Sample capacity measurements
    out.capacitySamples = await p.$queryRaw`
      SELECT recorded_at, soc_percent, energy_used_kwh, estimated_capacity_kwh, soh_percent
      FROM hv_battery_health_snapshots
      WHERE vehicle_id = ${bevId} AND estimated_capacity_kwh IS NOT NULL
      ORDER BY recorded_at DESC
      LIMIT 15
    `;

    // Pairs meeting >=5% rule (all-time, last 5000 snapshots window via subquery)
    const pairRule = await p.$queryRaw`
      WITH snaps AS (
        SELECT recorded_at, soc_percent, energy_used_kwh
        FROM hv_battery_health_snapshots
        WHERE vehicle_id = ${bevId}
        ORDER BY recorded_at DESC
        LIMIT 5000
      ),
      ordered AS (
        SELECT *, LAG(soc_percent) OVER (ORDER BY recorded_at) AS prev_soc,
          LAG(energy_used_kwh) OVER (ORDER BY recorded_at) AS prev_energy,
          LAG(recorded_at) OVER (ORDER BY recorded_at) AS prev_at,
          EXTRACT(EPOCH FROM (recorded_at - LAG(recorded_at) OVER (ORDER BY recorded_at))) AS gap_sec
        FROM snaps
      )
      SELECT
        COUNT(*) FILTER (WHERE prev_soc IS NOT NULL)::int AS total_pairs,
        COUNT(*) FILTER (WHERE prev_soc IS NOT NULL AND ABS(soc_percent - prev_soc) >= 5 AND prev_energy IS NOT NULL AND energy_used_kwh IS NOT NULL AND ABS(energy_used_kwh - prev_energy) > 0)::int AS meets_delta_rule,
        COUNT(*) FILTER (WHERE prev_soc IS NOT NULL AND ABS(soc_percent - prev_soc) >= 5 AND gap_sec > 300)::int AS ge5_with_gap_gt_5min,
        COUNT(*) FILTER (WHERE prev_soc IS NOT NULL AND ABS(soc_percent - prev_soc) >= 5 AND (gap_sec IS NULL OR gap_sec <= 60))::int AS ge5_adjacent_60s
      FROM ordered
    `;
    out.capacityPairAnalysis = pairRule[0];

    // ── Charging ──
    const [charging] = await p.$queryRaw`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_charging = true)::int AS is_charging_true,
        COUNT(*) FILTER (WHERE charging_power_kw IS NOT NULL AND charging_power_kw > 0)::int AS power_gt_0,
        MAX(charging_power_kw) AS max_power_kw,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY charging_power_kw) FILTER (WHERE charging_power_kw > 0) AS median_power_kw
      FROM hv_battery_health_snapshots
      WHERE vehicle_id = ${bevId} AND recorded_at >= ${since}
    `;
    out.charging = charging;

    // Charging transitions (is_charging false->true)
    const chTrans = await p.$queryRaw`
      WITH o AS (
        SELECT recorded_at, is_charging, soc_percent, energy_used_kwh, charging_power_kw, temperature_c,
          LAG(is_charging) OVER (ORDER BY recorded_at) AS prev_charging
        FROM hv_battery_health_snapshots
        WHERE vehicle_id = ${bevId} AND recorded_at >= ${since}
        ORDER BY recorded_at
        LIMIT 10000
      )
      SELECT COUNT(*) FILTER (WHERE is_charging = true AND prev_charging = false)::int AS charge_starts,
        COUNT(*) FILTER (WHERE is_charging = false AND prev_charging = true)::int AS charge_ends
      FROM o WHERE prev_charging IS NOT NULL
    `;
    out.chargingTransitions = chTrans[0];

    // SOC gain >=5 pseudo sessions count
    const pseudoSessions = await p.$queryRaw`
      WITH o AS (
        SELECT recorded_at, soc_percent,
          LEAD(soc_percent) OVER (ORDER BY recorded_at DESC) AS newer_soc,
          LEAD(recorded_at) OVER (ORDER BY recorded_at DESC) AS newer_at
        FROM hv_battery_health_snapshots
        WHERE vehicle_id = ${bevId} AND recorded_at >= ${since}
        ORDER BY recorded_at DESC
        LIMIT 5000
      )
      SELECT COUNT(*)::int AS pseudo_soc_gain_ge5
      FROM o
      WHERE newer_soc IS NOT NULL AND soc_percent - newer_soc >= 5
    `;
    out.pseudoChargingSessions = pseudoSessions[0];
  }

  // ── Provider SOH ──
  const [provSohEvidence] = await p.$queryRaw`
    SELECT
      COUNT(DISTINCT vehicle_id)::int AS vehicles_with_provider_soh,
      COUNT(*)::int AS total_rows,
      COUNT(DISTINCT numeric_value)::int AS distinct_values,
      MIN(numeric_value) AS min_val, MAX(numeric_value) AS max_val,
      MIN(observed_at) AS first_at, MAX(observed_at) AS last_at
    FROM battery_evidence
    WHERE scope = 'HV' AND source_type = 'PROVIDER_REPORTED' AND value_type = 'SOH_PERCENT'
      AND numeric_value IS NOT NULL
  `;
  out.providerSohEvidence = provSohEvidence;

  out.providerSohPerVehicle = await p.$queryRaw`
    SELECT be.vehicle_id, v.license_plate,
      COUNT(*)::int AS rows,
      COUNT(DISTINCT be.numeric_value)::int AS distinct_values,
      MIN(be.numeric_value) AS min_soh, MAX(be.numeric_value) AS max_soh,
      MIN(be.observed_at) AS first_at, MAX(be.observed_at) AS last_at
    FROM battery_evidence be
    JOIN vehicles v ON v.id = be.vehicle_id
    WHERE be.scope = 'HV' AND be.source_type = 'PROVIDER_REPORTED' AND be.value_type = 'SOH_PERCENT'
      AND be.numeric_value IS NOT NULL
    GROUP BY be.vehicle_id, v.license_plate
  `;

  const vlsSoh = await p.vehicleLatestState.findMany({
    where: { vehicleId: { in: bevIds } },
    select: {
      vehicleId: true,
      tractionBatterySohPercent: true,
      tractionBatteryCurrentEnergyKwh: true,
      tractionBatteryGrossCapacityKwh: true,
      tractionBatteryIsCharging: true,
      tractionBatteryChargingPowerKw: true,
      tractionBatteryAddedEnergyKwh: true,
      evSoc: true,
      sourceTimestamp: true,
      providerFetchedAt: true,
      lastSeenAt: true,
    },
  });
  out.vlsBev = vlsSoh;

  // Provider SOH unique observed_at in evidence (30d)
  const [provFresh] = await p.$queryRaw`
    SELECT COUNT(DISTINCT observed_at)::int AS distinct_observed_at,
      COUNT(*)::int AS total
    FROM battery_evidence
    WHERE scope = 'HV' AND source_type = 'PROVIDER_REPORTED' AND value_type = 'SOH_PERCENT'
      AND observed_at >= ${since}
  `;
  out.providerSohFreshness30d = provFresh;

  // ── HV current publication ──
  out.hvCurrent = await p.hvBatteryHealthCurrent.findMany({
    include: { vehicle: { select: { licensePlate: true } } },
  });

  // ── HV evidence counts (30d) ──
  out.hvEvidence30d = await p.$queryRaw`
    SELECT value_type, source_type, COUNT(*)::int AS rows
    FROM battery_evidence
    WHERE scope = 'HV' AND observed_at >= ${since}
    GROUP BY value_type, source_type
    ORDER BY rows DESC
  `;

  // ── Retention config from env (non-secret keys only) ──
  const envText = fs.readFileSync('/opt/synqdrive/shared/backend.env', 'utf8');
  const retentionEnv = {};
  for (const key of [
    'DATA_RETENTION_ENABLED',
    'RETENTION_HV_BATTERY_SNAPSHOTS_DAYS',
    'RETENTION_BATTERY_EVIDENCE_DAYS',
    'RETENTION_DIMO_POLL_LOGS_DAYS',
    'DATA_RETENTION_BATCH_SIZE',
  ]) {
    const m = envText.match(new RegExp(`^${key}=(.*)$`, 'm'));
    retentionEnv[key] = m ? m[1].replace(/^"|"$/g, '') : '(unset → code default)';
  }
  out.retentionEnv = retentionEnv;

  // Hypothetical HV rows that would be deleted if retention enabled
  const hvDays = parseInt(retentionEnv['RETENTION_HV_BATTERY_SNAPSHOTS_DAYS'], 10);
  if (Number.isFinite(hvDays) && hvDays > 0) {
    const cutoff = new Date(Date.now() - hvDays * 24 * 3600 * 1000);
    const [wouldDelete] = await p.$queryRaw`
      SELECT COUNT(*)::int AS would_delete FROM hv_battery_health_snapshots WHERE created_at < ${cutoff}
    `;
    out.retentionWouldDeleteHv = wouldDelete.would_delete;
  } else {
    const [allRows] = await p.$queryRaw`SELECT COUNT(*)::int AS c FROM hv_battery_health_snapshots`;
    out.retentionWouldDeleteHv = 0;
    out.retentionNote = `HV retention disabled (days=${retentionEnv['RETENTION_HV_BATTERY_SNAPSHOTS_DAYS']}); ${allRows.c} rows would remain`;
  }

  // Evidence would-delete if enabled
  const evDays = parseInt(retentionEnv['RETENTION_BATTERY_EVIDENCE_DAYS'], 10);
  if (Number.isFinite(evDays) && evDays > 0) {
    const cutoff = new Date(Date.now() - evDays * 24 * 3600 * 1000);
    const [wouldDelete] = await p.$queryRaw`
      SELECT COUNT(*)::int AS would_delete FROM battery_evidence
      WHERE scope = 'HV' AND created_at < ${cutoff}
    `;
    out.retentionWouldDeleteHvEvidence = wouldDelete.would_delete;
  } else {
    out.retentionWouldDeleteHvEvidence = 0;
  }

  // ── EXPLAIN samples (read-only) ──
  out.explain = {};
  try {
    out.explain.hvCount30d = await p.$queryRawUnsafe(`
      EXPLAIN (FORMAT JSON)
      SELECT COUNT(*) FROM hv_battery_health_snapshots WHERE recorded_at >= '${sinceIso}'
    `);
    out.explain.hvPerVehicle = await p.$queryRawUnsafe(`
      EXPLAIN (FORMAT JSON)
      SELECT vehicle_id, COUNT(*) FROM hv_battery_health_snapshots
      WHERE recorded_at >= '${sinceIso}' GROUP BY vehicle_id
    `);
    if (bevId) {
      out.explain.hvBevOrdered = await p.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT recorded_at, soc_percent FROM hv_battery_health_snapshots
        WHERE vehicle_id = '${bevId}' AND recorded_at >= '${sinceIso}'
        ORDER BY recorded_at LIMIT 1000
      `);
    }
  } catch (e) {
    out.explainError = e.message;
  }

  // ── Growth projection ──
  const daysSpan = out.perDayFleet.length || DAYS;
  const total30d = Number(totals30d.rows_30d || 0);
  const bevCount = Math.max(bevs.length, 1);
  const rowsPerBevPerDay = total30d / bevCount / daysSpan;
  out.projection = {
    rowsPerBevPerDay: Math.round(rowsPerBevPerDay),
    rowsPerDayFleet: Math.round(total30d / daysSpan),
    ev10: { rowsPerDay: Math.round(rowsPerBevPerDay * 10), rowsPerYear: Math.round(rowsPerBevPerDay * 10 * 365) },
    ev100: { rowsPerDay: Math.round(rowsPerBevPerDay * 100), rowsPerYear: Math.round(rowsPerBevPerDay * 100 * 365) },
    ev1000: { rowsPerDay: Math.round(rowsPerBevPerDay * 1000), rowsPerYear: Math.round(rowsPerBevPerDay * 1000 * 365) },
    evidenceMultiplier: 7,
  };

  // PM2 retention log snippet
  try {
    const log = execSync(
      "grep -i 'Data retention\\|hv_battery_health_snapshots\\|Retention \\[' /root/.pm2/logs/synqdrive-out.log 2>/dev/null | tail -20 || true",
      { encoding: 'utf8', maxBuffer: 500000 },
    );
    out.pm2RetentionLogTail = log.trim().split('\n').slice(-10);
  } catch {
    out.pm2RetentionLogTail = [];
  }

  try {
    const startup = execSync(
      "grep 'Data retention' /root/.pm2/logs/synqdrive-out.log 2>/dev/null | head -3 || true",
      { encoding: 'utf8' },
    );
    out.pm2RetentionStartup = startup.trim().split('\n');
  } catch {
    out.pm2RetentionStartup = [];
  }

  const deployedCommit = execSync('cd /opt/synqdrive/current && git rev-parse --short HEAD 2>/dev/null || echo unknown', {
    encoding: 'utf8',
  }).trim();
  out.vpsDeployedCommit = deployedCommit;

  const jsonReplacer = (_, v) => (typeof v === 'bigint' ? Number(v) : v);
  console.log(JSON.stringify(out, jsonReplacer, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
