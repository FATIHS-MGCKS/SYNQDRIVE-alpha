/**
 * Controlled legacy migration for OrgDataAuthorization + VehicleProviderConsent.
 *
 * Default: DRY_RUN only — no writes to privacy domain tables.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/ops/migrate-data-authorization-legacy.ts
 *   npx ts-node -r tsconfig-paths/register scripts/ops/migrate-data-authorization-legacy.ts --commit
 *   npx ts-node -r tsconfig-paths/register scripts/ops/migrate-data-authorization-legacy.ts --org-id=<uuid>
 *   npx ts-node -r tsconfig-paths/register scripts/ops/migrate-data-authorization-legacy.ts --rollback --run-id=<uuid>
 */
import { DataAuthorizationLegacyMigrationMode, PrismaClient } from '@prisma/client';
import { DataAuthorizationLegacyMigrationService } from '../../src/modules/data-authorizations/privacy-domain/legacy-migration/data-authorization-legacy-migration.service';

const prisma = new PrismaClient();

async function main() {
  const commit = process.argv.includes('--commit');
  const rollback = process.argv.includes('--rollback');
  const orgArg = process.argv.find((arg) => arg.startsWith('--org-id='));
  const runArg = process.argv.find((arg) => arg.startsWith('--run-id='));
  const batchArg = process.argv.find((arg) => arg.startsWith('--batch-size='));

  const mode = rollback
    ? DataAuthorizationLegacyMigrationMode.ROLLBACK
    : commit
      ? DataAuthorizationLegacyMigrationMode.COMMIT
      : DataAuthorizationLegacyMigrationMode.DRY_RUN;

  const service = new DataAuthorizationLegacyMigrationService(prisma as never);

  const report = await service.run({
    mode,
    organizationId: orgArg?.split('=')[1],
    rollbackRunId: runArg?.split('=')[1],
    batchSize: batchArg ? Number(batchArg.split('=')[1]) : undefined,
  });

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
