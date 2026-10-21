/**
 * Secured read-only pre-completion diagnostic for E3A controlled write-backfill.
 * Prints sanitized aggregates only — no production identifiers.
 */
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
import { captureEnergyEventsTableSnapshot } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-write-backfill';
import { createDimoRequestAccounting } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-accounting';
import {
  fetchEnergyEventSegmentsStandalone,
  probeAvailableSignalsForTokenIds,
  probeDimoAccessForTokenIds,
} from './energy-events-standalone-dimo-fetch';

{
  const envPath = require('path').resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

const PLAN_PATH = process.env.ENERGY_EVENTS_RECOVERY_PLAN_PATH?.trim();

async function main() {
  if (!process.env.DATABASE_URL || !PLAN_PATH) {
    throw new Error('DATABASE_URL and ENERGY_EVENTS_RECOVERY_PLAN_PATH required');
  }

  const recoveryPlan = parseEnergyEventsRecoveryPlan(
    JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8')),
  );
  const prisma = new PrismaClient();
  const snapshot = await captureEnergyEventsTableSnapshot(prisma);
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

  const pending = report.candidates.filter(
    (candidate) =>
      candidate.classification === 'WOULD_CREATE' ||
      candidate.classification === 'WOULD_UPDATE',
  );

  const payload = {
    snapshot,
    summary: report.summary,
    gateBlockers: report.gateBlockers,
    legacySubsegmentsWouldReplace: report.legacySubsegmentsWouldReplace.length,
    recoveryPlan: report.recoveryPlan,
    pendingWriteCount: pending.length,
    pendingByMechanism: pending.reduce<Record<string, number>>((acc, candidate) => {
      const key = `${candidate.mechanism}_${candidate.classification}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    pendingProfiles: pending.map((candidate) => ({
      mechanism: candidate.mechanism,
      classification: candidate.classification,
      coalescedFromCount: candidate.coalescedFromSegmentIds.length,
      socDeltaPercent: candidate.socDeltaPercent,
      energyDeltaKwh: candidate.energyDeltaKwh,
      fuelDeltaLiters: candidate.fuelDeltaLiters,
      durationSeconds: candidate.durationSeconds,
      hasExistingRow: Boolean(candidate.existingRowId),
      windowMonth: candidate.startTime.slice(0, 7),
    })),
    canonicalRefuel: report.acceptance.canonicalRefuel,
    canonicalEvRecharge: report.acceptance.canonicalEvRecharge,
  };

  console.log(JSON.stringify(payload, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
