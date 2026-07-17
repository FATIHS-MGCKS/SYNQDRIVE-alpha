/**
 * Read-only Stations V2 primary invariant diagnostic.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/stations-v2-primary-diagnose.ts
 *   npx ts-node -r tsconfig-paths/register scripts/ops/stations-v2-primary-diagnose.ts --organization-id=<uuid>
 */
import { Prisma, PrismaClient, StationStatus } from '@prisma/client';

const prisma = new PrismaClient();

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((entry) => entry.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

async function main() {
  const organizationId = parseArg('--organization-id');
  const orgFilter = organizationId
    ? Prisma.sql`AND organization_id = ${organizationId}::uuid`
    : Prisma.empty;

  const duplicateGroups = await prisma.$queryRaw<
    Array<{ organization_id: string; primary_count: bigint }>
  >`
    SELECT organization_id, COUNT(*)::bigint AS primary_count
    FROM stations
    WHERE is_primary = true AND status <> 'ARCHIVED'
    ${orgFilter}
    GROUP BY organization_id
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `;

  const where = organizationId ? { organizationId } : {};

  const [archivedPrimary, inactivePrimary] = await Promise.all([
    prisma.station.count({
      where: {
        ...where,
        isPrimary: true,
        status: StationStatus.ARCHIVED,
      },
    }),
    prisma.station.count({
      where: {
        ...where,
        isPrimary: true,
        status: StationStatus.INACTIVE,
      },
    }),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    organizationId: organizationId ?? null,
    duplicatePrimaryOrganizations: duplicateGroups.map((row) => ({
      organizationId: row.organization_id,
      primaryCount: Number(row.primary_count),
    })),
    archivedPrimaryCount: archivedPrimary,
    inactivePrimaryCount: inactivePrimary,
  };

  console.log(JSON.stringify(report, null, 2));

  if (report.duplicatePrimaryOrganizations.length > 0) {
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
