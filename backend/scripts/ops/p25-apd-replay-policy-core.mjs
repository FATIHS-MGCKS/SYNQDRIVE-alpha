/** Shared APD offline reconciliation policy definitions (PS1/PS2). */
export const T7_START = '2026-09-18T09:33:25+00';
export const T7_END = '2026-09-25T09:33:25+00';
export const MS_5M = 5 * 60_000;
export const MS_10M = 10 * 60_000;
export const MS_15M = 15 * 60_000;
export const MS_30M = 30 * 60_000;
export const MS_60M = 60 * 60_000;
export const MS_1M = 60_000;

export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function classifyProfile(gapsSec, medianSec) {
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

function phaseWindow(ctx, stats, halfWindowMs) {
  const med = stats.medianIntervalMs;
  if (!ctx.lastLvSourceMs || !med) return { inside: false };
  const expectedMs = ctx.lastLvSourceMs + med;
  return { inside: Math.abs(ctx.nowMs - expectedMs) <= halfWindowMs, expectedMs };
}

export function buildPolicy(id) {
  const policies = {
    B0_CONTROL: (ctx, t, profile, stats) => true,
    B2_HB10_IN1: (ctx, t, profile, stats) => {
      if (!ctx.reconciliation) return true;
      const win = phaseWindow(ctx, stats, MS_30M);
      if (win.inside) return t - ctx.lastAllowedMs >= MS_1M;
      return t - ctx.lastAllowedMs >= MS_10M;
    },
    B4_PHASE_30M: (ctx, t, profile, stats) => {
      if (!ctx.reconciliation) return true;
      if (profile !== 'STABLE_PERIODIC') return t - ctx.lastAllowedMs >= MS_5M;
      const win = phaseWindow(ctx, stats, MS_30M);
      if (win.inside) return true;
      return t - ctx.lastAllowedMs >= MS_5M;
    },
  };
  if (!policies[id]) throw new Error(`Unknown policy ${id}`);
  return { id, decide: policies[id] };
}

export function simulatePolicy(policyId, vehicles, ctxBundle) {
  const policy = buildPolicy(policyId);
  const {
    pollsByVehicle,
    lvByVehicle,
    profiles,
    profileStats,
    inActiveTrip,
    advancesByVehicle,
  } = ctxBundle;

  const perVehicle = {};
  let fleetBaseline = 0;
  let fleetSim = 0;
  let lvTotal = 0;
  let lvMissed = 0;
  const absDelays = [];
  const addDelays = [];
  let earlyTotal = 0;
  let earlyMissed = 0;
  const controlDiscByVehicle = new Map();

  for (const v of vehicles) {
    const polls = pollsByVehicle.get(v.id) ?? [];
    const lvRows = lvByVehicle.get(v.id) ?? [];
    const profile = profiles[v.id];
    const stats = profileStats[v.id];
    const advances = advancesByVehicle.get(v.id) ?? [];

    let lastAllowedMs = 0;
    let lastLvSourceMs = null;
    let baselineRecon = 0;
    let simRecon = 0;
    const allowedPollEnds = [];

    for (const p of polls) {
      const reconciliation = !inActiveTrip(v.id, p.tMs);
      const ctx = { reconciliation, lastAllowedMs, lastLvSourceMs, nowMs: p.tMs };
      const allow =
        policyId === 'B0_CONTROL' ? true : policy.decide(ctx, p.tMs, profile, stats);
      if (reconciliation) baselineRecon++;
      if (reconciliation && allow) {
        simRecon++;
        lastAllowedMs = p.tMs;
        allowedPollEnds.push(p.tEndMs);
        const visible = lvRows.filter((r) => r.obsMs <= p.tEndMs);
        if (visible.length) lastLvSourceMs = Math.max(...visible.map((r) => r.ptMs));
      } else if (allow) {
        lastAllowedMs = p.tMs;
        allowedPollEnds.push(p.tEndMs);
      }
    }

    const discover = (ends) =>
      advances.map((adv) => {
        const first = ends.find((e) => e >= adv.ptMs);
        return first == null
          ? { missed: true, delay: null }
          : { missed: false, delay: first - adv.ptMs };
      });

    const controlEnds = polls.map((p) => p.tEndMs);
    const controlDisc = discover(controlEnds);
    controlDiscByVehicle.set(v.id, controlDisc);
    const simDisc = discover(allowedPollEnds);

    const med = stats.medianIntervalMs || 8 * 3600 * 1000;
    let vehMissed = 0;
    const vehAbs = [];
    for (let i = 0; i < advances.length; i++) {
      lvTotal++;
      if (simDisc[i].missed) {
        vehMissed++;
        lvMissed++;
      } else vehAbs.push(simDisc[i].delay);
      const gap = i > 0 ? advances[i].ptMs - advances[i - 1].ptMs : null;
      if (gap != null && gap < Math.min(6 * 3600 * 1000, med * 0.75)) {
        earlyTotal++;
        if (simDisc[i].missed) earlyMissed++;
      }
      if (!controlDisc[i].missed && !simDisc[i].missed) {
        addDelays.push(simDisc[i].delay - controlDisc[i].delay);
      }
    }

    absDelays.push(...vehAbs);
    fleetBaseline += baselineRecon;
    fleetSim += simRecon;
    perVehicle[v.tokenId] = {
      profile,
      baselineReconciliationPolls: baselineRecon,
      simulatedReconciliationPolls: simRecon,
      pollReduction: baselineRecon ? 1 - simRecon / baselineRecon : 0,
      lvAdvances: advances.length,
      missedLvAdvances: vehMissed,
    };
  }

  const sortedAbs = absDelays.filter((d) => d != null).sort((a, b) => a - b);
  const sortedAdd = addDelays.sort((a, b) => a - b);
  return {
    policyId,
    fleetBaselineReconciliationPolls: fleetBaseline,
    fleetSimulatedReconciliationPolls: fleetSim,
    reductionPercent: fleetBaseline ? ((fleetBaseline - fleetSim) / fleetBaseline) * 100 : 0,
    lvAdvancesTotal: lvTotal,
    lvAdvancesMissed: lvMissed,
    lvAdvancesDiscovered: lvTotal - lvMissed,
    earlyAdvancesTotal: earlyTotal,
    earlyAdvancesMissed: earlyMissed,
    absoluteDiscovery: {
      p50: quantile(sortedAbs, 0.5),
      p90: quantile(sortedAbs, 0.9),
      p95: quantile(sortedAbs, 0.95),
      p99: quantile(sortedAbs, 0.99),
      max: sortedAbs.length ? sortedAbs[sortedAbs.length - 1] : null,
    },
    additionalVsB0: {
      p50: quantile(sortedAdd, 0.5),
      p90: quantile(sortedAdd, 0.9),
      p95: quantile(sortedAdd, 0.95),
      p99: quantile(sortedAdd, 0.99),
      max: sortedAdd.length ? sortedAdd[sortedAdd.length - 1] : null,
    },
    perVehicle,
    controlDiscByVehicle,
  };
}
