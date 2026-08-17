/**
 * Applies corrected M252 semantic DDL for ephemeral/bootstrap databases only.
 *
 * Used when historical migration 20260721270000 fails on empty PostgreSQL due to
 * 63-byte identifier truncation collisions in the original ledger-authoritative SQL.
 *
 * Production must never invoke this path — it uses prisma migrate deploy directly.
 */
import { PrismaClient } from '@prisma/client';

export const M252_MIGRATION = '20260721270000_iam_role_assignment_drift_reconciliation';

const STATEMENTS: string[] = [
  `CREATE TABLE "organization_role_assignment_drift_reconciliation_applications" (
  "id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL,
  "evidence_hash" TEXT NOT NULL,
  "expected_git_commit" TEXT NOT NULL,
  "operator" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "classification" TEXT NOT NULL,
  "result" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "org_role_asgn_drift_recon_apps_pkey" PRIMARY KEY ("id")
)`,
  `CREATE UNIQUE INDEX "org_role_asgn_drift_recon_apps_idem_key"
  ON "organization_role_assignment_drift_reconciliation_applications"("idempotency_key")`,
  `CREATE INDEX "org_role_asgn_drift_recon_apps_org_mbr_created_idx"
  ON "organization_role_assignment_drift_reconciliation_applications"("organization_id", "membership_id", "created_at")`,
  `ALTER TABLE "organization_role_assignment_drift_reconciliation_applications"
  ADD CONSTRAINT "org_role_asgn_drift_recon_apps_org_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "organization_role_assignment_drift_reconciliation_applications"
  ADD CONSTRAINT "org_role_asgn_drift_recon_apps_mbr_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
];

async function main() {
  const prisma = new PrismaClient();
  console.log(`Applying ${STATEMENTS.length} M252 ephemeral recovery statements …`);
  for (const stmt of STATEMENTS) {
    const head = stmt.slice(0, 95).replace(/\s+/g, ' ');
    process.stdout.write(`  → ${head}${stmt.length > 95 ? '…' : ''}\n`);
    await prisma.$executeRawUnsafe(stmt);
  }
  await prisma.$disconnect();
  console.log('M252 ephemeral recovery DDL applied.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
