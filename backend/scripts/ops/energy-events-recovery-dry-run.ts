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
 *
 * Artifacts written to artifacts/ are sanitized for git. Raw FULL DB preview reports
 * (with operational identifiers) must be retained only on secured infrastructure.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  ENERGY_EVENTS_OUTAGE_START_ISO,
  ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
  FULL_SANITIZED_SUMMARY_ARTIFACT_FILENAME,
  QUICK_ACCEPTANCE_WINDOWS,
  QUICK_ARTIFACT_FILENAME,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.constants';
import {
  buildSanitizedFullSummaryArtifact,
  buildSanitizedQuickArtifact,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-artifact-sanitize';
import {
  runEnergyEventsRecoveryDryRun,
  type RecoveryVehicleInput,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-runner';
import {
  buildFleetFallbackVehicles,
  createMutationGuardedPrismaClient,
  createPrismaRecoveryReadRepository,
  mergeAuditedFleetIntoDbVehicles,
  type DbComparisonStatus,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-read.repository';
import {
  fetchEnergyEventSegmentsStandalone,
  probeDimoAccessForTokenIds,
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
    const dimoAccessByTokenId = await probeDimoAccessForTokenIds(
      vehicles.map((vehicle) => vehicle.tokenId),
    );
    const merged = mergeAuditedFleetIntoDbVehicles(vehicles, dimoAccessByTokenId, true);
    await prisma.$disconnect();
    return {
      vehicles: merged,
      dbComparisonEnabled: true,
      dbComparisonStatus: 'ok',
    };
  } catch {
    await prisma.$disconnect();
    const dimoAccessByTokenId = await probeFleetDimoAccess();
    return {
      vehicles: buildFleetFallbackVehicles(dimoAccessByTokenId),
      dbComparisonEnabled: false,
      dbComparisonStatus: 'DB_COMPARISON_UNAVAILABLE',
    };
  }
}

async function main() {
  if (!process.env.DIMO_CLIENT_ID || !process.env.DIMO_PRIVATE_KEY) {
    console.error('Missing DIMO_CLIENT_ID or DIMO_PRIVATE_KEY');
    process.exit(1);
  }

  const { vehicles, dbComparisonEnabled, dbComparisonStatus } = await loadVehiclesForMode();

  if (QUICK_MODE) {
    console.error('[dry-run] QUICK mode: bounded <=24h acceptance windows only');
  } else if (!dbComparisonEnabled) {
    console.error('[dry-run] FULL mode without DB comparison — gate will be NOT READY');
  }

  const quickWindows = QUICK_ACCEPTANCE_WINDOWS.map((window) => ({
    from: new Date(window.from),
    to: new Date(window.to),
  }));

  const report = await runEnergyEventsRecoveryDryRun(vehicles, {
    fetchSegments: (tokenId, from, to, energyClass) =>
      fetchEnergyEventSegmentsStandalone(tokenId, from, to, energyClass),
    interRequestDelayMs: QUICK_MODE ? 200 : 500,
    windowsOverride: QUICK_MODE ? quickWindows : undefined,
    mode: QUICK_MODE ? 'quick' : 'full',
    dbComparisonEnabled,
    dbComparisonStatus,
  });

  const artifactDir = path.resolve(__dirname, '..', '..', '..', 'artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  const artifactFilename = QUICK_MODE
    ? QUICK_ARTIFACT_FILENAME
    : FULL_SANITIZED_SUMMARY_ARTIFACT_FILENAME;
  const outPath = path.join(artifactDir, artifactFilename);
  const payload = QUICK_MODE
    ? buildSanitizedQuickArtifact(report)
    : buildSanitizedFullSummaryArtifact(report);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

  console.log(JSON.stringify(payload, null, 2));
  console.error(`[dry-run] Sanitized artifact: ${outPath}`);
  console.error(
    `[dry-run] dbComparisonEnabled=${report.dbComparisonEnabled} dbComparisonStatus=${report.dbComparisonStatus} telemetryRequests=${report.requestAccounting.telemetryGraphqlRequests} gate=${report.backfillGate}`,
  );
  if (!QUICK_MODE) {
    console.error(
      '[dry-run] Raw FULL DB preview reports are not written to git; retain them only on secured operational storage.',
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
