#!/usr/bin/env node
/**
 * Fail-closed verification that F10.6.8-B migration artifacts exist in PostgreSQL
 * BEFORE any test-only prisma db push drift repair.
 */
import { PrismaClient } from '@prisma/client';

const B_MIGRATION = '20260920180000_rfrf_f10_6_8_b_candidate_recovery';
const REQUIRED_COLUMNS = [
  'recovery_next_attempt_at',
  'recovery_last_attempt_at',
  'recovery_attempt_count',
  'recovery_last_outcome',
  'recovery_lease_expires_at',
];
const REQUIRED_ENUM = 'RawRefuelCandidateRecoveryLastOutcome';
const REQUIRED_INDEX = 'raw_refuel_candidates_recovery_due_idx';

function fail(message) {
  console.error(`RFRF_F10_6_8_B_MIGRATION_CONTRACT_FAIL: ${message}`);
  process.exit(1);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    fail('DATABASE_URL is required');
  }

  const prisma = new PrismaClient();
  try {
    const migrations = await prisma.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
      WHERE migration_name = ${B_MIGRATION}
    `;
    if (migrations.length !== 1) {
      fail(`expected exactly one ${B_MIGRATION} row in _prisma_migrations`);
    }
    const row = migrations[0];
    if (row.rolled_back_at) {
      fail(`${B_MIGRATION} is rolled back`);
    }
    if (!row.finished_at) {
      fail(`${B_MIGRATION} is not finished`);
    }

    for (const column of REQUIRED_COLUMNS) {
      const cols = await prisma.$queryRaw`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'raw_refuel_candidates'
          AND column_name = ${column}
      `;
      if (cols.length !== 1) {
        fail(`missing column raw_refuel_candidates.${column}`);
      }
    }

    const enums = await prisma.$queryRaw`
      SELECT t.typname
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = ${REQUIRED_ENUM}
    `;
    if (enums.length !== 1) {
      fail(`missing enum ${REQUIRED_ENUM}`);
    }

    const enumLabels = await prisma.$queryRaw`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = ${REQUIRED_ENUM}
    `;
    for (const label of [
      'SUCCESS_CONVERGED',
      'SUCCESS_MATURED_READY',
      'PENDING_NATIVE_RECONCILIATION',
      'NO_MATCHING_OBSERVATION',
      'TERMINAL_NO_ACTION',
    ]) {
      if (!enumLabels.some((entry) => entry.enumlabel === label)) {
        fail(`enum ${REQUIRED_ENUM} missing label ${label}`);
      }
    }

    const indexes = await prisma.$queryRaw`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'raw_refuel_candidates'
        AND indexname = ${REQUIRED_INDEX}
    `;
    if (indexes.length !== 1) {
      fail(`missing index ${REQUIRED_INDEX}`);
    }
    const indexdef = indexes[0].indexdef.toLowerCase();
    if (!indexdef.includes('lifecycle_state') || !indexdef.includes('recovery_next_attempt_at')) {
      fail(`${REQUIRED_INDEX} does not index lifecycle_state and recovery_next_attempt_at`);
    }

    console.log('RFRF_F10_6_8_B_MIGRATION_CONTRACT=PASS');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
