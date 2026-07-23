/**
 * Backfill rental-rules and booking-eligibility permission modules onto existing system role templates.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/ops/backfill-rental-rules-permissions.ts
 */
import { PrismaClient } from '@prisma/client';
import { normalizeMembershipPermissions } from '../../src/shared/auth/permission.util';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '../../src/modules/users/defaults/organization-role.defaults';

const prisma = new PrismaClient();

async function main() {
  const templatesByKey = new Map(
    DEFAULT_ORGANIZATION_ROLE_TEMPLATES.map((t) => [t.systemKey, t.permissions]),
  );

  const roles = await prisma.organizationRole.findMany({
    where: { isSystemTemplate: true, systemKey: { not: null } },
    select: { id: true, systemKey: true, permissions: true },
  });

  let updated = 0;
  for (const role of roles) {
    const defaults = role.systemKey ? templatesByKey.get(role.systemKey) : undefined;
    if (!defaults) continue;

    const merged = {
      ...normalizeMembershipPermissions(role.permissions),
      ...normalizeMembershipPermissions(defaults),
    };

    await prisma.organizationRole.update({
      where: { id: role.id },
      data: { permissions: merged as object },
    });
    updated += 1;
  }

  console.log(`Backfilled rental-rules permissions on ${updated} system role templates.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
