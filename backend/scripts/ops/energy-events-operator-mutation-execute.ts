/**
 * E3A Option B — explicit operator-authorized M1 CREATE + closed-set 16-ID DELETE.
 *
 * Requires a verified manifest + backup from energy-events-operator-disposition-prepare.ts.
 * Pass --apply to execute; omit for preflight-only.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  ENERGY_EVENTS_OUTAGE_START_ISO,
  ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.constants';
import {
  buildUpsertPayload,
  coalesceSegments,
  isSegmentPersistable,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events.pipeline';
import type { OperatorMutationManifest } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-operator-mutation-manifest';
import {
  validatePostMutationInvariants,
  validatePreMutationInvariants,
  type PersistedEnergyEventRow,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-operator-mutation-manifest';
import { captureEnergyEventsTableSnapshot } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-write-backfill';
import {
  fetchEnergyEventSegmentsStandalone,
  probeAvailableSignalsForTokenIds,
  probeDimoAccessForTokenIds,
} from './energy-events-standalone-dimo-fetch';
import { createPrismaRecoveryReadRepository } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-read.repository';
import {
  buildRecoveryVehicleInput,
  type RecoveryVehicleDbLoad,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-capability';
import { runEnergyEventsRecoveryDryRun } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-runner';
import type { EnergyVehicleEnergyClass } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.types';
import { createDimoRequestAccounting } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-accounting';
import { parseEnergyEventsRecoveryPlan } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-plan';
import { createHash } from 'crypto';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

const MANIFEST_PATH =
  process.argv.find((arg) => arg.startsWith('--manifest='))?.slice('--manifest='.length) ??
  '/tmp/e3a-operator-m1-manifest-post-deploy-latest.json';
const BACKUP_PATH =
  process.argv.find((arg) => arg.startsWith('--backup='))?.slice('--backup='.length) ??
  '/tmp/e3a-operator-m1-pre-mutation-backup-post-deploy-latest.json';
const OUTPUT_PATH =
  process.argv.find((arg) => arg.startsWith('--out='))?.slice('--out='.length) ??
  '/tmp/e3a-operator-mutation-execute-result.json';
const APPLY = process.argv.includes('--apply');

const REQUIRED_BACKUP_FIELDS = [
  'id',
  'vehicleId',
  'dimoSegmentId',
  'kind',
  'detectionMechanism',
  'startTime',
  'endTime',
  'durationSeconds',
  'confidence',
  'rawDetectionMeta',
] as const;

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

function loadManifestWrap(): {
  manifest: OperatorMutationManifest;
  independentSessionIds: string[];
} {
  const wrap = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const manifest = (wrap.manifest ?? wrap) as OperatorMutationManifest;
  const independentSessionIds = (
    wrap.populationProof?.independentSessionsPreserved ?? []
  ).map((row: { rowId: string }) => row.rowId);
  return { manifest, independentSessionIds };
}

function computeScopedDigest(rows: PersistedEnergyEventRow[]): string {
  return createHash('sha256')
    .update(
      rows
        .map((row) => `${row.id}|${row.dimoSegmentId}|${row.updatedAt?.toISOString() ?? ''}`)
        .sort()
        .join('\n'),
    )
    .digest('hex');
}

function verifyBackup(
  manifest: OperatorMutationManifest,
  backupPath: string,
): string[] {
  const errors: string[] = [];
  if (!fs.existsSync(backupPath)) {
    return ['backup file missing'];
  }
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const rows = backup.rows as Array<Record<string, unknown>>;
  if (!Array.isArray(rows) || rows.length !== 16) {
    errors.push(`backup row count expected 16 got ${rows?.length ?? 0}`);
    return errors;
  }
  const backupIds = new Set(rows.map((row) => String(row.id)));
  for (const id of manifest.invariants.expectedLegacyPruneRowIds) {
    if (!backupIds.has(id)) {
      errors.push(`backup missing prune id ${id}`);
    }
  }
  for (const row of rows) {
    for (const field of REQUIRED_BACKUP_FIELDS) {
      if (row[field] === undefined) {
        errors.push(`backup row ${row.id} missing field ${field}`);
      }
    }
  }
  return errors;
}

async function resolveM1Payload(prisma: PrismaClient, manifest: OperatorMutationManifest) {
  const planPath = process.env.ENERGY_EVENTS_RECOVERY_PLAN_PATH?.trim();
  const recoveryPlan = planPath
    ? parseEnergyEventsRecoveryPlan(JSON.parse(fs.readFileSync(planPath, 'utf8')))
    : undefined;
  const outageStart = new Date(ENERGY_EVENTS_OUTAGE_START_ISO);
  const recoveryCutoff = new Date(ENERGY_EVENTS_RECOVERY_CUTOFF_ISO);
  const readRepo = createPrismaRecoveryReadRepository(prisma);
  const rows: RecoveryVehicleDbLoad[] = await readRepo.loadRecoveryVehicleDbRows({
    outageStart,
    recoveryCutoff,
  });
  const accounting = createDimoRequestAccounting();
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
      candidate.durationSeconds > 20000 &&
      candidate.dimoSegmentId === manifest.m1.dimoSegmentId,
  );
  if (!m1Candidate) {
    throw new Error('M1 candidate not found or dimoSegmentId mismatch');
  }
  const vehicle = vehicles.find((entry) => entry.vehicleId === m1Candidate.vehicleId);
  if (!vehicle) {
    throw new Error('Vehicle not found for M1');
  }
  const windowFetch = await fetchEnergyEventSegmentsStandalone(
    m1Candidate.tokenId,
    new Date(m1Candidate.windowFrom),
    new Date(m1Candidate.windowTo),
    classifyRecoveryVehicleEnergyClass(vehicle),
  );
  const persistable = windowFetch.segments.filter(isSegmentPersistable);
  const groups = coalesceSegments(persistable);
  const group = groups.find(
    (entry) => entry.coalescedSegmentId === manifest.m1.dimoSegmentId,
  );
  if (!group) {
    throw new Error('Canonical M1 detector group not found');
  }
  return buildUpsertPayload(m1Candidate.vehicleId, group);
}

function fingerprintMatchesPayload(
  manifest: OperatorMutationManifest,
  payload: ReturnType<typeof buildUpsertPayload>,
): string[] {
  const errors: string[] = [];
  const fp = manifest.m1.fingerprint;
  if (!fp) return ['missing M1 fingerprint in manifest'];
  const checks: Array<[string, unknown, unknown]> = [
    ['dimoSegmentId', fp.dimoSegmentId, payload.dimoSegmentId],
    ['durationSeconds', fp.durationSeconds, payload.durationSeconds],
    ['socDeltaPercent', fp.socDeltaPercent, payload.socDeltaPercent],
    ['energyDeltaKwh', fp.energyDeltaKwh, payload.energyDeltaKwh],
    ['confidence', fp.confidence, payload.confidence],
  ];
  for (const [field, expected, actual] of checks) {
    if (expected !== actual) {
      errors.push(`M1 payload ${field} mismatch expected=${expected} actual=${actual}`);
    }
  }
  return errors;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL required');
  }

  const { manifest, independentSessionIds } = loadManifestWrap();
  const prisma = new PrismaClient();
  const result: Record<string, unknown> = {
    applyRequested: APPLY,
    preMutationTimestamp: new Date().toISOString(),
    manifestPath: MANIFEST_PATH,
    backupPath: BACKUP_PATH,
    transactionStarted: false,
    transactionCommitted: false,
    transactionRolledBack: false,
    m1RowsCreated: 0,
    legacyRowsDeleted: 0,
  };

  try {
    const backupErrors = verifyBackup(manifest, BACKUP_PATH);
    result.backupVerified = backupErrors.length === 0 ? 'PASS' : 'FAIL';
    result.backupErrors = backupErrors;
    if (backupErrors.length > 0) {
      throw new Error(`Backup verification failed: ${backupErrors.join('; ')}`);
    }

    const preSnapshot = await captureEnergyEventsTableSnapshot(prisma);
    result.preMutationRowCount = preSnapshot.totalRows;
    result.preMutationTableDigest = preSnapshot.tableDigest;
    result.preMutationScopedDigest = manifest.invariants.preMutationScopedDigest;

    const allRows = await prisma.vehicleEnergyEvent.findMany();
    const rowsById = new Map(allRows.map((row) => [row.id, row as PersistedEnergyEventRow]));
    const m1Present = allRows.some(
      (row) => row.dimoSegmentId === manifest.m1.dimoSegmentId,
    );

    const invariantViolations = validatePreMutationInvariants(
      manifest,
      rowsById,
      preSnapshot,
      m1Present,
    );
    result.preMutationInvariantViolations = invariantViolations;
    result.preMutationInvariants = invariantViolations.length === 0 ? 'PASS' : 'FAIL';
    if (invariantViolations.length > 0) {
      throw new Error(
        `Pre-mutation invariants failed: ${JSON.stringify(invariantViolations)}`,
      );
    }

    const scopedRows = await prisma.vehicleEnergyEvent.findMany({
      where: {
        id: {
          in: [
            ...manifest.invariants.expectedLegacyPruneRowIds,
            ...manifest.invariants.expectedExcludedOverlapRowIds,
          ],
        },
      },
    });
    const scopedDigest = computeScopedDigest(scopedRows as PersistedEnergyEventRow[]);
    result.scopedDigestVerified =
      scopedDigest === manifest.invariants.preMutationScopedDigest ? 'PASS' : 'FAIL';
    result.scopedDigestActual = scopedDigest;
    if (scopedDigest !== manifest.invariants.preMutationScopedDigest) {
      throw new Error(
        `Scoped digest mismatch expected=${manifest.invariants.preMutationScopedDigest} actual=${scopedDigest}`,
      );
    }

    for (const preservedId of independentSessionIds) {
      if (manifest.invariants.expectedLegacyPruneRowIds.includes(preservedId)) {
        throw new Error(`Independent session ${preservedId} is in prune set`);
      }
    }

    const m1Payload = await resolveM1Payload(prisma, manifest);
    const payloadErrors = fingerprintMatchesPayload(manifest, m1Payload);
    result.m1PayloadVerified = payloadErrors.length === 0 ? 'PASS' : 'FAIL';
    result.m1PayloadErrors = payloadErrors;
    if (payloadErrors.length > 0) {
      throw new Error(`M1 payload verification failed: ${payloadErrors.join('; ')}`);
    }

    const excludedTailId = manifest.invariants.expectedExcludedOverlapRowIds[0];
    result.excludedTailId = excludedTailId;
    result.preservedIndependentSessionIds = independentSessionIds;

    if (!APPLY) {
      result.status = 'PREFLIGHT_OK';
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const pruneIds = [...manifest.invariants.expectedLegacyPruneRowIds];
    const preCount = preSnapshot.totalRows;
    result.transactionStarted = true;

    const txOutcome = await prisma.$transaction(async (tx) => {
      const existingM1 = await tx.vehicleEnergyEvent.findUnique({
        where: { dimoSegmentId: m1Payload.dimoSegmentId },
      });
      if (existingM1) {
        throw new Error('M1 already present inside transaction');
      }

      const created = await tx.vehicleEnergyEvent.create({
        data: {
          vehicleId: m1Payload.vehicleId,
          dimoSegmentId: m1Payload.dimoSegmentId,
          kind: m1Payload.kind,
          detectionMechanism: m1Payload.detectionMechanism,
          startTime: m1Payload.startTime,
          endTime: m1Payload.endTime,
          durationSeconds: m1Payload.durationSeconds,
          startLatitude: m1Payload.startLatitude,
          startLongitude: m1Payload.startLongitude,
          endLatitude: m1Payload.endLatitude,
          endLongitude: m1Payload.endLongitude,
          fuelDeltaLiters: m1Payload.fuelDeltaLiters,
          fuelDeltaPercent: m1Payload.fuelDeltaPercent,
          socDeltaPercent: m1Payload.socDeltaPercent,
          energyDeltaKwh: m1Payload.energyDeltaKwh,
          odometerStartKm: m1Payload.odometerStartKm,
          odometerEndKm: m1Payload.odometerEndKm,
          confidence: m1Payload.confidence,
          rawDetectionMeta: m1Payload.rawDetectionMeta as object,
        },
      });

      const m1Count = await tx.vehicleEnergyEvent.count({
        where: { dimoSegmentId: m1Payload.dimoSegmentId },
      });
      if (m1Count !== 1) {
        throw new Error(`Expected exactly 1 M1 row, found ${m1Count}`);
      }

      const deleteResult = await tx.vehicleEnergyEvent.deleteMany({
        where: { id: { in: pruneIds } },
      });
      if (deleteResult.count !== 16) {
        throw new Error(`Expected delete count 16, got ${deleteResult.count}`);
      }

      for (const pruneId of pruneIds) {
        const stillThere = await tx.vehicleEnergyEvent.findUnique({ where: { id: pruneId } });
        if (stillThere) {
          throw new Error(`Prune row still present after delete: ${pruneId}`);
        }
      }

      if (excludedTailId) {
        const tail = await tx.vehicleEnergyEvent.findUnique({ where: { id: excludedTailId } });
        if (!tail) {
          throw new Error('Excluded overlap tail missing after mutation');
        }
      }

      for (const preservedId of independentSessionIds) {
        const preserved = await tx.vehicleEnergyEvent.findUnique({ where: { id: preservedId } });
        if (!preserved) {
          throw new Error(`Preserved independent session missing: ${preservedId}`);
        }
      }

      return { createdId: created.id, deletedCount: deleteResult.count, preCount };
    });

    result.transactionCommitted = true;
    result.m1RowsCreated = 1;
    result.m1CreatedRowId = txOutcome.createdId;
    result.legacyRowsDeleted = txOutcome.deletedCount;

    const postSnapshot = await captureEnergyEventsTableSnapshot(prisma);
    const postRows = await prisma.vehicleEnergyEvent.findMany();
    const postRowsById = new Map(
      postRows.map((row) => [row.id, row as PersistedEnergyEventRow]),
    );
    result.postMutationRowCount = postSnapshot.totalRows;
    result.expectedPostMutationRowCount = txOutcome.preCount + 1 - 16;
    result.postMutationTableDigest = postSnapshot.tableDigest;

    const postViolations = validatePostMutationInvariants(
      manifest,
      postRowsById,
      postSnapshot,
    );
    result.postMutationInvariantViolations = postViolations;
    result.postMutationInvariants = postViolations.length === 0 ? 'PASS' : 'FAIL';

    const m1PresentPost = postRows.filter(
      (row) => row.dimoSegmentId === manifest.m1.dimoSegmentId,
    );
    result.m1PresentCount = m1PresentPost.length;
    result.authorizedIdsAbsent =
      pruneIds.every((id) => !postRowsById.has(id)) ? 'YES' : 'NO';
    result.excludedTailPresent = excludedTailId
      ? postRowsById.has(excludedTailId)
        ? 'YES'
        : 'NO'
      : 'N/A';
    result.r1Present = independentSessionIds[0]
      ? postRowsById.has(independentSessionIds[0])
        ? 'YES'
        : 'NO'
      : 'N/A';
    result.r2Present = independentSessionIds[1]
      ? postRowsById.has(independentSessionIds[1])
        ? 'YES'
        : 'NO'
      : 'N/A';

    const m1Row = m1PresentPost[0];
  if (m1Row) {
    result.m1DomainSummary = {
      durationSeconds: m1Row.durationSeconds,
      socDeltaPercent: m1Row.socDeltaPercent,
      energyDeltaKwh: m1Row.energyDeltaKwh,
      confidence: m1Row.confidence,
    };
  }

    result.status = 'MUTATION_COMMITTED';
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    result.status = APPLY ? 'ABORTED_OR_ROLLED_BACK' : 'PREFLIGHT_FAILED';
    result.error = error instanceof Error ? error.message : String(error);
    if (APPLY && result.transactionStarted && !result.transactionCommitted) {
      result.transactionRolledBack = true;
    }
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
    console.error(result.error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
