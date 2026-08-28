/**
 * E3A read-only historical energy-event recovery dry-run.
 * NEVER writes VehicleEnergyEvent rows.
 *
 * Usage:
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/energy-events-recovery-dry-run.ts
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/energy-events-recovery-dry-run.ts --quick
 *
 * Requires: DIMO_CLIENT_ID, DIMO_PRIVATE_KEY
 * Optional: DATABASE_URL (existing-event comparison; read-only SELECT)
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  ENERGY_EVENTS_OUTAGE_START_ISO,
  ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
  KS_MX_2024_TOKEN_ID,
  TESLA_KS_FH_660E_TOKEN_ID,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.constants';
import {
  runEnergyEventsRecoveryDryRun,
  type RecoveryVehicleInput,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-runner';
import { fetchEnergyEventSegmentsStandalone } from './energy-events-standalone-dimo-fetch';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

const QUICK_MODE = process.argv.includes('--quick');

const FLEET_FALLBACK: Array<{
  label: string;
  tokenId: number;
  powertrain: 'ICE' | 'EV';
  relativeFuel: boolean;
  absoluteFuel: boolean;
  rechargeSoc: boolean;
}> = [
  { label: 'KS MX 2024', tokenId: 187336, powertrain: 'ICE', relativeFuel: true, absoluteFuel: true, rechargeSoc: false },
  { label: 'VW Arteon ICE', tokenId: 187784, powertrain: 'ICE', relativeFuel: true, absoluteFuel: true, rechargeSoc: false },
  { label: 'Audi A4 (KS MS 661)', tokenId: 187361, powertrain: 'ICE', relativeFuel: false, absoluteFuel: true, rechargeSoc: false },
  { label: 'VW Tiguan ICE', tokenId: 192922, powertrain: 'ICE', relativeFuel: true, absoluteFuel: true, rechargeSoc: false },
  { label: 'KS FH 660E Tesla', tokenId: 186946, powertrain: 'EV', relativeFuel: false, absoluteFuel: false, rechargeSoc: true },
];

async function loadVehiclesFromDb(prisma: PrismaClient): Promise<RecoveryVehicleInput[]> {
  const outageStart = new Date(ENERGY_EVENTS_OUTAGE_START_ISO);
  const recoveryCutoff = new Date(ENERGY_EVENTS_RECOVERY_CUTOFF_ISO);

  const rows = await prisma.vehicle.findMany({
    where: { dimoVehicle: { isNot: null } },
    select: {
      id: true,
      licensePlate: true,
      vehicleName: true,
      hardwareType: true,
      dimoVehicle: { select: { tokenId: true } },
      energyEvents: {
        where: { startTime: { gte: outageStart, lt: recoveryCutoff } },
        select: {
          id: true,
          dimoSegmentId: true,
          kind: true,
          startTime: true,
          endTime: true,
          fuelDeltaLiters: true,
          fuelDeltaPercent: true,
          socDeltaPercent: true,
          energyDeltaKwh: true,
          confidence: true,
        },
      },
    },
    orderBy: { licensePlate: 'asc' },
  });

  return rows
    .filter((row) => row.dimoVehicle?.tokenId != null)
    .map((row) => {
      const tokenId = row.dimoVehicle!.tokenId!;
      const fallback = FLEET_FALLBACK.find((f) => f.tokenId === tokenId);
      return {
        vehicleId: row.id,
        label: row.licensePlate ?? row.vehicleName ?? `token-${tokenId}`,
        tokenId,
        provider: row.hardwareType ?? 'LTE_R1',
        powertrain: fallback?.powertrain ?? 'UNKNOWN',
        relativeFuelAvailable: fallback?.relativeFuel ?? false,
        absoluteFuelAvailable: fallback?.absoluteFuel ?? false,
        rechargeSocAvailable: fallback?.rechargeSoc ?? tokenId === TESLA_KS_FH_660E_TOKEN_ID,
        dimoAccessAvailable: true,
        existingEvents: row.energyEvents,
      };
    });
}

function loadFleetFallback(): RecoveryVehicleInput[] {
  return FLEET_FALLBACK.map((f) => ({
    vehicleId: `dry-run-token-${f.tokenId}`,
    label: f.label,
    tokenId: f.tokenId,
    provider: 'LTE_R1',
    powertrain: f.powertrain,
    relativeFuelAvailable: f.relativeFuel,
    absoluteFuelAvailable: f.absoluteFuel,
    rechargeSocAvailable: f.rechargeSoc,
    dimoAccessAvailable: true,
    existingEvents: [],
  }));
}

async function main() {
  if (!process.env.DIMO_CLIENT_ID || !process.env.DIMO_PRIVATE_KEY) {
    console.error('Missing DIMO_CLIENT_ID or DIMO_PRIVATE_KEY');
    process.exit(1);
  }

  let vehicles: RecoveryVehicleInput[];
  let dbComparison = false;
  let prisma: PrismaClient | null = null;

  if (process.env.DATABASE_URL) {
    prisma = new PrismaClient();
    try {
      vehicles = await loadVehiclesFromDb(prisma);
      dbComparison = true;
    } catch {
      vehicles = loadFleetFallback();
    }
  } else {
    vehicles = loadFleetFallback();
  }

  if (QUICK_MODE) {
    console.error('[dry-run] QUICK mode: KS MX canonical + Tesla Jun windows only');
  }

  const report = await runEnergyEventsRecoveryDryRun(vehicles, {
    fetchSegments: (tokenId, from, to) =>
      fetchEnergyEventSegmentsStandalone(tokenId, from, to),
    interRequestDelayMs: QUICK_MODE ? 200 : 500,
    windowsOverride: QUICK_MODE
      ? [
          { from: new Date('2026-08-22T00:00:00.000Z'), to: new Date('2026-08-24T00:00:00.000Z') },
          { from: new Date('2026-06-15T00:00:00.000Z'), to: new Date('2026-07-16T00:00:00.000Z') },
        ]
      : undefined,
  });

  const artifactDir = path.resolve(__dirname, '..', '..', '..', 'artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  const outPath = path.join(artifactDir, 'energy-events-recovery-dry-run-2026-08.json');
  const payload = {
    ...report,
    dbComparisonEnabled: dbComparison,
    mode: QUICK_MODE ? 'quick' : 'full',
    candidateCount: report.candidates.length,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

  const summaryOnly = {
    ...payload,
    candidates: payload.candidates.slice(0, 50),
    candidatesTruncated: payload.candidates.length > 50,
  };
  console.log(JSON.stringify(summaryOnly, null, 2));
  console.error(`[dry-run] Full artifact: ${outPath}`);
  console.error(`[dry-run] dbWritesPerformed=${report.dbWritesPerformed} gate=${report.backfillGate}`);

  if (prisma) await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
