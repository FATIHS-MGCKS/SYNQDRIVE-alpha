/**
 * Shared frozen 9.2C empirical replay corpus loader (read-only source tables).
 */
import type { PrismaClient } from '@prisma/client';
import { evaluateP25ApdProfile } from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-profile-evaluator';

export const APD_FROZEN_REPLAY_FROM_MS = Date.parse('2026-10-07T13:41:51.992Z');
export const APD_FROZEN_REPLAY_TO_MS = Date.parse('2026-10-07T14:30:37.000Z');
export const APD_FROZEN_REPLAY_EXPECTED_TOKENS = [
  186946,
  187336,
  187361,
  187784,
  192922,
] as const;

type LvRow = { ptMs: number; obsMs: number; createdMs: number };

export type ApdFrozenReplayPoll = {
  id: string;
  vehicleId: string;
  tokenId: number;
  safeRef: string;
  tMs: number;
  tEndMs: number;
};

export type ApdFrozenReplayCorpus = {
  vehicles: Array<{
    id: string;
    organization_id: string;
    dimo_token_id: number;
    vehicle_name: string;
    fuel_type: string;
  }>;
  polls: ApdFrozenReplayPoll[];
  lvByVehicle: Map<string, LvRow[]>;
  lvRowCount: number;
  profiles: Record<string, string>;
  profileStats: Record<string, { medianIntervalMs: number }>;
  reconCount: number;
  nonReconCount: number;
  inActiveTrip: (vehicleId: string, tMs: number) => boolean;
  safeRef: (v: { dimo_token_id: number; vehicle_name: string }) => string;
};

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

export async function loadApdFrozenReplayCorpus(
  prisma: PrismaClient,
): Promise<ApdFrozenReplayCorpus> {
  const FROM_MS = APD_FROZEN_REPLAY_FROM_MS;
  const TO_MS = APD_FROZEN_REPLAY_TO_MS;
  const EXPECTED_TOKENS = APD_FROZEN_REPLAY_EXPECTED_TOKENS;

  const vehicles = await prisma.$queryRaw<
    Array<{
      id: string;
      organization_id: string;
      dimo_token_id: number;
      vehicle_name: string;
      fuel_type: string;
    }>
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
    arr.push({
      ptMs: Number(r.pt_ms),
      obsMs: Number(r.obs_ms),
      createdMs: Number(r.created_ms),
    });
    lvByVehicle.set(r.vehicle_id, arr);
  }

  const profiles: Record<string, string> = {};
  const profileStats: Record<string, { medianIntervalMs: number }> = {};

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
  }

  const polls: ApdFrozenReplayPoll[] = pollsRaw.map((p) => {
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

  return {
    vehicles,
    polls,
    lvByVehicle,
    lvRowCount: lvRowsRaw.length,
    profiles,
    profileStats,
    reconCount,
    nonReconCount,
    inActiveTrip,
    safeRef,
  };
}
