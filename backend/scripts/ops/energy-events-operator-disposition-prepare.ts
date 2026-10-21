/**
 * READ-ONLY operator disposition preparation for E3A M1 / Jul-16 legacy population.
 *
 * Builds a closed-set operator mutation manifest with real production row IDs.
 * Output is PRIVATE — must not be committed to git.
 *
 * Usage (secured infra):
 *   ENERGY_EVENTS_RECOVERY_PLAN_PATH=/path/to/plan.json \
 *   npx ts-node -r tsconfig-paths/register scripts/ops/energy-events-operator-disposition-prepare.ts \
 *     --out=/tmp/e3a-operator-m1-manifest-private.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  ENERGY_EVENTS_OUTAGE_START_ISO,
  ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.constants';
import { parseEnergyEventsRecoveryPlan } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-plan';
import {
  createMutationGuardedPrismaClient,
  createPrismaRecoveryReadRepository,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-read.repository';
import { runEnergyEventsRecoveryDryRun } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-runner';
import type { EnergyVehicleEnergyClass } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.types';
import {
  buildRecoveryVehicleInput,
  type RecoveryVehicleDbLoad,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-capability';
import { createDimoRequestAccounting } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-accounting';
import {
  buildUpsertPayload,
  coalesceSegments,
  isSegmentPersistable,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events.pipeline';
import {
  buildOperatorMutationManifest,
  buildPreMutationBackupArtifact,
  type PersistedEnergyEventRow,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-operator-mutation-manifest';
import { captureEnergyEventsTableSnapshot } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-write-backfill';
import {
  fetchEnergyEventSegmentsStandalone,
  probeAvailableSignalsForTokenIds,
  probeDimoAccessForTokenIds,
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

const PLAN_PATH = process.env.ENERGY_EVENTS_RECOVERY_PLAN_PATH?.trim();
const OUTPUT_PATH =
  process.argv.find((arg) => arg.startsWith('--out='))?.slice('--out='.length) ??
  '/tmp/e3a-operator-m1-manifest-private.json';
const BACKUP_PATH =
  process.argv.find((arg) => arg.startsWith('--backup-out='))?.slice('--backup-out='.length) ??
  '/tmp/e3a-operator-m1-pre-mutation-backup-private.json';

function classifyRecoveryVehicleEnergyClass(vehicle: {
  relativeFuelAvailable: boolean;
  absoluteFuelAvailable: boolean;
  rechargeSocAvailable: boolean;
}): EnergyVehicleEnergyClass {
  const refuel = vehicle.relativeFuelAvailable || vehicle.absoluteFuelAvailable;
  const recharge = vehicle.rechargeSocAvailable;
  if (refuel && recharge) return 'BOTH';
  if (refuel) return 'REFUEL_CANDIDATE';
  if (recharge) return 'RECHARGE_CANDIDATE';
  return 'NO_ENERGY_SIGNAL';
}

async function main() {
  const rawPrisma = new PrismaClient();
  const prisma = createMutationGuardedPrismaClient(rawPrisma);
  const readRepo = createPrismaRecoveryReadRepository(rawPrisma);
  const accounting = createDimoRequestAccounting();

  const recoveryPlan = PLAN_PATH
    ? parseEnergyEventsRecoveryPlan(JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8')))
    : undefined;

  const outageStart = new Date(ENERGY_EVENTS_OUTAGE_START_ISO);
  const recoveryCutoff = new Date(ENERGY_EVENTS_RECOVERY_CUTOFF_ISO);
  const rows: RecoveryVehicleDbLoad[] = await readRepo.loadRecoveryVehicleDbRows({
    outageStart,
    recoveryCutoff,
  });
  const tokenIds = rows.map((row) => row.tokenId);
  const dimoAccessByTokenId = await probeDimoAccessForTokenIds(tokenIds, accounting);
  const accessibleTokenIds = tokenIds.filter((tokenId) => dimoAccessByTokenId[tokenId]);
  const availableSignalsByTokenId = await probeAvailableSignalsForTokenIds(
    accessibleTokenIds,
    accounting,
  );

  const vehicles = rows.map((row: RecoveryVehicleDbLoad) =>
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

  const m1Candidate = report.candidates.find(
    (candidate) =>
      candidate.classification === 'MANUAL_REVIEW_REQUIRED' &&
      candidate.mechanism === 'recharge' &&
      candidate.manualReviewReasons.includes('existing_db_overlap_different_id') &&
      candidate.durationSeconds > 20000,
  );

  if (!m1Candidate) {
    throw new Error('M1 manual-review recharge candidate not found in recovery dry-run');
  }

  const vehicle = vehicles.find(
    (entry: (typeof vehicles)[number]) => entry.vehicleId === m1Candidate.vehicleId,
  );
  if (!vehicle) {
    throw new Error(`Vehicle not found for M1 candidate ${m1Candidate.vehicleId}`);
  }

  const windowFetch = await fetchEnergyEventSegmentsStandalone(
    m1Candidate.tokenId,
    new Date(m1Candidate.windowFrom),
    new Date(m1Candidate.windowTo),
    classifyRecoveryVehicleEnergyClass(vehicle),
  );
  const persistable = windowFetch.segments.filter(isSegmentPersistable);
  const groups = coalesceSegments(persistable);
  const group =
    groups.find((entry) => entry.coalescedSegmentId === m1Candidate.dimoSegmentId) ??
  null;
  if (!group) {
    throw new Error(`Canonical detector group not found for M1 ${m1Candidate.dimoSegmentId}`);
  }
  const payload = buildUpsertPayload(m1Candidate.vehicleId, group);

  const rechargeRows = await rawPrisma.vehicleEnergyEvent.findMany({
    where: {
      vehicleId: m1Candidate.vehicleId,
      kind: 'RECHARGE',
      startTime: { gte: outageStart, lt: recoveryCutoff },
    },
    orderBy: { startTime: 'asc' },
  });

  const aliasByRowId = new Map<string, string>();
  rechargeRows.forEach((row, index) => {
    aliasByRowId.set(row.id, `ROW${index + 1}`);
  });

  const snapshot = await captureEnergyEventsTableSnapshot(rawPrisma);
  const manifest = buildOperatorMutationManifest({
    reviewProvenance: 'e3a-m1-jul16-operator-disposition-preparation-2026-08-28',
    forensicClosureReference: 'ENERGY_EVENTS_E3A_OBSERVABILITY_RECOVERY_DRY_RUN_2026-08.md#13',
    preMutationSnapshot: snapshot,
    m1DetectorPayload: {
      dimoSegmentId: payload.dimoSegmentId,
      vehicleId: m1Candidate.vehicleId,
      mechanism: 'recharge',
      startTime: payload.startTime,
      endTime: payload.endTime,
      durationSeconds: payload.durationSeconds,
      socDeltaPercent: payload.socDeltaPercent,
      energyDeltaKwh: payload.energyDeltaKwh,
      fuelDeltaLiters: payload.fuelDeltaLiters,
      odometerStartKm: payload.odometerStartKm,
      odometerEndKm: payload.odometerEndKm,
      confidence: payload.confidence,
      coalescedFromSegmentIds: group.coalescedFromSegmentIds,
      rawDetectionMeta: payload.rawDetectionMeta,
    },
    vehicleRechargeRows: rechargeRows as PersistedEnergyEventRow[],
    aliasByRowId,
  });

  const rowsById = new Map(rechargeRows.map((row) => [row.id, row as PersistedEnergyEventRow]));
  const backup = buildPreMutationBackupArtifact(manifest, rowsById);

  const output = {
    mutationGuard: 'vehicleEnergyEvent writes blocked',
    dryRunSummary: report.summary,
    gateBlockers: report.gateBlockers,
    manifest,
    populationProof: {
      totalVehicleRechargeRowsInOutageWindow: rechargeRows.length,
      overlappingButExcludedCount: manifest.excludedFromPrune.length,
      explicitPruneCount: manifest.explicitOperatorAuthorizedPrunes.length,
      independentSessionsPreserved: rechargeRows
        .filter(
          (row) =>
            !manifest.explicitOperatorAuthorizedPrunes.some(
              (prune) => prune.rowId === row.id,
            ) &&
            !manifest.excludedFromPrune.some((excluded) => excluded.rowId === row.id) &&
            row.dimoSegmentId !== manifest.m1.dimoSegmentId,
        )
        .map((row) => ({
          rowId: row.id,
          dimoSegmentId: row.dimoSegmentId,
          startTime: row.startTime.toISOString(),
          durationSeconds: row.durationSeconds,
        })),
    },
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  fs.writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2));

  console.log(
    JSON.stringify(
      {
        outputPath: OUTPUT_PATH,
        backupPath: BACKUP_PATH,
        preMutationRowCount: snapshot.totalRows,
        m1DimoSegmentId: manifest.m1.dimoSegmentId,
        explicitPruneCount: manifest.explicitOperatorAuthorizedPrunes.length,
        excludedOverlapCount: manifest.excludedFromPrune.length,
        expectedFinalRowCount: manifest.expectedPostMutation.expectedFinalRowCount,
        gateBlockers: report.gateBlockers,
      },
      null,
      2,
    ),
  );

  await rawPrisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
