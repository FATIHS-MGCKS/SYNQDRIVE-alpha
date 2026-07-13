/**
 * Audit duplicate OUTGOING_BOOKING invoices per bookingId (org-scoped).
 *
 * Usage:
 *   cd backend && npx ts-node scripts/ops/audit-duplicate-booking-invoices.ts
 *   ORG_ID=<uuid> npx ts-node scripts/ops/audit-duplicate-booking-invoices.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ORG_ID = process.env.ORG_ID?.trim() || null;

async function main() {
  const where = ORG_ID
    ? { organizationId: ORG_ID, type: 'OUTGOING_BOOKING' as const }
    : { type: 'OUTGOING_BOOKING' as const };

  const invoices = await prisma.orgInvoice.findMany({
    where,
    select: {
      id: true,
      organizationId: true,
      bookingId: true,
      status: true,
      totalCents: true,
      invoiceNumberDisplay: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const byOrgBooking = new Map<string, typeof invoices>();

  for (const inv of invoices) {
    if (!inv.bookingId) continue;
    const key = `${inv.organizationId}:${inv.bookingId}`;
    const group = byOrgBooking.get(key) ?? [];
    group.push(inv);
    byOrgBooking.set(key, group);
  }

  const duplicates = [...byOrgBooking.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      count: group.length,
      invoices: group.map((inv) => ({
        id: inv.id,
        status: inv.status,
        totalCents: inv.totalCents,
        invoiceNumberDisplay: inv.invoiceNumberDisplay,
        createdAt: inv.createdAt.toISOString(),
      })),
    }));

  console.log(
    JSON.stringify(
      {
        orgFilter: ORG_ID,
        totalOutgoingBookingInvoices: invoices.length,
        duplicateBookingGroups: duplicates.length,
        duplicates,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
