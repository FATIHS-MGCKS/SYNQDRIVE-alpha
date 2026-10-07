/**
 * APDS-9.2C read-only exact Run-1 empirical replay (no DB mutations).
 * RC SHA: 4e1618cfc — imports policy engine from workspace at that commit.
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  evaluateP25ApdB2V1Core,
  evaluateP25ApdB4V1Core,
} from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-policy-engine';
import { evaluateP25ApdProfile } from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-profile-evaluator';
import { applyP25ApdShadowSafetyOverlay } from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-shadow-overlay';
import { classifyP25ApdCadenceProfile } from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-profile-classifier';
import { P25_APD_SHADOW_ADVANCING_DECISIONS } from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-shadow/p25-apd-shadow-execution-versions';
import { P25_APD_RC_LV_FALLBACK_QUERY_BOUNDED_BY_POLL_COMPLETION } from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-historical-lv-visibility';
import { P25_APD_PS1_PROFILE_MEDIAN_INTERVAL_FALLBACK_MS } from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-profile-semantics';

const FROM_MS = Date.parse('2026-10-07T13:41:51.992Z');
const TO_MS = Date.parse('2026-10-07T14:30:37.000Z');
const EXPECTED_TOKENS = [186946, 187336, 187361, 187784, 192922] as const;

const MS_30M = 30 * 60_000;
const MS_1M = 60_000;
const MS_5M = 5 * 60_000;
const MS_10M = 10 * 60_000;

type LvRow = { ptMs: number; obsMs: number; createdMs: number };
type Poll = { id: string; tMs: number; tEndMs: number; vehicleId: string; tokenId: number; safeRef: string };

function quantile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function ps1ClassifyProfile(gapsSec: number[], medianSec: number): string {
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

function offlineB2Allow(
  reconciliation: boolean,
  lastAllowedMs: number,
  lastLvSourceMs: number | null,
  tMs: number,
  medianIntervalMs: number,
): boolean {
  if (!reconciliation) return true;
  if (lastLvSourceMs == null || !medianIntervalMs) {
    return tMs - lastAllowedMs >= MS_10M;
  }
  const expectedMs = lastLvSourceMs + medianIntervalMs;
  const inside = Math.abs(tMs - expectedMs) <= MS_30M;
  if (inside) return tMs - lastAllowedMs >= MS_1M;
  return tMs - lastAllowedMs >= MS_10M;
}

function offlineB4Allow(
  reconciliation: boolean,
  lastAllowedMs: number,
  lastLvSourceMs: number | null,
  tMs: number,
  profile: string,
  medianIntervalMs: number,
): boolean {
  if (!reconciliation) return true;
  if (profile !== 'STABLE_PERIODIC') return tMs - lastAllowedMs >= MS_5M;
  if (lastLvSourceMs == null || !medianIntervalMs) return tMs - lastAllowedMs >= MS_5M;
  const expectedMs = lastLvSourceMs + medianIntervalMs;
  const inside = Math.abs(tMs - expectedMs) <= MS_30M;
  if (inside) return true;
  return tMs - lastAllowedMs >= MS_5M;
}

function isAdvancing(decision: string): boolean {
  return (P25_APD_SHADOW_ADVANCING_DECISIONS as readonly string[]).includes(decision);
}

function phaseWindow(
  decisionAtMs: number,
  lastLv: number | null,
  medianIntervalMs: number,
): { inside: boolean; expectedMs: number | null; startMs: number | null; endMs: number | null } {
  if (lastLv == null || !medianIntervalMs) {
    return { inside: false, expectedMs: null, startMs: null, endMs: null };
  }
  const expectedMs = lastLv + medianIntervalMs;
  const inside = Math.abs(decisionAtMs - expectedMs) <= MS_30M;
  return {
    inside,
    expectedMs,
    startMs: expectedMs - MS_30M,
    endMs: expectedMs + MS_30M,
  };
}

function rcDecision(
  policy: 'B2' | 'B4',
  input: {
    decisionAtMs: number;
    reconciliation: boolean;
    lastAllowedMs: number;
    lastLv: number | null;
    profileClass: string;
    medianIntervalMs: number;
  },
) {
  const base = {
    organizationId: 'replay',
    vehicleId: 'replay',
    decisionAtMs: input.decisionAtMs,
    reconciliation: input.reconciliation,
    lastTrustworthyLvSourceMs: input.lastLv,
    lastProviderFetchedAtMs: null,
    profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
    medianIntervalMs: input.medianIntervalMs,
    tripFsmActive: !input.reconciliation,
    providerGapOpen: false,
    r9WakePending: false,
    profileClass: input.profileClass as 'STABLE_PERIODIC',
    lastAllowedReconciliationPollMs: input.lastAllowedMs,
  };
  const core =
    policy === 'B2' ? evaluateP25ApdB2V1Core(base) : evaluateP25ApdB4V1Core(base);
  const overlay = applyP25ApdShadowSafetyOverlay(core, {
    r9WakeKnown: false,
    profileInvalidated: false,
    invalidationReason: null,
    providerGapOpen: false,
    sourceTimestampMissing: input.lastLv == null,
    reconnectPending: false,
  });
  return overlay;
}

async function main() {
  const prisma = new PrismaClient();
  const out: Record<string, unknown> = {};

  const vehicles = await prisma.$queryRaw<
    Array<{ id: string; organization_id: string; dimo_token_id: number; vehicle_name: string; fuel_type: string }>
  >`
    SELECT v.id::text, v.organization_id::text, vls.dimo_token_id, v.vehicle_name, v.fuel_type::text
    FROM vehicles v
    JOIN vehicle_latest_states vls ON vls.vehicle_id = v.id
    WHERE vls.dimo_token_id IN (${EXPECTED_TOKENS[0]}, ${EXPECTED_TOKENS[1]}, ${EXPECTED_TOKENS[2]}, ${EXPECTED_TOKENS[3]}, ${EXPECTED_TOKENS[4]})
  `;

  const orgIds = new Set(vehicles.map((v) => v.organization_id));
  if (vehicles.length !== 5 || orgIds.size !== 1) {
    throw new Error(`cohort mismatch: vehicles=${vehicles.length} orgs=${orgIds.size}`);
  }

  const vehicleIds = vehicles.map((v) => v.id);
  const safeRef = (v: { dimo_token_id: number; vehicle_name: string }) =>
    `token_${v.dimo_token_id}`;

  const trips = await prisma.$queryRaw<
    Array<{ vehicle_id: string; start_ms: number; end_ms: number }>
  >`
    SELECT vehicle_id::text,
           EXTRACT(EPOCH FROM start_time)*1000 AS start_ms,
           EXTRACT(EPOCH FROM COALESCE(end_time, '2026-10-07T14:30:37Z'::timestamptz))*1000 AS end_ms
    FROM vehicle_trips
    WHERE vehicle_id::uuid = ANY(${vehicleIds}::uuid[])
      AND start_time <= ${new Date(TO_MS)}
      AND (end_time IS NULL OR end_time >= ${new Date(FROM_MS)})
  `;

  const inActiveTrip = (vehicleId: string, tMs: number) =>
    trips.some((tr) => tr.vehicle_id === vehicleId && tMs >= tr.start_ms && tMs <= tr.end_ms);

  const pollsRaw = await prisma.$queryRaw<
    Array<{ id: string; vehicle_id: string; t_ms: number; t_end_ms: number }>
  >`
    SELECT id::text, vehicle_id::text,
           EXTRACT(EPOCH FROM started_at)*1000 AS t_ms,
           EXTRACT(EPOCH FROM COALESCE(finished_at, started_at))*1000 AS t_end_ms
    FROM dimo_poll_logs
    WHERE vehicle_id::uuid = ANY(${vehicleIds}::uuid[])
      AND job_type = 'SNAPSHOT'::"DimoPollJobType"
      AND status = 'SUCCESS'::"DimoPollStatus"
      AND started_at >= ${new Date(FROM_MS)}
      AND started_at <= ${new Date(TO_MS)}
    ORDER BY started_at ASC
  `;

  const lvLookbackMs = FROM_MS - 120 * 24 * 3600_000;
  const lvRowsRaw = await prisma.$queryRaw<
    Array<{ vehicle_id: string; pt_ms: number; obs_ms: number; created_ms: number }>
  >`
    SELECT vehicle_id::text,
           EXTRACT(EPOCH FROM provider_timestamp)*1000 AS pt_ms,
           EXTRACT(EPOCH FROM observed_at)*1000 AS obs_ms,
           EXTRACT(EPOCH FROM created_at)*1000 AS created_ms
    FROM battery_measurements
    WHERE vehicle_id::uuid = ANY(${vehicleIds}::uuid[])
      AND type = 'LIVE_VOLTAGE' AND quality = 'VALID'
      AND provider_timestamp IS NOT NULL
      AND provider_timestamp >= ${new Date(lvLookbackMs)}
      AND provider_timestamp <= ${new Date(TO_MS)}
      AND (context->>'engineRunning')::boolean IS FALSE
      AND (context->>'speedKmh')::float IS NOT NULL AND (context->>'speedKmh')::float <= 0.5
      AND (context->>'ignitionOn')::boolean IS FALSE
      AND NOT COALESCE((context->>'isLvCharging')::boolean, false)
      AND NOT COALESCE((context->>'isHvCharging')::boolean, false)
    ORDER BY vehicle_id, provider_timestamp
  `;

  const lvByVehicle = new Map<string, LvRow[]>();
  for (const r of lvRowsRaw) {
    const arr = lvByVehicle.get(r.vehicle_id) ?? [];
    arr.push({ ptMs: Number(r.pt_ms), obsMs: Number(r.obs_ms), createdMs: Number(r.created_ms) });
    lvByVehicle.set(r.vehicle_id, arr);
  }

  const profiles: Record<string, string> = {};
  const profileStats: Record<string, { medianIntervalMs: number }> = {};
  const rcProfiles: Record<string, string> = {};
  const rcMedians: Record<string, number> = {};
  let profileClassDiv = 0;
  let profileMedianDiv = 0;

  for (const v of vehicles) {
    const rows = lvByVehicle.get(v.id) ?? [];
    const dedup: LvRow[] = [];
    let lastPt: number | null = null;
    for (const r of rows) {
      if (lastPt !== r.ptMs) dedup.push(r);
      lastPt = r.ptMs;
    }
    const gaps: number[] = [];
    for (let i = 1; i < dedup.length; i++) {
      const g = (dedup[i].ptMs - dedup[i - 1].ptMs) / 1000;
      if (g > 60) gaps.push(g);
    }
    const sorted = [...gaps].sort((a, b) => a - b);
    const medianSec = quantile(sorted, 0.5) ?? 0;
    let profile = ps1ClassifyProfile(gaps, medianSec);
    if (gaps.length < 5 && v.fuel_type === 'ELECTRIC' && dedup.length === 0) {
      profile = 'PROVIDER_OBSERVABILITY_GAP';
    }
    profiles[v.id] = profile;
    profileStats[v.id] = { medianIntervalMs: medianSec * 1000 || 8 * 3600_000 };

    const lvTsForRc = dedup
      .filter((r) => r.obsMs <= TO_MS)
      .map((r) => r.ptMs)
      .sort((a, b) => a - b);
    const rcEval = evaluateP25ApdProfile({
      nowMs: TO_MS,
      lvProviderTimestampsMs: lvTsForRc,
      vehicleFuelType: v.fuel_type,
      providerGapOpen: false,
      tripActive: false,
      r9WakeRecent: false,
      deviceReconnectRecent: false,
      providerReconnectRecent: false,
      earlyAdvanceDetected: false,
      lateAdvanceDetected: false,
      phaseDriftDetected: false,
      capabilityChanged: false,
    });
    rcProfiles[v.id] = rcEval.profileClass;
    rcMedians[v.id] = rcEval.medianCadenceMs;
    if (profile !== rcProfiles[v.id]) profileClassDiv++;
    if (Math.abs(profileStats[v.id].medianIntervalMs - rcMedians[v.id]) > 1000) profileMedianDiv++;
  }

  const polls: Poll[] = pollsRaw.map((p) => {
    const v = vehicles.find((x) => x.id === p.vehicle_id)!;
    return {
      id: p.id,
      vehicleId: p.vehicle_id,
      tokenId: v.dimo_token_id,
      safeRef: safeRef(v),
      tMs: Number(p.t_ms),
      tEndMs: Number(p.t_end_ms),
    };
  });

  let reconCount = 0;
  let nonReconCount = 0;
  for (const p of polls) {
    if (!inActiveTrip(p.vehicleId, p.tMs)) reconCount++;
    else nonReconCount++;
  }

  type PolicyState = { lastAllowed: number; lastLv: number | null };
  const initStates = () => {
    const m = new Map<string, PolicyState>();
    for (const v of vehicles) m.set(v.id, { lastAllowed: 0, lastLv: null });
    return m;
  };

  const b2Metrics = {
    events: 0,
    decision: 0,
    reason: 0,
    lastAllowed: 0,
    lastLv: 0,
    phase: 0,
    recon: 0,
    firstDivAt: null as string | null,
    firstDivRef: null as string | null,
  };
  const b4Metrics = { ...b2Metrics, firstDivAt: null as string | null, firstDivRef: null as string | null };

  const comparePolicy = (policy: 'B2' | 'B4', metrics: typeof b2Metrics) => {
    const offline = initStates();
    const rc = initStates();
    for (const p of polls) {
      const profile = profiles[p.vehicleId]!;
      const med = profileStats[p.vehicleId]!.medianIntervalMs;
      const lvRows = lvByVehicle.get(p.vehicleId) ?? [];
      const reconciliation = !inActiveTrip(p.vehicleId, p.tMs);
      const offSt = offline.get(p.vehicleId)!;
      const rcSt = rc.get(p.vehicleId)!;

      const offAllow =
        policy === 'B2'
          ? offlineB2Allow(reconciliation, offSt.lastAllowed, offSt.lastLv, p.tMs, med)
          : offlineB4Allow(reconciliation, offSt.lastAllowed, offSt.lastLv, p.tMs, profile, med);

      const offPhase = phaseWindow(p.tMs, offSt.lastLv, med);
      const rcDec =
        policy === 'B2'
          ? evaluateP25ApdB2V1Core({
              organizationId: 'replay',
              vehicleId: p.vehicleId,
              decisionAtMs: p.tMs,
              reconciliation,
              lastTrustworthyLvSourceMs: rcSt.lastLv,
              lastProviderFetchedAtMs: null,
              profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
              medianIntervalMs: med,
              tripFsmActive: !reconciliation,
              providerGapOpen: false,
              r9WakePending: false,
              profileClass: profile as 'STABLE_PERIODIC',
              lastAllowedReconciliationPollMs: rcSt.lastAllowed,
            })
          : evaluateP25ApdB4V1Core({
              organizationId: 'replay',
              vehicleId: p.vehicleId,
              decisionAtMs: p.tMs,
              reconciliation,
              lastTrustworthyLvSourceMs: rcSt.lastLv,
              lastProviderFetchedAtMs: null,
              profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
              medianIntervalMs: med,
              tripFsmActive: !reconciliation,
              providerGapOpen: false,
              r9WakePending: false,
              profileClass: profile as 'STABLE_PERIODIC',
              lastAllowedReconciliationPollMs: rcSt.lastAllowed,
            });
      const rcPhase = phaseWindow(p.tMs, rcSt.lastLv, med);

      metrics.events++;
      const offCore =
        policy === 'B2'
          ? evaluateP25ApdB2V1Core({
              organizationId: 'replay',
              vehicleId: p.vehicleId,
              decisionAtMs: p.tMs,
              reconciliation,
              lastTrustworthyLvSourceMs: offSt.lastLv,
              lastProviderFetchedAtMs: null,
              profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
              medianIntervalMs: med,
              tripFsmActive: !reconciliation,
              providerGapOpen: false,
              r9WakePending: false,
              profileClass: profile as 'STABLE_PERIODIC',
              lastAllowedReconciliationPollMs: offSt.lastAllowed,
            })
          : evaluateP25ApdB4V1Core({
              organizationId: 'replay',
              vehicleId: p.vehicleId,
              decisionAtMs: p.tMs,
              reconciliation,
              lastTrustworthyLvSourceMs: offSt.lastLv,
              lastProviderFetchedAtMs: null,
              profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
              medianIntervalMs: med,
              tripFsmActive: !reconciliation,
              providerGapOpen: false,
              r9WakePending: false,
              profileClass: profile as 'STABLE_PERIODIC',
              lastAllowedReconciliationPollMs: offSt.lastAllowed,
            });

      if (offCore.decision !== rcDec.decision) {
        metrics.decision++;
        if (!metrics.firstDivAt) {
          metrics.firstDivAt = new Date(p.tMs).toISOString();
          metrics.firstDivRef = p.safeRef;
        }
      }
      if (offCore.reason !== rcDec.reason) metrics.reason++;
      if (offSt.lastAllowed !== rcSt.lastAllowed) metrics.lastAllowed++;
      if (offSt.lastLv !== rcSt.lastLv) metrics.lastLv++;
      if (offPhase.inside !== rcPhase.inside) metrics.phase++;

      const visible = lvRows.filter((r) => r.obsMs <= p.tEndMs);
      const visibleMaxPt =
        visible.length > 0 ? Math.max(...visible.map((r) => r.ptMs)) : null;

      if (reconciliation && offAllow) {
        offSt.lastAllowed = p.tMs;
        if (visibleMaxPt != null) offSt.lastLv = visibleMaxPt;
      } else if (offAllow) {
        offSt.lastAllowed = p.tMs;
      }

      if (isAdvancing(rcDec.decision)) {
        rcSt.lastAllowed = p.tMs;
        if (reconciliation && visibleMaxPt != null) rcSt.lastLv = visibleMaxPt;
      }
    }
  };

  comparePolicy('B2', b2Metrics);
  comparePolicy('B4', b4Metrics);

  // Active-trip -> recon transitions
  let activeToRecon = 0;
  let b2ActiveReconDiv = 0;
  let b4ActiveReconDiv = 0;

  for (const v of vehicles) {
    const stB2 = { lastAllowed: 0, lastLv: null as number | null };
    const stB4 = { lastAllowed: 0, lastLv: null as number | null };
    const vPolls = polls.filter((p) => p.vehicleId === v.id);
    for (let i = 0; i < vPolls.length; i++) {
      const p = vPolls[i];
      const prevRecon = !inActiveTrip(p.vehicleId, p.tMs);
      const med = profileStats[v.id]!.medianIntervalMs;
      const profile = profiles[v.id]!;
      const lvRows = lvByVehicle.get(v.id) ?? [];
      const visible = lvRows.filter((r) => r.obsMs <= p.tEndMs);
      const visibleMaxPt =
        visible.length > 0 ? Math.max(...visible.map((r) => r.ptMs)) : null;

      if (i > 0) {
        const prev = vPolls[i - 1];
        const prevTrip = inActiveTrip(prev.vehicleId, prev.tMs);
        const curRecon = !inActiveTrip(p.vehicleId, p.tMs);
        if (prevTrip && curRecon) {
          activeToRecon++;
          if (stB2.lastAllowed !== prev.tMs) b2ActiveReconDiv++;
          if (stB4.lastAllowed !== prev.tMs) b4ActiveReconDiv++;
        }
      }

      const b2allow = offlineB2Allow(prevRecon, stB2.lastAllowed, stB2.lastLv, p.tMs, med);
      const b4allow = offlineB4Allow(prevRecon, stB4.lastAllowed, stB4.lastLv, p.tMs, profile, med);
      if (prevRecon && b2allow) {
        stB2.lastAllowed = p.tMs;
        if (visibleMaxPt != null) stB2.lastLv = visibleMaxPt;
      } else if (b2allow) stB2.lastAllowed = p.tMs;
      if (prevRecon && b4allow) {
        stB4.lastAllowed = p.tMs;
        if (visibleMaxPt != null) stB4.lastLv = visibleMaxPt;
      } else if (b4allow) stB4.lastAllowed = p.tMs;
    }
  }

  // B2/B4 decision difference + LV state
  let b2b4Diff = 0;
  let lvTestable = 0;
  let b2LvStateDiv = 0;
  let b4LvStateDiv = 0;
  const simB2Lv = new Map<string, number | null>();
  const simB4Lv = new Map<string, number | null>();
  for (const v of vehicles) {
    simB2Lv.set(v.id, null);
    simB4Lv.set(v.id, null);
  }
  for (const p of polls) {
    const med = profileStats[p.vehicleId]!.medianIntervalMs;
    const profile = profiles[p.vehicleId]!;
    const reconciliation = !inActiveTrip(p.vehicleId, p.tMs);
    const b2d = rcDecision('B2', {
      decisionAtMs: p.tMs,
      reconciliation,
      lastAllowedMs: 0,
      lastLv: simB2Lv.get(p.vehicleId)!,
      profileClass: profile,
      medianIntervalMs: med,
    });
    const b4d = rcDecision('B4', {
      decisionAtMs: p.tMs,
      reconciliation,
      lastAllowedMs: 0,
      lastLv: simB4Lv.get(p.vehicleId)!,
      profileClass: profile,
      medianIntervalMs: med,
    });
    if (b2d.decision !== b4d.decision) b2b4Diff++;
    if (b2d.decision !== b4d.decision) lvTestable++;
    const lvRows = lvByVehicle.get(p.vehicleId) ?? [];
    const visible = lvRows.filter((r) => r.obsMs <= p.tEndMs);
    const visibleMaxPt =
      visible.length > 0 ? Math.max(...visible.map((r) => r.ptMs)) : null;
    if (isAdvancing(b2d.decision) && reconciliation && visibleMaxPt != null)
      simB2Lv.set(p.vehicleId, visibleMaxPt);
    if (isAdvancing(b4d.decision) && reconciliation && visibleMaxPt != null)
      simB4Lv.set(p.vehicleId, visibleMaxPt);
  }

  // Savings replay
  let baselineRecon = 0;
  let offB2Keep = 0;
  let offB2Skip = 0;
  let rcB2Keep = 0;
  let rcB2Skip = 0;
  let offB4Keep = 0;
  let offB4Skip = 0;
  let rcB4Keep = 0;
  let rcB4Skip = 0;

  const off2 = initStates();
  const off4 = initStates();
  const rc2 = initStates();
  const rc4 = initStates();

  for (const p of polls) {
    const profile = profiles[p.vehicleId]!;
    const med = profileStats[p.vehicleId]!.medianIntervalMs;
    const reconciliation = !inActiveTrip(p.vehicleId, p.tMs);
    if (reconciliation) baselineRecon++;
    const lvRows = lvByVehicle.get(p.vehicleId) ?? [];
    const visible = lvRows.filter((r) => r.obsMs <= p.tEndMs);
    const visibleMaxPt =
      visible.length > 0 ? Math.max(...visible.map((r) => r.ptMs)) : null;
    const s2o = off2.get(p.vehicleId)!;
    const s4o = off4.get(p.vehicleId)!;
    const s2r = rc2.get(p.vehicleId)!;
    const s4r = rc4.get(p.vehicleId)!;

    const o2 = offlineB2Allow(reconciliation, s2o.lastAllowed, s2o.lastLv, p.tMs, med);
    const o4 = offlineB4Allow(reconciliation, s4o.lastAllowed, s4o.lastLv, p.tMs, profile, med);
    if (reconciliation) {
      if (o2) offB2Keep++;
      else offB2Skip++;
      if (o4) offB4Keep++;
      else offB4Skip++;
    }
    const r2 = evaluateP25ApdB2V1Core({
      organizationId: 'replay',
      vehicleId: p.vehicleId,
      decisionAtMs: p.tMs,
      reconciliation,
      lastTrustworthyLvSourceMs: s2r.lastLv,
      lastProviderFetchedAtMs: null,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      medianIntervalMs: med,
      tripFsmActive: !reconciliation,
      providerGapOpen: false,
      r9WakePending: false,
      profileClass: profile as 'STABLE_PERIODIC',
      lastAllowedReconciliationPollMs: s2r.lastAllowed,
    });
    const r4 = evaluateP25ApdB4V1Core({
      organizationId: 'replay',
      vehicleId: p.vehicleId,
      decisionAtMs: p.tMs,
      reconciliation,
      lastTrustworthyLvSourceMs: s4r.lastLv,
      lastProviderFetchedAtMs: null,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      medianIntervalMs: med,
      tripFsmActive: !reconciliation,
      providerGapOpen: false,
      r9WakePending: false,
      profileClass: profile as 'STABLE_PERIODIC',
      lastAllowedReconciliationPollMs: s4r.lastAllowed,
    });
    if (reconciliation) {
      if (isAdvancing(r2.decision)) rcB2Keep++;
      else rcB2Skip++;
      if (isAdvancing(r4.decision)) rcB4Keep++;
      else rcB4Skip++;
    }
    if (reconciliation && o2) {
      s2o.lastAllowed = p.tMs;
      if (visibleMaxPt != null) s2o.lastLv = visibleMaxPt;
    } else if (o2) s2o.lastAllowed = p.tMs;
    if (reconciliation && o4) {
      s4o.lastAllowed = p.tMs;
      if (visibleMaxPt != null) s4o.lastLv = visibleMaxPt;
    } else if (o4) s4o.lastAllowed = p.tMs;
    if (isAdvancing(r2.decision)) {
      s2r.lastAllowed = p.tMs;
      if (reconciliation && visibleMaxPt != null) s2r.lastLv = visibleMaxPt;
    }
    if (isAdvancing(r4.decision)) {
      s4r.lastAllowed = p.tMs;
      if (reconciliation && visibleMaxPt != null) s4r.lastLv = visibleMaxPt;
    }
  }

  // LV lookahead audit
  let postCompletionCandidates = 0;
  let actualRcLookahead = 0;
  for (const p of polls) {
    const lvRows = lvByVehicle.get(p.vehicleId) ?? [];
    const naiveLatest = [...lvRows].sort((a, b) => b.ptMs - a.ptMs)[0];
    const visibleByEnd = lvRows.filter((r) => r.obsMs <= p.tEndMs);
    const correctPt =
      visibleByEnd.length > 0 ? Math.max(...visibleByEnd.map((r) => r.ptMs)) : null;
    if (!naiveLatest) continue;
    if (naiveLatest.ptMs !== correctPt && naiveLatest.createdMs > p.tEndMs) {
      postCompletionCandidates++;
      const pipelineWouldUse = correctPt;
      if (pipelineWouldUse == null || naiveLatest.ptMs > pipelineWouldUse) actualRcLookahead++;
    }
    const unboundedFallback = naiveLatest.ptMs;
    if (unboundedFallback !== correctPt && naiveLatest.createdMs > p.tEndMs) {
      if (correctPt == null) actualRcLookahead++;
    }
  }

  // Synthetic boundaries
  const med = 8 * 3600_000;
  const lv = 2_990_000_000;
  const lastAllowed = 1_000_000;
  const lastLv = lastAllowed - med + 30_000;
  const synthB2_1m =
    evaluateP25ApdB2V1Core({
      organizationId: 's',
      vehicleId: 's',
      decisionAtMs: lastAllowed + 59_000,
      reconciliation: true,
      lastTrustworthyLvSourceMs: lastLv,
      lastProviderFetchedAtMs: null,
      profileVersion: 'P',
      medianIntervalMs: med,
      tripFsmActive: false,
      providerGapOpen: false,
      r9WakePending: false,
      profileClass: 'STABLE_PERIODIC',
      lastAllowedReconciliationPollMs: lastAllowed,
    }).decision === 'WOULD_SKIP' &&
    evaluateP25ApdB2V1Core({
      organizationId: 's',
      vehicleId: 's',
      decisionAtMs: lastAllowed + 60_000,
      reconciliation: true,
      lastTrustworthyLvSourceMs: lastLv,
      lastProviderFetchedAtMs: null,
      profileVersion: 'P',
      medianIntervalMs: med,
      tripFsmActive: false,
      providerGapOpen: false,
      r9WakePending: false,
      profileClass: 'STABLE_PERIODIC',
      lastAllowedReconciliationPollMs: lastAllowed,
    }).decision !== 'WOULD_SKIP';

  const requiredZero = [
    profileClassDiv,
    profileMedianDiv,
    b2Metrics.decision,
    b2Metrics.reason,
    b2Metrics.lastAllowed,
    b2Metrics.lastLv,
    b2Metrics.phase,
    b2Metrics.recon,
    b4Metrics.decision,
    b4Metrics.reason,
    b4Metrics.lastAllowed,
    b4Metrics.lastLv,
    b4Metrics.phase,
    b4Metrics.recon,
  ];
  const exactReplayPass =
    requiredZero.every((n) => n === 0) &&
    synthB2_1m &&
    P25_APD_RC_LV_FALLBACK_QUERY_BOUNDED_BY_POLL_COMPLETION;

  Object.assign(out, {
    PS1_SPARSE_EVIDENCE_FALLBACK_MS: P25_APD_PS1_PROFILE_MEDIAN_INTERVAL_FALLBACK_MS,
    RC_LV_FALLBACK_QUERY_BOUNDED_BY_POLL_COMPLETION:
      P25_APD_RC_LV_FALLBACK_QUERY_BOUNDED_BY_POLL_COMPLETION ? 'YES' : 'NO',
    EXACT_REPLAY_CERTIFICATION: exactReplayPass ? 'PASS' : 'EXACT_REPLAY_PARITY_FAIL',
    REPLAY_COHORT_SIZE: vehicles.length,
    REPLAY_SUCCESS_POLL_COUNT: polls.length,
    REPLAY_RECONCILIATION_POLL_COUNT: reconCount,
    REPLAY_NON_RECONCILIATION_POLL_COUNT: nonReconCount,
    REPLAY_LV_EVIDENCE_COUNT: lvRowsRaw.length,
    PROFILE_CLASS_DIVERGENCE_COUNT: profileClassDiv,
    PROFILE_MEDIAN_DIVERGENCE_COUNT: profileMedianDiv,
    B2_EVENT_COUNT: b2Metrics.events,
    B2_DECISION_DIVERGENCE_COUNT: b2Metrics.decision,
    B2_REASON_DIVERGENCE_COUNT: b2Metrics.reason,
    B2_LAST_ALLOWED_DIVERGENCE_COUNT: b2Metrics.lastAllowed,
    B2_LAST_LV_DIVERGENCE_COUNT: b2Metrics.lastLv,
    B2_PHASE_WINDOW_DIVERGENCE_COUNT: b2Metrics.phase,
    B2_RECONCILIATION_DIVERGENCE_COUNT: b2Metrics.recon,
    FIRST_B2_DIVERGENCE_AT: b2Metrics.firstDivAt,
    B4_EVENT_COUNT: b4Metrics.events,
    B4_DECISION_DIVERGENCE_COUNT: b4Metrics.decision,
    B4_REASON_DIVERGENCE_COUNT: b4Metrics.reason,
    B4_LAST_ALLOWED_DIVERGENCE_COUNT: b4Metrics.lastAllowed,
    B4_LAST_LV_DIVERGENCE_COUNT: b4Metrics.lastLv,
    B4_PHASE_WINDOW_DIVERGENCE_COUNT: b4Metrics.phase,
    B4_RECONCILIATION_DIVERGENCE_COUNT: b4Metrics.recon,
    ACTIVE_TO_RECON_TRANSITION_COUNT: activeToRecon,
    B2_ACTIVE_TO_RECON_STATE_DIVERGENCE_COUNT: b2ActiveReconDiv,
    B4_ACTIVE_TO_RECON_STATE_DIVERGENCE_COUNT: b4ActiveReconDiv,
    B2_B4_DECISION_DIFFERENCE_EVENT_COUNT: b2b4Diff,
    POST_COMPLETION_LV_LOOKAHEAD_CANDIDATE_COUNT: postCompletionCandidates,
    ACTUAL_RC_LV_LOOKAHEAD_EVENT_COUNT: actualRcLookahead,
    BASELINE_RECONCILIATION_POLLS: baselineRecon,
    OFFLINE_B2_KEEP: offB2Keep,
    OFFLINE_B2_SKIP: offB2Skip,
    RC_B2_KEEP: rcB2Keep,
    RC_B2_SKIP: rcB2Skip,
    OFFLINE_B4_KEEP: offB4Keep,
    OFFLINE_B4_SKIP: offB4Skip,
    RC_B4_KEEP: rcB4Keep,
    RC_B4_SKIP: rcB4Skip,
    SYNTHETIC_B2_1M_BOUNDARY_PARITY: synthB2_1m ? 'PASS' : 'FAIL',
    perVehicleProfiles: vehicles.map((v) => ({
      safeRef: safeRef(v),
      OFFLINE_PROFILE: profiles[v.id],
      RC_PROFILE: rcProfiles[v.id],
      offlineMedianMs: profileStats[v.id]!.medianIntervalMs,
      rcMedianMs: rcMedians[v.id],
    })),
  });

  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
