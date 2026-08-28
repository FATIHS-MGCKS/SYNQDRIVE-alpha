/**
 * E3A controlled historical VehicleEnergyEvent write-backfill.
 *
 * Usage (secured infrastructure only):
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/energy-events-recovery-write-backfill.ts --preflight
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/energy-events-recovery-write-backfill.ts --apply
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/energy-events-recovery-write-backfill.ts --idempotency-check
 *
 * Requires:
 *   DATABASE_URL, DIMO_CLIENT_ID, DIMO_PRIVATE_KEY
 *   ENERGY_EVENTS_RECOVERY_PLAN_PATH (private JSON, never commit)
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import {
  ENERGY_EVENTS_OUTAGE_START_ISO,
  ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.constants';
import {
  buildRecoveryVehicleInput,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-capability';
import { createDimoRequestAccounting } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-accounting';
import { parseEnergyEventsRecoveryPlan } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-plan';
import {
  createPrismaRecoveryReadRepository,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-read.repository';
import {
  buildRemainingWriteSet,
  buildWriteSet,
  captureEnergyEventsTableSnapshot,
  captureRollbackPlan,
  executeControlledWriteBackfill,
  validateIdempotencyReport,
  validatePostWriteReport,
  validatePreWriteReport,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-write-backfill';
import {
  runEnergyEventsRecoveryDryRun,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-runner';
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

const APPLY = process.argv.includes('--apply');
const COMPLETE_REMAINING = process.argv.includes('--complete-remaining');
const PREFLIGHT = process.argv.includes('--preflight') || (!APPLY && !process.argv.includes('--idempotency-check') && !COMPLETE_REMAINING);
const IDEMPOTENCY_CHECK = process.argv.includes('--idempotency-check');
const OUTPUT_DIR =
  process.env.ENERGY_EVENTS_WRITE_BACKFILL_OUTPUT_DIR?.trim() ??
  '/tmp/e3a-write-backfill';
const PLAN_PATH = process.env.ENERGY_EVENTS_RECOVERY_PLAN_PATH?.trim();

function gitSha(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return process.env.ENERGY_RECOVERY_CODE_SHA?.trim() ?? 'unknown';
  }
}

function sanitizeSummary(result: unknown): Record<string, unknown> {
  const value = result as Record<string, unknown>;
  return {
    codeSha: value.codeSha,
    recoveryPlanVersion: value.recoveryPlanVersion,
    applied: value.applied,
    idempotencyVerified: value.idempotencyVerified,
    preWriteSnapshot: value.preWriteSnapshot,
    postWriteSnapshot: value.postWriteSnapshot,
    writeSet: value.writeSet,
    audit: value.audit,
    legacySubsegmentsReconciledTotal: value.legacySubsegmentsReconciledTotal,
    preWriteSummary: (value.preWriteReport as { summary?: unknown })?.summary,
    postWriteSummary: (value.postWriteReport as { summary?: unknown })?.summary,
    idempotencySummary: (value.idempotencyReport as { summary?: unknown })?.summary,
    recoveryPlan: (value.preWriteReport as { recoveryPlan?: unknown })?.recoveryPlan,
    gateBlockers: (value.preWriteReport as { gateBlockers?: unknown })?.gateBlockers,
  };
}

async function loadVehicles() {
  const accounting = createDimoRequestAccounting();
  const outageStart = new Date(ENERGY_EVENTS_OUTAGE_START_ISO);
  const recoveryCutoff = new Date(ENERGY_EVENTS_RECOVERY_CUTOFF_ISO);
  const prisma = new PrismaClient();
  const repository = createPrismaRecoveryReadRepository(prisma);
  const rows = await repository.loadRecoveryVehicleDbRows({
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
  const vehicles = rows.map((row) =>
    buildRecoveryVehicleInput(
      { ...row, dimoAccessAvailable: dimoAccessByTokenId[row.tokenId] ?? false },
      availableSignalsByTokenId[row.tokenId] ?? null,
      'full',
    ),
  );
  await prisma.$disconnect();
  return vehicles;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }
  if (!process.env.DIMO_CLIENT_ID || !process.env.DIMO_PRIVATE_KEY) {
    console.error('DIMO credentials required');
    process.exit(1);
  }
  if (!PLAN_PATH) {
    console.error('ENERGY_EVENTS_RECOVERY_PLAN_PATH required');
    process.exit(1);
  }

  const recoveryPlan = parseEnergyEventsRecoveryPlan(
    JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8')),
  );
  if (recoveryPlan.reviewedDispositions.length !== 2) {
    console.error('Expected exactly 2 reviewed dispositions in recovery plan');
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const vehicles = await loadVehicles();
  const prisma = new PrismaClient();
  const codeSha = gitSha();

  try {
    if (IDEMPOTENCY_CHECK) {
      const report = await runEnergyEventsRecoveryDryRun(vehicles, {
        fetchSegments: (tokenId, from, to, energyClass) =>
          fetchEnergyEventSegmentsStandalone(tokenId, from, to, energyClass),
        interRequestDelayMs: 500,
        mode: 'full',
        dbComparisonEnabled: true,
        dbComparisonStatus: 'ok',
        recoveryPlan,
      });
      validateIdempotencyReport(report);
      const snapshot = await captureEnergyEventsTableSnapshot(prisma);
      const payload = {
        mode: 'idempotency-check',
        codeSha,
        recoveryPlanVersion: recoveryPlan.planVersion,
        summary: report.summary,
        recoveryPlan: report.recoveryPlan,
        snapshot,
      };
      fs.writeFileSync(
        path.join(OUTPUT_DIR, 'idempotency-check-summary.json'),
        JSON.stringify(payload, null, 2),
      );
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    const preSnapshot = await captureEnergyEventsTableSnapshot(prisma);
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'pre-write-snapshot-private.json'),
      JSON.stringify(preSnapshot, null, 2),
    );

    if (APPLY || COMPLETE_REMAINING) {
      const preflightReport = await runEnergyEventsRecoveryDryRun(vehicles, {
        fetchSegments: (tokenId, from, to, energyClass) =>
          fetchEnergyEventSegmentsStandalone(tokenId, from, to, energyClass),
        interRequestDelayMs: 500,
        mode: 'full',
        dbComparisonEnabled: true,
        dbComparisonStatus: 'ok',
        recoveryPlan,
      });
      if (!COMPLETE_REMAINING) {
        validatePreWriteReport(preflightReport);
      }
      const writeSet = COMPLETE_REMAINING
        ? buildRemainingWriteSet(preflightReport)
        : buildWriteSet(preflightReport);
      const rollbackPlan = await captureRollbackPlan(prisma, writeSet);
      fs.writeFileSync(
        path.join(OUTPUT_DIR, 'rollback-plan-private.json'),
        JSON.stringify(
          {
            capturedAt: new Date().toISOString(),
            codeSha,
            recoveryPlanVersion: recoveryPlan.planVersion,
            entries: rollbackPlan.length,
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(OUTPUT_DIR, 'rollback-plan-private-full.json'),
        JSON.stringify(rollbackPlan, null, 2),
      );
    }

    const result = await executeControlledWriteBackfill({
      prisma,
      vehicles,
      recoveryPlan,
      fetchSegments: (tokenId, from, to, energyClass) =>
        fetchEnergyEventSegmentsStandalone(tokenId, from, to, energyClass),
      applyWrites: APPLY || COMPLETE_REMAINING,
      verifyIdempotency: APPLY || COMPLETE_REMAINING,
      codeSha,
      completeRemaining: COMPLETE_REMAINING,
    });

    const sanitized = sanitizeSummary(result);
    const resultName = COMPLETE_REMAINING
      ? 'complete-remaining-result.json'
      : APPLY
        ? 'write-backfill-result.json'
        : 'preflight-result.json';
    fs.writeFileSync(
      path.join(OUTPUT_DIR, resultName),
      JSON.stringify(sanitized, null, 2),
    );
    console.log(JSON.stringify(sanitized, null, 2));

    if (APPLY || COMPLETE_REMAINING) {
      validatePostWriteReport(result.postWriteReport!);
      if (!result.idempotencyVerified) {
        throw new Error('Idempotency verification failed');
      }
    } else {
      validatePreWriteReport(result.preWriteReport);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
