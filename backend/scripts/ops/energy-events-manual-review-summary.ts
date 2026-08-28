import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import {
  ENERGY_EVENTS_OUTAGE_START_ISO,
  ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.constants';
import { buildRecoveryVehicleInput } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-capability';
import { parseEnergyEventsRecoveryPlan } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-plan';
import { createPrismaRecoveryReadRepository } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-read.repository';
import { runEnergyEventsRecoveryDryRun } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-runner';
import { createDimoRequestAccounting } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-accounting';
import {
  fetchEnergyEventSegmentsStandalone,
  probeAvailableSignalsForTokenIds,
  probeDimoAccessForTokenIds,
} from './energy-events-standalone-dimo-fetch';

const PLAN_PATH = process.env.ENERGY_EVENTS_RECOVERY_PLAN_PATH?.trim();

async function main() {
  const recoveryPlan = parseEnergyEventsRecoveryPlan(
    JSON.parse(fs.readFileSync(PLAN_PATH!, 'utf8')),
  );
  const prisma = new PrismaClient();
  const repository = createPrismaRecoveryReadRepository(prisma);
  const outageStart = new Date(ENERGY_EVENTS_OUTAGE_START_ISO);
  const recoveryCutoff = new Date(ENERGY_EVENTS_RECOVERY_CUTOFF_ISO);
  const rows = await repository.loadRecoveryVehicleDbRows({ outageStart, recoveryCutoff });
  const accounting = createDimoRequestAccounting();
  const tokenIds = rows.map((row) => row.tokenId);
  const dimoAccessByTokenId = await probeDimoAccessForTokenIds(tokenIds, accounting);
  const accessibleTokenIds = tokenIds.filter((tokenId) => dimoAccessByTokenId[tokenId]);
  const availableSignalsByTokenId = await probeAvailableSignalsForTokenIds(
    accessibleTokenIds,
    accounting,
  );
  const vehicles = rows.map((row) =>
    buildRecoveryVehicleInput(
      { ...row, dimoAccessAvailable: dimoAccessByTokenId[row.tokenId] ?? false },
      availableSignalsByTokenId[row.tokenId] ?? null,
      'full',
    ),
  );
  const report = await runEnergyEventsRecoveryDryRun(vehicles, {
    fetchSegments: (tokenId, from, to, energyClass) =>
      fetchEnergyEventSegmentsStandalone(tokenId, from, to, energyClass),
    interRequestDelayMs: 500,
    mode: 'full',
    dbComparisonEnabled: true,
    dbComparisonStatus: 'ok',
    recoveryPlan,
  });

  const needs = report.manualReviewReport.filter(
    (entry) => entry.recommendation === 'NEEDS_FURTHER_EVIDENCE',
  );
  const exclude = report.manualReviewReport.filter(
    (entry) => entry.recommendation === 'EXCLUDE_FROM_BACKFILL',
  );

  console.log(
    JSON.stringify(
      {
        needsCount: needs.length,
        excludeCount: exclude.length,
        needsProfiles: needs.map((entry) => ({
          mechanism: entry.mechanism,
          month: entry.month,
          durationBucket: entry.durationBucket,
          fuelDeltaBucket: entry.fuelDeltaBucket,
          confidence: entry.confidence,
          plausibilityReasons: entry.plausibilityReasons,
        })),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
