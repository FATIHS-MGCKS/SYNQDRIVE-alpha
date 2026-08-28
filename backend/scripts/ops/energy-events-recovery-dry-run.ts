/**
 * E3A read-only historical energy-event recovery dry-run.
 * NEVER writes VehicleEnergyEvent rows.
 *
 * Usage:
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/energy-events-recovery-dry-run.ts
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/energy-events-recovery-dry-run.ts --quick
 *
 * Requires: DIMO_CLIENT_ID, DIMO_PRIVATE_KEY
 * Full mode requires: DATABASE_URL (read-only comparison; fails closed without it)
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  ENERGY_EVENTS_OUTAGE_START_ISO,
  ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.constants';
import {
  runEnergyEventsRecoveryDryRun,
  type RecoveryVehicleInput,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-runner';
import {
  buildFleetFallbackVehicles,
  createMutationGuardedPrismaClient,
  createPrismaRecoveryReadRepository,
  type DbComparisonStatus,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-read.repository';
import {
  fetchEnergyEventSegmentsStandalone,
  probeFleetDimoAccess,
} from './energy-events-standalone-dimo-fetch';

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

function sanitizeCandidate(candidate: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...candidate };
  if (typeof copy.startLatitude === 'number') {
    copy.startLatitude = Number(copy.startLatitude.toFixed(3));
  }
  if (typeof copy.startLongitude === 'number') {
    copy.startLongitude = Number(copy.startLongitude.toFixed(3));
  }
  return copy;
}

async function loadVehiclesForMode(): Promise<{
  vehicles: RecoveryVehicleInput[];
  dbComparisonEnabled: boolean;
  dbComparisonStatus: DbComparisonStatus;
}> {
  const outageStart = new Date(ENERGY_EVENTS_OUTAGE_START_ISO);
  const recoveryCutoff = new Date(ENERGY_EVENTS_RECOVERY_CUTOFF_ISO);

  if (QUICK_MODE) {
    const dimoAccessByTokenId = await probeFleetDimoAccess();
    return {
      vehicles: buildFleetFallbackVehicles(dimoAccessByTokenId),
      dbComparisonEnabled: false,
      dbComparisonStatus: 'DB_COMPARISON_UNAVAILABLE',
    };
  }

  if (!process.env.DATABASE_URL) {
    const dimoAccessByTokenId = await probeFleetDimoAccess();
    return {
      vehicles: buildFleetFallbackVehicles(dimoAccessByTokenId),
      dbComparisonEnabled: false,
      dbComparisonStatus: 'DB_COMPARISON_UNAVAILABLE',
    };
  }

  const prisma = createMutationGuardedPrismaClient(new PrismaClient());
  const repository = createPrismaRecoveryReadRepository(prisma);
  try {
    const vehicles = await repository.loadVehiclesForRecovery({
      outageStart,
      recoveryCutoff,
    });
    const dimoAccessByTokenId = await probeFleetDimoAccess();
    const merged = mergeAuditedFleetIntoDbVehicles(vehicles, dimoAccessByTokenId);
    await prisma.$disconnect();
    return {
      vehicles: merged,
      dbComparisonEnabled: true,
      dbComparisonStatus: 'ok',
    };
  } catch (error) {
    await prisma.$disconnect();
    const dimoAccessByTokenId = await probeFleetDimoAccess();
    return {
      vehicles: buildFleetFallbackVehicles(dimoAccessByTokenId),
      dbComparisonEnabled: false,
      dbComparisonStatus: 'DB_COMPARISON_UNAVAILABLE',
    };
  }
}

function mergeAuditedFleetIntoDbVehicles(
  dbVehicles: RecoveryVehicleInput[],
  dimoAccessByTokenId: Record<number, boolean>,
): RecoveryVehicleInput[] {
  const byToken = new Map(dbVehicles.map((vehicle) => [vehicle.tokenId, vehicle]));
  const fallback = buildFleetFallbackVehicles(dimoAccessByTokenId);
  for (const vehicle of fallback) {
    const existing = byToken.get(vehicle.tokenId);
    if (existing) {
      existing.dimoAccessAvailable = dimoAccessByTokenId[vehicle.tokenId] ?? false;
      existing.relativeFuelAvailable = vehicle.relativeFuelAvailable;
      existing.absoluteFuelAvailable = vehicle.absoluteFuelAvailable;
      existing.rechargeSocAvailable = vehicle.rechargeSocAvailable;
      existing.powertrain = vehicle.powertrain;
      continue;
    }
    byToken.set(vehicle.tokenId, vehicle);
  }
  return [...byToken.values()].sort((a, b) => a.label.localeCompare(b.label));
}

async function main() {
  if (!process.env.DIMO_CLIENT_ID || !process.env.DIMO_PRIVATE_KEY) {
    console.error('Missing DIMO_CLIENT_ID or DIMO_PRIVATE_KEY');
    process.exit(1);
  }

  const { vehicles, dbComparisonEnabled, dbComparisonStatus } = await loadVehiclesForMode();

  if (QUICK_MODE) {
    console.error('[dry-run] QUICK mode: KS MX canonical + Tesla Jun windows only');
  } else if (!dbComparisonEnabled) {
    console.error('[dry-run] FULL mode without DB comparison — gate will be NOT READY');
  }

  const report = await runEnergyEventsRecoveryDryRun(vehicles, {
    fetchSegments: (tokenId, from, to, energyClass) =>
      fetchEnergyEventSegmentsStandalone(tokenId, from, to, energyClass),
    interRequestDelayMs: QUICK_MODE ? 200 : 500,
    windowsOverride: QUICK_MODE
      ? [
          { from: new Date('2026-08-22T00:00:00.000Z'), to: new Date('2026-08-24T00:00:00.000Z') },
          { from: new Date('2026-06-15T00:00:00.000Z'), to: new Date('2026-07-16T00:00:00.000Z') },
        ]
      : undefined,
    mode: QUICK_MODE ? 'quick' : 'full',
    dbComparisonEnabled,
    dbComparisonStatus,
  });

  const artifactDir = path.resolve(__dirname, '..', '..', '..', 'artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  const outPath = path.join(artifactDir, 'energy-events-recovery-dry-run-2026-08.json');
  const payload = {
    ...report,
    candidates: report.candidates.map((candidate) =>
      sanitizeCandidate(candidate as unknown as Record<string, unknown>),
    ),
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
  console.error(
    `[dry-run] dbComparisonEnabled=${report.dbComparisonEnabled} dbComparisonStatus=${report.dbComparisonStatus} telemetryRequests=${report.requestAccounting.telemetryGraphqlRequests} gate=${report.backfillGate}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
