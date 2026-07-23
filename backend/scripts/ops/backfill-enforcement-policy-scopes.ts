/**
 * Backfill enforcement policy relational scopes from legacy OrgDataAuthorization JSON.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/ops/backfill-enforcement-policy-scopes.ts
 *   npx ts-node -r tsconfig-paths/register scripts/ops/backfill-enforcement-policy-scopes.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/ops/backfill-enforcement-policy-scopes.ts --org-id=<uuid>
 */
import { PrismaClient } from '@prisma/client';
import { backfillEnforcementPolicyScopes } from '../../src/modules/data-authorizations/privacy-domain/enforcement-policy-scope/enforcement-policy-scope-backfill.util';

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const orgArg = process.argv.find((arg) => arg.startsWith('--org-id='));
  const organizationId = orgArg?.split('=')[1];

  const result = await backfillEnforcementPolicyScopes(prisma, {
    dryRun,
    organizationId,
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
