/* READ-ONLY Prompt 7/8 — battery queue/error/UI evidence */
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

const DAYS = 30;
const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000);

function loadEnv() {
  const envPath = '/opt/synqdrive/shared/backend.env';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', maxBuffer: 8_000_000 }).trim();
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '') || e.message;
  }
}

function grepCount(pattern, logPath) {
  const out = sh(`grep -cE '${pattern}' ${logPath} 2>/dev/null || echo 0`);
  const n = parseInt(out.split('\n').pop(), 10);
  return Number.isFinite(n) ? n : 0;
}

(async () => {
  loadEnv();
  const p = new PrismaClient();
  const out = { auditAt: new Date().toISOString(), since: since.toISOString() };

  // ── Snapshot poll stats ──
  const pollStats = await p.$queryRaw`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'SUCCESS')::int AS success,
      COUNT(*) FILTER (WHERE status = 'FAILURE')::int AS failure,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE duration_ms IS NOT NULL) AS median_ms,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE duration_ms IS NOT NULL) AS p95_ms,
      MAX(duration_ms) AS max_ms,
      COUNT(*) FILTER (WHERE retry_count > 0)::int AS with_retry
    FROM dimo_poll_logs
    WHERE job_type = 'SNAPSHOT' AND started_at >= ${since}
  `;
  out.pollStats30d = pollStats[0];

  const pollPerVehicle = await p.$queryRaw`
    SELECT vehicle_id, COUNT(*)::int AS polls,
      COUNT(*) FILTER (WHERE status = 'FAILURE')::int AS failures,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) AS median_ms
    FROM dimo_poll_logs
    WHERE job_type = 'SNAPSHOT' AND started_at >= ${since}
    GROUP BY vehicle_id ORDER BY polls DESC
  `;
  out.pollPerVehicle = pollPerVehicle;

  const pollFailures = await p.$queryRaw`
    SELECT started_at, vehicle_id, error_code, LEFT(error_message, 120) AS err
    FROM dimo_poll_logs
    WHERE job_type = 'SNAPSHOT' AND status = 'FAILURE' AND started_at >= ${since}
    ORDER BY started_at DESC LIMIT 20
  `;
  out.recentPollFailures = pollFailures;

  // Retry distribution
  const retryDist = await p.$queryRaw`
    SELECT retry_count::int AS retry_count, COUNT(*)::int AS c
    FROM dimo_poll_logs
    WHERE job_type = 'SNAPSHOT' AND started_at >= ${since}
    GROUP BY retry_count ORDER BY retry_count
  `;
  out.retryDistribution = retryDist;

  // Gap analysis (stuck detection proxy)
  const pollGaps = await p.$queryRaw`
    WITH o AS (
      SELECT vehicle_id, started_at,
        EXTRACT(EPOCH FROM (started_at - LAG(started_at) OVER (PARTITION BY vehicle_id ORDER BY started_at))) AS gap_sec
      FROM dimo_poll_logs
      WHERE job_type = 'SNAPSHOT' AND started_at >= ${since}
    )
    SELECT COUNT(*) FILTER (WHERE gap_sec > 300)::int AS gaps_gt_5min,
      COUNT(*) FILTER (WHERE gap_sec > 3600)::int AS gaps_gt_1h,
      MAX(gap_sec) AS max_gap_sec
    FROM o WHERE gap_sec IS NOT NULL
  `;
  out.pollGaps = pollGaps[0];

  // ── PM2 / logs battery errors ──
  const outLog = '/root/.pm2/logs/synqdrive-out.log';
  const errLog = '/root/.pm2/logs/synqdrive-error.log';
  out.logCounts = {
    batteryV2OnSnapshotFailed: grepCount('Battery V2 onSnapshot failed', outLog),
    hvBatterySnapshotFailed: grepCount('HV Battery snapshot failed', outLog),
    hvPublicationFailed: grepCount('HV publication state update failed', outLog),
    batteryV2CrankFailed: grepCount('Battery V2 crank capture failed', outLog),
    unhandledRejection: grepCount('UnhandledPromiseRejection|unhandledRejection', errLog),
    batteryUnhandled: grepCount('Battery|battery.*(Error|failed)', errLog),
  };

  const batteryLogSamples = sh(
    `grep -E 'Battery V2 onSnapshot failed|HV Battery snapshot failed|HV publication state update failed|Battery V2 crank capture failed|Crank features captured' ${outLog} 2>/dev/null | tail -30`,
  );
  out.batteryLogTail = batteryLogSamples ? batteryLogSamples.split('\n').slice(-15) : [];

  const crankCaptured = grepCount('Crank features captured', outLog);
  const crankDropMeasured = sh(
    `grep 'Crank features captured' ${outLog} 2>/dev/null | grep -v 'drop=—' | wc -l`,
  );
  out.crankLogStats = {
    totalCaptured: crankCaptured,
    withDrop: parseInt(crankDropMeasured, 10) || 0,
  };

  // PM2 restarts
  out.pm2Status = sh('pm2 jlist 2>/dev/null | node -e "let d=\'\';process.stdin.on(\'data\',c=>d+=c);process.stdin.on(\'end\',()=>{const j=JSON.parse(d);const s=j.find(x=>x.name===\'synqdrive\');console.log(JSON.stringify({restarts:s?.pm2_env?.restart_time,status:s?.pm2_env?.status,uptime:s?.pm2_env?.pm_uptime}));})"');

  // ── Redis queue state (read-only) ──
  out.redisQueue = {};
  try {
    const redisInfo = sh('redis-cli INFO memory 2>/dev/null | grep used_memory_human');
    out.redisQueue.memory = redisInfo;
    const bullKeys = sh('redis-cli --scan --pattern "bull:dimo.snapshot.poll:*" 2>/dev/null | head -20');
    out.redisQueue.sampleKeys = bullKeys ? bullKeys.split('\n').slice(0, 10) : [];
    const waiting = sh('redis-cli LLEN bull:dimo.snapshot.poll:wait 2>/dev/null');
    const active = sh('redis-cli LLEN bull:dimo.snapshot.poll:active 2>/dev/null');
    const failed = sh('redis-cli ZCARD bull:dimo.snapshot.poll:failed 2>/dev/null');
    const delayed = sh('redis-cli ZCARD bull:dimo.snapshot.poll:delayed 2>/dev/null');
    out.redisQueue.dimoSnapshot = {
      waiting: parseInt(waiting, 10) || 0,
      active: parseInt(active, 10) || 0,
      failed: parseInt(failed, 10) || 0,
      delayed: parseInt(delayed, 10) || 0,
    };
  } catch (e) {
    out.redisQueue.error = String(e.message);
  }

  // ── Staleness from DB ──
  const vls = await p.vehicleLatestState.findMany({
    where: { vehicle: { dimoVehicleId: { not: null } } },
    select: {
      vehicleId: true,
      lvBatteryVoltage: true,
      evSoc: true,
      sourceTimestamp: true,
      providerFetchedAt: true,
      lastSeenAt: true,
      vehicle: { select: { licensePlate: true, fuelType: true } },
    },
  });
  const now = Date.now();
  out.staleness = vls.map((v) => {
    const src = v.sourceTimestamp?.getTime() ?? null;
    const fetched = v.providerFetchedAt?.getTime() ?? null;
    return {
      plate: v.vehicle.licensePlate === 'KS FH 660E' ? 'KS FH 660E' : `veh-${v.vehicleId.slice(0, 8)}`,
      fuelType: v.vehicle.fuelType,
      providerStaleH: src ? Math.round((now - src) / 3600000) : null,
      fetchAgeMin: fetched ? Math.round((now - fetched) / 60000) : null,
      hasLv: v.lvBatteryVoltage != null,
      hasEvSoc: v.evSoc != null,
    };
  });

  const [bf] = await p.$queryRaw`
    SELECT COUNT(*)::int AS features,
      MAX(updated_at) AS last_feature_update,
      MAX(last_published_at) AS last_published
    FROM battery_features
  `;
  const [hvPub] = await p.$queryRaw`
    SELECT MAX(updated_at) AS last_hv_pub_update, MAX(last_published_at) AS last_hv_published
    FROM hv_battery_health_current
  `;
  const [lvSnap] = await p.$queryRaw`
    SELECT MAX(recorded_at) AS last_lv_snap FROM battery_health_snapshots
  `;
  const [hvSnap] = await p.$queryRaw`
    SELECT MAX(recorded_at) AS last_hv_snap FROM hv_battery_health_snapshots
  `;
  out.publicationFreshness = { ...bf, ...hvPub, lastLvSnap: lvSnap?.last_lv_snap, lastHvSnap: hvSnap?.last_hv_snap };

  // ── Prometheus battery-related ──
  out.prometheus = {};
  try {
    const prom = sh('curl -s http://127.0.0.1:9090/api/v1/label/__name__/values 2>/dev/null');
    const names = JSON.parse(prom)?.data || [];
    out.prometheus.batteryRelated = names.filter((n) =>
      /battery|snapshot_poll|dimo_snapshot/i.test(n),
    );
    const snapPoll = sh(
      'curl -s "http://127.0.0.1:9090/api/v1/query?query=synqdrive_dimo_snapshot_poll_total" 2>/dev/null',
    );
    out.prometheus.snapshotPoll = JSON.parse(snapPoll)?.data?.result || [];
  } catch (e) {
    out.prometheus.error = e.message;
  }

  // ── Overlap proxy: concurrent polls same vehicle within 5s ──
  const overlap = await p.$queryRaw`
    WITH o AS (
      SELECT vehicle_id, started_at,
        LAG(started_at) OVER (PARTITION BY vehicle_id ORDER BY started_at) AS prev
      FROM dimo_poll_logs
      WHERE job_type = 'SNAPSHOT' AND started_at >= ${since}
    )
    SELECT COUNT(*)::int AS overlaps_lt_5s
    FROM o
    WHERE prev IS NOT NULL AND EXTRACT(EPOCH FROM (started_at - prev)) < 5
  `;
  out.pollOverlapLt5s = overlap[0];

  out.vpsDeployedCommit = sh('cd /opt/synqdrive/current && git rev-parse --short HEAD 2>/dev/null');

  const jsonReplacer = (_, v) => (typeof v === 'bigint' ? Number(v) : v);
  console.log(JSON.stringify(out, jsonReplacer, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
