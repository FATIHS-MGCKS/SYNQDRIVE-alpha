/**
 * SynqDrive — One-shot backfill for LTE_R1 trips with the new DIMO-events +
 * fuel-consumption pipeline.
 *
 * Why this exists:
 *   The backend has been restarted with a corrected DIMO GraphQL query
 *   (`events(...)` instead of the non-existent `signals(safetySystem*)`) and
 *   with fuel-consumption derivation wired into the enrichment services.
 *   Existing COMPLETED trips are NOT automatically re-enriched by the
 *   periodic backfill (status guard requires null | FAILED_TRANSIENT).
 *
 *   Rather than waiting for the BullMQ worker or mutating status by hand,
 *   this script directly performs the re-enrichment for a named vehicle:
 *     - finds recent COMPLETED trips
 *     - fetches DIMO events via the new API
 *     - computes fuel summary
 *     - rewrites DrivingEvent rows and VehicleTrip counters
 *
 *   It uses the same auth flow as the backend (DIMO_CLIENT_ID + DIMO_PRIVATE_KEY)
 *   so it does not depend on the backend being reachable over HTTP.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-lte-r1-events-fuel.ts --vin "WOB X 6511"
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-lte-r1-events-fuel.ts --vehicleId <uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-lte-r1-events-fuel.ts --tokenId 189118
 *
 * Options:
 *   --hours <N>    Window for trip selection (default 48)
 *   --dryRun       Print what would change; no DB writes
 */
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Wallet } from 'ethers';
import { PrismaClient, DrivingEventType, DrivingEventSource } from '@prisma/client';

// ── .env bootstrap (same pattern as other scripts in this folder) ────────────
{
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

// ── CLI parsing ──────────────────────────────────────────────────────────────
function arg(name: string, fallback?: string): string | undefined {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  const v = process.argv[idx + 1];
  return v && !v.startsWith('--') ? v : fallback;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const WINDOW_HOURS = parseInt(arg('hours', '48')!, 10);
const DRY_RUN = hasFlag('dryRun');
const FILTER_VIN = arg('vin');
const FILTER_VEHICLE_ID = arg('vehicleId');
const FILTER_TOKEN_ID = arg('tokenId') ? parseInt(arg('tokenId')!, 10) : undefined;

// ── DIMO auth constants ──────────────────────────────────────────────────────
const AUTH_URL = process.env.DIMO_AUTH_URL ?? 'https://auth.dimo.zone';
const TOKEN_EXCHANGE_URL =
  process.env.DIMO_TOKEN_EXCHANGE_URL ?? 'https://token-exchange-api.dimo.zone';
const TELEMETRY_URL =
  process.env.DIMO_TELEMETRY_API_URL ?? 'https://telemetry-api.dimo.zone/query';
const NFT_CONTRACT =
  process.env.DIMO_VEHICLE_NFT_CONTRACT_ADDRESS ??
  '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
const CLIENT_ID = process.env.DIMO_CLIENT_ID!;
const PRIVATE_KEY = process.env.DIMO_PRIVATE_KEY!;
const DOMAIN = process.env.DIMO_REDIRECT_URI ?? 'https://auth.dimo.zone';

async function getDeveloperJwt(): Promise<string> {
  const challenge = await axios.post(
    `${AUTH_URL}/auth/web3/generate_challenge`,
    null,
    {
      params: {
        client_id: CLIENT_ID,
        domain: DOMAIN,
        scope: 'openid email',
        response_type: 'code',
        address: CLIENT_ID,
      },
      timeout: 20_000,
    },
  );
  const { state, challenge: msg } = challenge.data as {
    state: string;
    challenge: string;
  };
  const normalizedKey = PRIVATE_KEY.startsWith('0x') ? PRIVATE_KEY : `0x${PRIVATE_KEY}`;
  const wallet = new Wallet(normalizedKey);
  const signature = await wallet.signMessage(msg);
  const submit = await axios.post(
    `${AUTH_URL}/auth/web3/submit_challenge`,
    new URLSearchParams({
      client_id: CLIENT_ID,
      domain: DOMAIN,
      grant_type: 'authorization_code',
      state,
      signature,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20_000,
    },
  );
  const d = submit.data as any;
  return d.developer_jwt ?? d.access_token ?? d.token;
}

async function getVehicleJwt(devJwt: string, tokenId: number): Promise<string> {
  const resp = await axios.post(
    `${TOKEN_EXCHANGE_URL}/v1/tokens/exchange`,
    {
      nftContractAddress: NFT_CONTRACT,
      privileges: [1, 2, 3, 4, 5, 6],
      tokenId,
    },
    {
      headers: {
        Authorization: `Bearer ${devJwt}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    },
  );
  const d = resp.data as any;
  return d.token ?? d.access_token ?? d.jwt;
}

async function gql<T = any>(jwt: string, query: string): Promise<T> {
  const resp = await axios.post(
    TELEMETRY_URL,
    { query },
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    },
  );
  return resp.data as T;
}

// ── DIMO query helpers (mirror of queries/driving-events.query.ts + fuel) ───
function buildEventsQuery(tokenId: number, from: Date, to: Date): string {
  return `
    query {
      events(
        tokenId: ${tokenId}
        from: "${from.toISOString()}"
        to: "${to.toISOString()}"
        filter: { name: { in: ["behavior.harshBraking", "behavior.extremeBraking", "behavior.harshAcceleration", "behavior.harshCornering"] } }
      ) { timestamp name source durationNs metadata }
    }
  `.trim();
}

function buildFuelQuery(tokenId: number, from: Date, to: Date): string {
  return `
    query {
      signals(
        tokenId: ${tokenId}
        from: "${from.toISOString()}"
        to: "${to.toISOString()}"
        interval: "30s"
      ) {
        timestamp
        powertrainFuelSystemAbsoluteLevel(agg: AVG)
        powertrainFuelSystemRelativeLevel(agg: AVG)
      }
    }
  `.trim();
}

// ── Event-name → DrivingEventType (identical to LteR1 service) ─────────────
function normalizeEventName(raw: string): DrivingEventType | null {
  const base = raw
    .trim()
    .toLowerCase()
    .replace(/^behavior\./, '')
    .replace(/[\s_\-]+/g, '');
  switch (base) {
    case 'harshbraking':
      return 'HARSH_BRAKING';
    case 'extremebraking':
    case 'extremeemergency':
    case 'extremeemergencybraking':
      return 'EXTREME_BRAKING';
    case 'harshacceleration':
      return 'HARSH_ACCELERATION';
    case 'harshcornering':
      return 'HARSH_CORNERING';
    default:
      return null;
  }
}

const EVENT_SEVERITY: Record<DrivingEventType, number> = {
  HARSH_BRAKING: 0.6,
  EXTREME_BRAKING: 0.9,
  HARSH_ACCELERATION: 0.6,
  HARSH_CORNERING: 0.5,
  SPEEDING: 0.4,
  IDLE_EXCESSIVE: 0.2,
};

// ── Fuel summary (mirror of DimoSegmentsService.fetchFuelSummary) ──────────
// V4.6.46 alignment:
//   - Tightened refuel guard (>2 L AND ≥ 3 min trip)
//   - single_sample confidence when only 1 absolute reading exists
//   - Relative-% fallback when absolute samples are missing but tank is known
function computeFuelSummary(
  signals: any[],
  tripStart: Date,
  tripEnd: Date,
  tankCapacityLiters: number | null,
): {
  startAbs: number | null;
  endAbs: number | null;
  startRel: number | null;
  endRel: number | null;
  startAt: string | null;
  endAt: string | null;
  refuel: boolean;
  liters: number | null;
  confidence: 'high' | 'medium' | 'low' | 'single_sample' | 'relative_fallback' | null;
  absCount: number;
  relCount: number;
} {
  const ordered = signals
    .filter((s: any) => typeof s?.timestamp === 'string')
    .sort(
      (a: any, b: any) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

  let firstAbs: { v: number; at: string } | null = null;
  let lastAbs: { v: number; at: string } | null = null;
  let firstRel: number | null = null;
  let lastRel: number | null = null;
  let absCount = 0;
  let relCount = 0;

  for (const s of ordered) {
    const abs =
      typeof s.powertrainFuelSystemAbsoluteLevel === 'number'
        ? s.powertrainFuelSystemAbsoluteLevel
        : null;
    const rel =
      typeof s.powertrainFuelSystemRelativeLevel === 'number'
        ? s.powertrainFuelSystemRelativeLevel
        : null;
    if (abs != null) {
      absCount++;
      if (firstAbs == null) firstAbs = { v: abs, at: s.timestamp };
      lastAbs = { v: abs, at: s.timestamp };
    }
    if (rel != null) {
      relCount++;
      if (firstRel == null) firstRel = rel;
      lastRel = rel;
    }
  }

  const tripMs = tripEnd.getTime() - tripStart.getTime();

  // Path A: no absolute samples → try relative-% fallback if we know the tank.
  if (firstAbs == null || lastAbs == null) {
    if (
      firstRel != null &&
      lastRel != null &&
      tankCapacityLiters != null &&
      tankCapacityLiters > 0 &&
      relCount >= 2
    ) {
      const deltaPct = firstRel - lastRel;
      if (deltaPct >= 0 && deltaPct <= 100) {
        const liters = Math.round((deltaPct / 100) * tankCapacityLiters * 100) / 100;
        return {
          startAbs: null,
          endAbs: null,
          startRel: firstRel,
          endRel: lastRel,
          startAt: null,
          endAt: null,
          refuel: false,
          liters,
          confidence: 'relative_fallback',
          absCount,
          relCount,
        };
      }
    }
    return {
      startAbs: null,
      endAbs: null,
      startRel: firstRel,
      endRel: lastRel,
      startAt: null,
      endAt: null,
      refuel: false,
      liters: null,
      confidence: null,
      absCount,
      relCount,
    };
  }

  // Path B: single-sample guard (first === last; delta unknowable).
  if (absCount < 2) {
    return {
      startAbs: firstAbs.v,
      endAbs: lastAbs.v,
      startRel: firstRel,
      endRel: lastRel,
      startAt: firstAbs.at,
      endAt: lastAbs.at,
      refuel: false,
      liters: null,
      confidence: 'single_sample',
      absCount,
      relCount,
    };
  }

  // Path C: normal delta with tightened refuel guard.
  const refuel = lastAbs.v - firstAbs.v > 2.0 && tripMs >= 180_000;
  const delta = firstAbs.v - lastAbs.v;
  const liters = refuel ? null : delta > 0 ? delta : 0;

  const dStart = Math.abs(new Date(firstAbs.at).getTime() - tripStart.getTime());
  const dEnd = Math.abs(new Date(lastAbs.at).getTime() - tripEnd.getTime());

  let confidence: 'high' | 'medium' | 'low' | null;
  if (liters == null) confidence = 'low';
  else if (dStart <= 5 * 60_000 && dEnd <= 5 * 60_000) confidence = 'high';
  else if (dStart <= 15 * 60_000 && dEnd <= 15 * 60_000) confidence = 'medium';
  else confidence = 'low';

  return {
    startAbs: firstAbs.v,
    endAbs: lastAbs.v,
    startRel: firstRel,
    endRel: lastRel,
    startAt: firstAbs.at,
    endAt: lastAbs.at,
    refuel,
    liters,
    confidence,
    absCount,
    relCount,
  };
}

// ────────────────────────────────────────────────────────────────────────────
async function main() {
  if (!CLIENT_ID || !PRIVATE_KEY) {
    console.error(
      `[backfill] DIMO_CLIENT_ID and DIMO_PRIVATE_KEY must be set in backend/.env`,
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);

  const whereVehicle: any = { hardwareType: 'LTE_R1' };
  if (FILTER_VEHICLE_ID) whereVehicle.id = FILTER_VEHICLE_ID;
  if (FILTER_VIN) whereVehicle.vin = { contains: FILTER_VIN.replace(/\s+/g, '') };
  if (FILTER_TOKEN_ID) whereVehicle.dimoVehicle = { tokenId: FILTER_TOKEN_ID };

  const vehicles = await prisma.vehicle.findMany({
    where: whereVehicle,
    select: {
      id: true,
      vin: true,
      licensePlate: true,
      organizationId: true,
      hardwareType: true,
      fuelType: true,
      tankCapacityLiters: true,
      dimoVehicle: { select: { tokenId: true } },
    },
  });

  if (vehicles.length === 0) {
    console.log(
      `[backfill] No LTE_R1 vehicles matched the filter. Args: vehicleId=${FILTER_VEHICLE_ID ?? '-'} vin=${FILTER_VIN ?? '-'} tokenId=${FILTER_TOKEN_ID ?? '-'}`,
    );
    await prisma.$disconnect();
    return;
  }

  console.log(
    `[backfill] Acquiring DIMO developer JWT… (${vehicles.length} vehicles in scope)`,
  );
  const devJwt = await getDeveloperJwt();

  for (const v of vehicles) {
    const tokenId = v.dimoVehicle?.tokenId;
    if (!tokenId) {
      console.warn(
        `[backfill] Skipping vehicle ${v.id} (${v.licensePlate}) — no DIMO tokenId`,
      );
      continue;
    }

    console.log(
      `\n[backfill] ═════ Vehicle ${v.licensePlate ?? v.id} (tokenId=${tokenId}) ═════`,
    );
    const jwt = await getVehicleJwt(devJwt, tokenId);

    const trips = await prisma.vehicleTrip.findMany({
      where: {
        vehicleId: v.id,
        tripStatus: 'COMPLETED',
        endTime: { not: null },
        startTime: { gte: since },
      },
      orderBy: { startTime: 'asc' },
    });
    console.log(
      `[backfill] ${trips.length} COMPLETED trips in the last ${WINDOW_HOURS}h`,
    );

    for (const t of trips) {
      if (!t.endTime) continue;
      const tripLabel = `${t.id.slice(0, 8)} ${t.startTime.toISOString().slice(0, 16)}→${t.endTime.toISOString().slice(11, 16)}`;
      console.log(`\n[backfill]   Trip ${tripLabel}`);

      // 1) Events
      const eventsResp = await gql(jwt, buildEventsQuery(tokenId, t.startTime, t.endTime));
      const rawEvents: any[] = eventsResp?.data?.events ?? [];
      const mapped = rawEvents
        .map((e: any) => ({
          eventType: normalizeEventName(e.name ?? ''),
          recordedAt: new Date(e.timestamp),
          name: e.name,
          source: e.source ?? '',
          metadata: e.metadata ?? null,
        }))
        .filter((e) => e.eventType != null);

      const harshBraking = mapped.filter((e) => e.eventType === 'HARSH_BRAKING').length;
      const extremeBraking = mapped.filter((e) => e.eventType === 'EXTREME_BRAKING').length;
      const harshAccel = mapped.filter((e) => e.eventType === 'HARSH_ACCELERATION').length;
      const harshCorner = mapped.filter((e) => e.eventType === 'HARSH_CORNERING').length;
      const hardBraking = harshBraking + extremeBraking;

      // 2) Fuel — EV-gated (battery-electric has no ICE tank signal).
      const isEv = v.fuelType === 'ELECTRIC';
      let fuel:
        | ReturnType<typeof computeFuelSummary>
        | null = null;
      let avgL100: number | null = null;
      let fuelConfidence: string | null = null;
      if (!isEv) {
        const fuelResp = await gql(
          jwt,
          buildFuelQuery(tokenId, t.startTime, t.endTime),
        );
        fuel = computeFuelSummary(
          fuelResp?.data?.signals ?? [],
          t.startTime,
          t.endTime,
          v.tankCapacityLiters,
        );
        avgL100 =
          fuel.liters != null && t.distanceKm != null && t.distanceKm > 0
            ? (fuel.liters / t.distanceKm) * 100
            : null;
        fuelConfidence = fuel.refuel ? 'refuel_detected' : fuel.confidence;
      }

      console.log(
        `[backfill]     events: harshBrake=${harshBraking} extremeBrake=${extremeBraking} harshAccel=${harshAccel} harshCorner=${harshCorner}`,
      );
      if (isEv) {
        console.log(`[backfill]     fuel  : EV — skipped`);
      } else if (fuel) {
        console.log(
          `[backfill]     fuel  : startAbs=${fuel.startAbs ?? 'null'} endAbs=${fuel.endAbs ?? 'null'} ` +
            `startRel=${fuel.startRel ?? 'null'} endRel=${fuel.endRel ?? 'null'} ` +
            `liters=${fuel.liters ?? 'null'} avgL/100=${avgL100?.toFixed(2) ?? 'null'} ` +
            `conf=${fuelConfidence ?? 'null'} refuel=${fuel.refuel} ` +
            `absN=${fuel.absCount} relN=${fuel.relCount}`,
        );
      }

      if (DRY_RUN) continue;

      // 3) Apply updates in a transaction — mirrors the runtime service
      await prisma.$transaction(async (tx) => {
        await tx.drivingEvent.deleteMany({
          where: { tripId: t.id, source: DrivingEventSource.TELEMETRY_EVENTS },
        });

        if (mapped.length > 0) {
          await tx.drivingEvent.createMany({
            data: mapped.map((e) => {
              let counterValue: number | null = null;
              if (typeof e.metadata === 'string') {
                try {
                  const m = JSON.parse(e.metadata);
                  if (typeof m?.counterValue === 'number') counterValue = m.counterValue;
                } catch {}
              }
              return {
                vehicleId: v.id,
                organizationId: v.organizationId,
                tripId: t.id,
                eventType: e.eventType!,
                source: DrivingEventSource.TELEMETRY_EVENTS,
                recordedAt: e.recordedAt,
                speedKmh: null,
                severity: EVENT_SEVERITY[e.eventType!],
                metadataJson: {
                  hardwareSource: 'LTE_R1',
                  dimoEventName: e.name,
                  dimoEventSource: e.source,
                  dimoCounterValue: counterValue,
                  backfilledBy: 'scripts/backfill-lte-r1-events-fuel.ts',
                } as any,
              };
            }),
          });
        }

        // Conditional fuel write: don't overwrite a valid legacy value with
        // null (matches TripBehaviorEnrichmentService V4.6.46 semantics).
        const fuelLiters = isEv || !fuel || fuel.refuel ? null : fuel.liters;
        const fuelAvg = isEv || !fuel || fuel.refuel ? null : avgL100;
        await tx.vehicleTrip.update({
          where: { id: t.id },
          data: {
            hardBrakingCount: hardBraking,
            hardAccelerationCount: harshAccel,
            totalAccelerationEvents: harshAccel,
            hardAccelerationEvents: harshAccel,
            totalBrakingEvents: hardBraking,
            hardBrakingEvents: hardBraking,
            fullBrakingEvents: 0,
            corneringEvents: harshCorner,
            abuseEvents: extremeBraking, // DIMO extremeBraking counts as abuse on LTE_R1
            abuseEventCount: extremeBraking,
            speedingEvents: 0,
            harshBrakeCount: hardBraking,
            harshAccelCount: harshAccel,
            harshCornerCount: harshCorner,
            brakingEventCount: hardBraking,
            accelerationEventCount: harshAccel,
            ...(fuelLiters != null && { fuelUsedLiters: fuelLiters }),
            ...(fuelAvg != null && { avgConsumptionLPer100Km: fuelAvg }),
            fuelConfidence,
            behaviorEnrichedAt: new Date(),
          },
        });
      });

      console.log(`[backfill]     → DB updated`);
    }
  }

  await prisma.$disconnect();
  console.log(`\n[backfill] Done.${DRY_RUN ? ' (dry-run — no writes performed)' : ''}`);
}

main().catch((err) => {
  console.error(`[backfill] FAILED:`, err?.response?.data ?? err);
  process.exit(1);
});
