import type { PrismaService } from '@shared/database/prisma.service';

export interface CategoryHistoricalReferenceCounts {
  assignedVehicles: number;
  bookings: number;
  eligibilitySnapshots: number;
}

export async function countCategoryHistoricalReferences(
  prisma: PrismaService,
  orgId: string,
  categoryId: string,
): Promise<CategoryHistoricalReferenceCounts> {
  const categorySourceToken = `category:${categoryId}`;
  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId: orgId, rentalCategoryId: categoryId },
    select: { id: true },
  });
  const vehicleIds = vehicles.map((row) => row.id);

  const [bookings, eligibilitySnapshots] = await Promise.all([
    vehicleIds.length
      ? prisma.booking.count({
          where: { organizationId: orgId, vehicleId: { in: vehicleIds } },
        })
      : Promise.resolve(0),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM booking_eligibility_approvals
      WHERE organization_id = ${orgId}
        AND gate_result_snapshot::text LIKE ${`%${categorySourceToken}%`}
    `.then((rows) => Number(rows[0]?.count ?? 0)),
  ]);

  return {
    assignedVehicles: vehicleIds.length,
    bookings,
    eligibilitySnapshots,
  };
}

export function categoryHasHistoricalReferences(counts: CategoryHistoricalReferenceCounts): boolean {
  return counts.bookings > 0 || counts.eligibilitySnapshots > 0;
}
