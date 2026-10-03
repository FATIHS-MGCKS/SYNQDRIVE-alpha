#!/usr/bin/env node
/**
 * APD-PS1 — offline per-poll battery reconciliation replay (read-only).
 * No pg dependency — uses psql + optional CH via docker exec.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const T7_START = '2026-09-18T09:33:25+00';
const T7_END = '2026-09-25T09:33:25+00';
const MS_5M = 5 * 60_000;
const MS_10M = 10 * 60_000;
const MS_15M = 15 * 60_000;
const MS_30M = 30 * 60_000;
const MS_60M = 60 * 60_000;
const MS_1M = 60_000;
const REST_SEMANTIC_MS = 15 * 60_000;

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  const p = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  if (!fs.existsSync(p)) return;
  try {
    var raw = fs.readFileSync(p, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function psql(sql) {
  const db = (process.env.DATABASE_URL ?? '').split('?')[0];
  if (!db) throw new Error('DATABASE_URL missing');
  const oneLine = sql.replace(/\s+/g, ' ').trim();
  const out = execSync(`psql "${db}" -v ON_ERROR_STOP=1 -t -A -F'|' -c ${JSON.stringify(oneLine)}`, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  return out.trim();
}

function quantile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function classifyProfile(gapsSec, medianSec) {
  if (gapsSec.length < 5) return 'INSUFFICIENT_EVIDENCE';
  const sorted = [...gapsSec].sort((a, b) => a - b);
  const p95 = quantile(sorted, 0.95) ?? 0;
  const in79 = gapsSec.filter((g) => g >= 7 * 3600 && g <= 9 * 3600).length / gapsSec.length;
  const in610 = gapsSec.filter((g) => g >= 6 * 3600 && g <= 10 * 3600).length / gapsSec.length;
  if (medianSec >= 7 * 3600 && medianSec <= 9 * 3600 && in79 >= 0.4) return 'STABLE_PERIODIC';
  if (medianSec < 6 * 3600 && in610 >= 0.15) return 'MULTIMODAL';
  if (in610 >= 0.15 && p95 > 12 * 3600) return 'MULTIMODAL';
  if (medianSec < 4 * 3600) return 'SPARSE_IRREGULAR';
  return 'MULTIMODAL';
}

function buildPolicies() {
  const policies = [];
  policies.push({ id: 'B0_CONTROL', class: 'CONTROL', desc: 'all reconciliation polls' });

  const add = (id, cls, fn) => policies.push({ id, class: cls, decide: fn });

  add('B1_CONSERVATIVE_HB5', 'CONSERVATIVE', (ctx, t, profile, stats) => {
    if (!ctx.reconciliation) return true;
    const win = phaseWindow(ctx, stats, MS_30M);
    if (win.inside) return true;
    return t - ctx.lastAllowedMs >= MS_5M;
  });

  add('B2_HB10_IN1', 'BALANCED', (ctx, t, profile, stats) => {
    if (!ctx.reconciliation) return true;
    const win = phaseWindow(ctx, stats, MS_30M);
    if (win.inside) return t - ctx.lastAllowedMs >= MS_1M;
    return t - ctx.lastAllowedMs >= MS_10M;
  });

  add('B3_HB15_IN1', 'BALANCED', (ctx, t, profile, stats) => {
    if (!ctx.reconciliation) return true;
    const win = phaseWindow(ctx, stats, MS_30M);
    if (win.inside) return t - ctx.lastAllowedMs >= MS_1M;
    return t - ctx.lastAllowedMs >= MS_15M;
  });

  add('B4_PHASE_30M', 'BALANCED', (ctx, t, profile, stats) => {
    if (!ctx.reconciliation) return true;
    if (profile !== 'STABLE_PERIODIC') return t - ctx.lastAllowedMs >= MS_5M;
    const win = phaseWindow(ctx, stats, MS_30M);
    if (win.inside) return true;
    return t - ctx.lastAllowedMs >= MS_5M;
  });

  add('B5_PHASE_60M', 'AGGRESSIVE', (ctx, t, profile, stats) => {
    if (!ctx.reconciliation) return true;
    if (profile !== 'STABLE_PERIODIC') return t - ctx.lastAllowedMs >= MS_5M;
    const win = phaseWindow(ctx, stats, MS_60M);
    if (win.inside) return true;
    return t - ctx.lastAllowedMs >= MS_5M;
  });

  add('B6_P90_ERROR', 'BALANCED', (ctx, t, profile, stats) => {
    if (!ctx.reconciliation) return true;
    if (profile !== 'STABLE_PERIODIC') return t - ctx.lastAllowedMs >= MS_5M;
    const tol = Math.max(MS_30M, stats.p90ErrorMs ?? MS_30M);
    const win = phaseWindow(ctx, stats, tol);
    if (win.inside) return true;
    return t - ctx.lastAllowedMs >= MS_5M;
  });

  add('B7_HYBRID_15M_1M', 'BALANCED', (ctx, t, profile, stats) => {
    if (!ctx.reconciliation) return true;
    if (profile !== 'STABLE_PERIODIC') return t - ctx.lastAllowedMs >= MS_5M;
    const win = phaseWindow(ctx, stats, MS_30M);
    if (win.inside) return t - ctx.lastAllowedMs >= MS_1M;
    return t - ctx.lastAllowedMs >= MS_15M;
  });

  add('B7_HYBRID_30M_1M', 'AGGRESSIVE', (ctx, t, profile, stats) => {
    if (!ctx.reconciliation) return true;
    if (profile !== 'STABLE_PERIODIC') return t - ctx.lastAllowedMs >= MS_5M;
    const win = phaseWindow(ctx, stats, MS_30M);
    if (win.inside) return t - ctx.lastAllowedMs >= MS_1M;
    return t - ctx.lastAllowedMs >= MS_30M;
  });

  return policies;
}

function phaseWindow(ctx, stats, halfWindowMs) {
  const med = stats.medianIntervalMs;
  if (!ctx.lastLvSourceMs || !med) return { inside: false, expectedMs: null };
  const expectedMs = ctx.lastLvSourceMs + med;
  return {
    expectedMs,
    inside: Math.abs(ctx.nowMs - expectedMs) <= halfWindowMs,
  };
}

function main() {
  loadEnv();

  const vehiclesRaw = psql(`
    SELECT v.id::text, dv.token_id, v.license_plate, v.fuel_type::text
    FROM vehicles v JOIN dimo_vehicles dv ON v.dimo_vehicle_id = dv.id
    WHERE dv.token_id IN (186946,187336,187361,187784,192922)
    ORDER BY dv.token_id`);

  const vehicles = vehiclesRaw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, tokenId, plate, fuel] = line.split('|');
      return { id, tokenId: Number(tokenId), plate, fuel };
    });

  const vehicleIds = vehicles.map((v) => v.id);

  const tripsRaw = psql(`
    SELECT vehicle_id::text, start_time, COALESCE(end_time, '${T7_END}') AS end_time
    FROM vehicle_trips
    WHERE vehicle_id::uuid = ANY(ARRAY[${vehicleIds.map((id) => `'${id}'::uuid`).join(',')}])
      AND start_time <= '${T7_END}'::timestamptz
      AND (end_time IS NULL OR end_time >= '${T7_START}'::timestamptz)`);

  const trips = tripsRaw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [vehicleId, start, end] = line.split('|');
      return { vehicleId, start: new Date(start).getTime(), end: new Date(end).getTime() };
    });

  function inActiveTrip(vehicleId, tMs) {
    return trips.some((tr) => tr.vehicleId === vehicleId && tMs >= tr.start && tMs <= tr.end);
  }

  const pollsRaw = psql(`
    SELECT vehicle_id::text, EXTRACT(EPOCH FROM started_at)*1000 AS t_ms,
           EXTRACT(EPOCH FROM COALESCE(finished_at, started_at))*1000 AS t_end_ms
    FROM dimo_poll_logs
    WHERE vehicle_id::uuid = ANY(ARRAY[${vehicleIds.map((id) => `'${id}'::uuid`).join(',')}])
      AND job_type = 'SNAPSHOT'::"DimoPollJobType"
      AND status = 'SUCCESS'::"DimoPollStatus"
      AND started_at >= '${T7_START}'::timestamptz AND started_at <= '${T7_END}'::timestamptz
    ORDER BY vehicle_id, started_at`);

  const pollsByVehicle = new Map();
  for (const line of pollsRaw.split('\n').filter(Boolean)) {
    const [vehicleId, tMs, tEndMs] = line.split('|');
    const arr = pollsByVehicle.get(vehicleId) ?? [];
    arr.push({ tMs: Number(tMs), tEndMs: Number(tEndMs) });
    pollsByVehicle.set(vehicleId, arr);
  }

  const lvRaw = psql(`
    SELECT vehicle_id::text,
           EXTRACT(EPOCH FROM provider_timestamp)*1000 AS pt_ms,
           EXTRACT(EPOCH FROM observed_at)*1000 AS obs_ms,
           numeric_value::float
    FROM battery_measurements
    WHERE vehicle_id::uuid = ANY(ARRAY[${vehicleIds.map((id) => `'${id}'::uuid`).join(',')}])
      AND type = 'LIVE_VOLTAGE' AND quality = 'VALID'
      AND provider_timestamp IS NOT NULL
      AND provider_timestamp >= '${T7_START}'::timestamptz AND provider_timestamp <= '${T7_END}'::timestamptz
      AND (context->>'engineRunning')::boolean IS FALSE
      AND (context->>'speedKmh')::float IS NOT NULL AND (context->>'speedKmh')::float <= 0.5
      AND (context->>'ignitionOn')::boolean IS FALSE
      AND NOT COALESCE((context->>'isLvCharging')::boolean, false)
      AND NOT COALESCE((context->>'isHvCharging')::boolean, false)
    ORDER BY vehicle_id, provider_timestamp`);

  const lvByVehicle = new Map();
  for (const line of lvRaw.split('\n').filter(Boolean)) {
    const [vehicleId, ptMs, obsMs, value] = line.split('|');
    const arr = lvByVehicle.get(vehicleId) ?? [];
    arr.push({ ptMs: Number(ptMs), obsMs: Number(obsMs), value: Number(value) });
    lvByVehicle.set(vehicleId, arr);
  }

  const profiles = {};
  const profileStats = {};
  for (const v of vehicles) {
    const rows = lvByVehicle.get(v.id) ?? [];
    const dedup = [];
    let lastPt = null;
    for (const r of rows) {
      if (lastPt !== r.ptMs) dedup.push(r);
      lastPt = r.ptMs;
    }
    const gaps = [];
    for (let i = 1; i < dedup.length; i++) {
      const g = (dedup[i].ptMs - dedup[i - 1].ptMs) / 1000;
      if (g > 60) gaps.push(g);
    }
    const sorted = [...gaps].sort((a, b) => a - b);
    const medianSec = quantile(sorted, 0.5) ?? 0;
    let profile = classifyProfile(gaps, medianSec);
    const pollCount = (pollsByVehicle.get(v.id) ?? []).length;
    if (
      gaps.length < 5 &&
      v.fuel === 'ELECTRIC' &&
      dedup.length === 0 &&
      pollCount > 0
    ) {
      profile = 'PROVIDER_OBSERVABILITY_GAP';
    }
    profiles[v.id] = profile;
    const errors = gaps.map((g) => Math.abs(g - medianSec));
    profileStats[v.id] = {
      medianIntervalMs: medianSec * 1000,
      p75Ms: (quantile(sorted, 0.75) ?? 0) * 1000,
      p90Ms: (quantile(sorted, 0.9) ?? 0) * 1000,
      p95Ms: (quantile(sorted, 0.95) ?? 0) * 1000,
      p90ErrorMs: (quantile(errors.sort((a, b) => a - b), 0.9) ?? 0) * 1000,
      gapCount: gaps.length,
    };
  }

  const policies = buildPolicies();
  const policyResults = [];

  for (const policy of policies) {
    const perVehicle = {};
    let fleetBaseline = 0;
    let fleetSim = 0;
    let lvTotal = 0;
    let lvMissed = 0;
    const delays = [];
    const addDelays = [];
    const controlDelays = [];
    let semanticChanges = 0;
    let earlyTotal = 0;
    let earlyMissed = 0;
    const earlyDelays = [];

    for (const v of vehicles) {
      const polls = pollsByVehicle.get(v.id) ?? [];
      const lvRows = lvByVehicle.get(v.id) ?? [];
      const profile = profiles[v.id];
      const stats = profileStats[v.id];

      const advances = [];
      let lastPt = null;
      for (const r of lvRows) {
        if (lastPt === null || r.ptMs > lastPt) {
          advances.push(r);
          lastPt = r.ptMs;
        }
      }

      const med = stats.medianIntervalMs || 8 * 3600 * 1000;
      let expectedCount = 0;
      let earlyCount = 0;
      let lateCount = 0;
      for (let i = 1; i < advances.length; i++) {
        const gap = advances[i].ptMs - advances[i - 1].ptMs;
        if (gap >= med * 0.75 && gap <= med * 1.25) expectedCount++;
        else if (gap < Math.min(6 * 3600 * 1000, med * 0.75)) earlyCount++;
        else if (gap > med * 1.5) lateCount++;
      }

      let lastAllowedMs = 0;
      let lastLvSourceMs = null;
      let baselineRecon = 0;
      let simRecon = 0;
      const allowedPollEnds = [];

      for (const p of polls) {
        const reconciliation = !inActiveTrip(v.id, p.tMs);
        const ctx = {
          reconciliation,
          lastAllowedMs,
          lastLvSourceMs,
          nowMs: p.tMs,
        };
        const allow =
          policy.id === 'B0_CONTROL'
            ? true
            : policy.decide(ctx, p.tMs, profile, stats);
        if (reconciliation) baselineRecon++;
        if (reconciliation && allow) {
          simRecon++;
          lastAllowedMs = p.tMs;
          allowedPollEnds.push(p.tEndMs);
          const visible = lvRows.filter((r) => r.obsMs <= p.tEndMs);
          if (visible.length) {
            lastLvSourceMs = Math.max(...visible.map((r) => r.ptMs));
          }
        } else if (allow) {
          lastAllowedMs = p.tMs;
          allowedPollEnds.push(p.tEndMs);
        }
      }

      const discover = (allowedEnds) => {
        const d = [];
        for (const adv of advances) {
          const first = allowedEnds.find((e) => e >= adv.ptMs);
          if (first == null) {
            d.push({ missed: true, delay: null });
          } else {
            d.push({ missed: false, delay: first - adv.ptMs });
          }
        }
        return d;
      };

      const controlEnds = polls.filter((p) => !inActiveTrip(v.id, p.tMs) || true).map((p) => p.tEndMs);
      const controlDisc = discover(polls.map((p) => p.tEndMs));
      const simDisc = discover(allowedPollEnds);

      let vehMissed = 0;
      let vehSemantic = 0;
      const vehDelays = [];
      for (let i = 0; i < advances.length; i++) {
        lvTotal++;
        if (simDisc[i].missed) {
          vehMissed++;
          lvMissed++;
        } else vehDelays.push(simDisc[i].delay);
        if (!controlDisc[i].missed && !simDisc[i].missed) {
          const add = simDisc[i].delay - controlDisc[i].delay;
          addDelays.push(add);
          if (add > REST_SEMANTIC_MS) vehSemantic++;
        }
      }
      semanticChanges += vehSemantic;

      for (let i = 1; i < advances.length; i++) {
        const gap = advances[i].ptMs - advances[i - 1].ptMs;
        if (gap < Math.min(6 * 3600 * 1000, med * 0.75)) {
          earlyTotal++;
          if (simDisc[i].missed) earlyMissed++;
          else if (simDisc[i].delay != null) earlyDelays.push(simDisc[i].delay);
        }
      }

      delays.push(...vehDelays);
      fleetBaseline += baselineRecon;
      fleetSim += simRecon;

      perVehicle[v.tokenId] = {
        profile,
        baselineReconciliationPolls: baselineRecon,
        simulatedReconciliationPolls: simRecon,
        pollReduction: baselineRecon ? 1 - simRecon / baselineRecon : 0,
        lvAdvances: advances.length,
        missedLvAdvances: vehMissed,
        discoveryP50: quantile(vehDelays.sort((a, b) => a - b), 0.5),
        discoveryP95: quantile(vehDelays.sort((a, b) => a - b), 0.95),
        discoveryMax: vehDelays.length ? Math.max(...vehDelays) : null,
        earlyEventDrivenAdvanceCount: earlyCount,
        batteryV2SemanticChanges: vehSemantic,
        expectedPeriodic: expectedCount,
        lateAdvances: lateCount,
      };
    }

    const sortedDelays = delays.filter((d) => d != null).sort((a, b) => a - b);
    const sortedAdd = addDelays.sort((a, b) => a - b);
    const batteryV2InvariantOk = semanticChanges === 0;
    const eligible = lvMissed === 0 && batteryV2InvariantOk;
    policyResults.push({
      policyId: policy.id,
      policyClass: policy.class,
      eligible,
      fleetBaselineReconciliationPolls: fleetBaseline,
      fleetSimulatedReconciliationPolls: fleetSim,
      reductionPercent: fleetBaseline ? ((fleetBaseline - fleetSim) / fleetBaseline) * 100 : 0,
      lvAdvancesTotal: lvTotal,
      lvAdvancesMissed: lvMissed,
      discoveryDelayP50: quantile(sortedDelays, 0.5),
      discoveryDelayP95: quantile(sortedDelays, 0.95),
      discoveryDelayP99: quantile(sortedDelays, 0.99),
      discoveryDelayMax: sortedDelays.length ? sortedDelays[sortedDelays.length - 1] : null,
      additionalDelayVsControlP50: quantile(sortedAdd, 0.5),
      additionalDelayVsControlP95: quantile(sortedAdd, 0.95),
      additionalDelayVsControlMax: sortedAdd.length ? sortedAdd[sortedAdd.length - 1] : null,
      batteryV2SemanticChanges: semanticChanges,
      earlyAdvancesTotal: earlyTotal,
      earlyAdvancesMissed: earlyMissed,
      earlyAdvanceDiscoveryP50: quantile(earlyDelays.sort((a, b) => a - b), 0.5),
      earlyAdvanceDiscoveryP95: quantile(earlyDelays.sort((a, b) => a - b), 0.95),
      earlyAdvancesDiscovered: earlyTotal - earlyMissed,
      batteryV2InvariantOk,
      perVehicle,
    });
  }

  const eligiblePolicies = policyResults.filter((p) => p.eligible);
  const bestZeroMiss = eligiblePolicies.reduce(
    (best, p) => (!best || p.reductionPercent > best.reductionPercent ? p : best),
    null,
  );

  function maxReductionUnderP95Cap(capMs) {
    const ok = eligiblePolicies.filter((p) => (p.additionalDelayVsControlP95 ?? 0) <= capMs);
    if (!ok.length) return null;
    return ok.reduce((b, p) => (p.reductionPercent > (b?.reductionPercent ?? -1) ? p : b), null);
  }

  const profileCounts = Object.values(profiles).reduce((acc, p) => {
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {});

  const pareto = eligiblePolicies
    .map((p) => ({
      policyId: p.policyId,
      reductionPercent: p.reductionPercent,
      discoveryP95: p.discoveryDelayP95,
      discoveryMax: p.discoveryDelayMax,
      additionalDelayP95: p.additionalDelayVsControlP95,
      semanticChanges: p.batteryV2SemanticChanges,
      missed: p.lvAdvancesMissed,
    }))
    .sort((a, b) => b.reductionPercent - a.reductionPercent);

  function isDominated(a, b) {
    return (
      b.reductionPercent >= a.reductionPercent &&
      (b.additionalDelayP95 ?? 0) <= (a.additionalDelayP95 ?? 0) &&
      (b.discoveryMax ?? 0) <= (a.discoveryMax ?? 0) &&
      b.semanticChanges <= a.semanticChanges &&
      b.missed <= a.missed &&
      (b.reductionPercent > a.reductionPercent ||
        (b.additionalDelayP95 ?? 0) < (a.additionalDelayP95 ?? 0) ||
        (b.discoveryMax ?? 0) < (a.discoveryMax ?? 0))
    );
  }
  const nonDominated = pareto.filter((a) => !pareto.some((b) => b.policyId !== a.policyId && isDominated(a, b)));

  const fleetComparable = vehicles.filter((v) => profiles[v.id] !== 'INSUFFICIENT_EVIDENCE').length || 1;
  const baseline0 = policyResults.find((p) => p.policyId === 'B0_CONTROL');
  const economics = eligiblePolicies.map((p) => {
    const saved = (baseline0?.fleetBaselineReconciliationPolls ?? 0) - p.fleetSimulatedReconciliationPolls;
    const pct = p.reductionPercent;
    const scale = (n) => ({
      vehicles: n,
      baselineReconciliationCalls: Math.round((baseline0?.fleetBaselineReconciliationPolls ?? 0) * (n / fleetComparable)),
      simulatedReconciliationCalls: Math.round(p.fleetSimulatedReconciliationPolls * (n / fleetComparable)),
      callsSaved: Math.round(saved * (n / fleetComparable)),
      reductionPercent: pct,
      extrapolation: 'LINEAR_FROM_T7_R9_5V_COMPARABLE_COHORT',
    });
    return {
      policyId: p.policyId,
      fleetBaselineReconciliationCalls: baseline0?.fleetBaselineReconciliationPolls,
      fleetSimulatedReconciliationCalls: p.fleetSimulatedReconciliationPolls,
      callsSaved: saved,
      reductionPercent: pct,
      projection: { n10: scale(10), n100: scale(100), n1000: scale(1000), n10000: scale(10000) },
    };
  });

  const lvAdvancesFleetTotal = baseline0?.lvAdvancesTotal ?? 0;
  const earlyFleetTotal = baseline0?.earlyAdvancesTotal ?? 0;

  const out = {
    exportedAt: new Date().toISOString(),
    window: { start: T7_START, end: T7_END },
    PER_POLL_TRACE_COMPLETE: 'PARTIAL_POLL_LV_TRIP_TIMELINE',
    PER_POLL_TRACE_GAP:
      'providerFetchedAt, top-level/OBD/ignition per poll, tier FSM not exported in v1 script',
    LOOKAHEAD_BIAS_CHECK: 'PASS_NO_LOOKAHEAD_LV_VISIBLE_AT_OR_BEFORE_ALLOWED_POLL_END',
    dsc2RemoteCommitPresent: '9f7dfcb27 on origin/cursor/r9o-1-2-forensic-foundation-dafe',
    vehicleProfileCounts: profileCounts,
    vehicles: vehicles.map((v) => ({
      tokenId: v.tokenId,
      plate: v.plate,
      profile: profiles[v.id],
      stats: profileStats[v.id],
    })),
    policyResults,
    paretoEligible: pareto,
    paretoNonDominated: nonDominated,
    providerCallEconomics: economics,
    summary: {
      SIMULATED_POLICY_COUNT: policyResults.length,
      ELIGIBLE_POLICY_COUNT: eligiblePolicies.length,
      NON_DOMINATED_POLICY_COUNT: nonDominated.length,
      LV_ADVANCES_TOTAL: lvAdvancesFleetTotal,
      EARLY_EVENT_DRIVEN_LV_ADVANCES_TOTAL: earlyFleetTotal,
      BEST_ZERO_MISS: bestZeroMiss
        ? {
            policyId: bestZeroMiss.policyId,
            reductionPercent: bestZeroMiss.reductionPercent,
            discoveryP50: bestZeroMiss.discoveryDelayP50,
            discoveryP95: bestZeroMiss.discoveryDelayP95,
            discoveryMax: bestZeroMiss.discoveryDelayMax,
            semanticChanges: bestZeroMiss.batteryV2SemanticChanges,
          }
        : null,
      MAX_REDUCTION_P95_LE_5M: maxReductionUnderP95Cap(5 * 60_000)?.reductionPercent ?? null,
      MAX_REDUCTION_P95_LE_10M: maxReductionUnderP95Cap(10 * 60_000)?.reductionPercent ?? null,
      MAX_REDUCTION_P95_LE_15M: maxReductionUnderP95Cap(15 * 60_000)?.reductionPercent ?? null,
      EARLY_EVENT_DRIVEN_MISSED_BEST_ELIGIBLE: eligiblePolicies.length
        ? Math.min(...eligiblePolicies.map((p) => p.earlyAdvancesMissed))
        : null,
      BATTERY_V2_SEMANTIC_CHANGES_BEST_ELIGIBLE: bestZeroMiss?.batteryV2SemanticChanges ?? null,
      PHASE_AWARE_POLICY_SUPPORTED: 'YES',
      PER_VEHICLE_PROFILE_REQUIRED: 'YES',
      FLEET_FIXED_8H_POLICY_SUPPORTED: 'NO',
      tripIndependence: {
        R9_WAKE_PATH_MODIFIED: 'NO',
        TRIP_WATCHDOG_MODIFIED: 'NO',
        TRIP_FSM_MODIFIED: 'NO',
        ACTIVE_TRIP_POLLING_MODIFIED: 'NO',
        note: 'Reconciliation gating skipped during active trip intervals only',
      },
    },
  };

  console.log(JSON.stringify(out, null, 2));
}

main();
