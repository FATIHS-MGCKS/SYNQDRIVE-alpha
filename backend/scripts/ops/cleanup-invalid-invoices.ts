/**
 * Remove invalid invoice rows: VOID duplicates, DRAFT on cancelled/missing bookings,
 * superseded DRAFT when a canonical PAID/ISSUED invoice exists for the same booking.
 *
 * Dry-run:
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/cleanup-invalid-invoices.ts
 *
 * Apply:
 *   CONFIRM=1 ORG_ID=<uuid> npx ts-node -r tsconfig-paths/register scripts/ops/cleanup-invalid-invoices.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, type OrgInvoice } from '@prisma/client';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

const CANONICAL_STATUSES = new Set(['PAID', 'ISSUED', 'SENT', 'PARTIALLY_PAID', 'OPEN', 'OVERDUE']);

async function collectRemovableIds(
  prisma: PrismaClient,
  orgId: string,
): Promise<{ ids: string[]; reasons: Record<string, string> }> {
  const invoices = await prisma.orgInvoice.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      status: true,
      type: true,
      bookingId: true,
      createdAt: true,
      paidCents: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const bookingIds = [...new Set(invoices.map((i) => i.bookingId).filter(Boolean))] as string[];
  const bookings = bookingIds.length
    ? await prisma.booking.findMany({
        where: { id: { in: bookingIds }, organizationId: orgId },
        select: { id: true, status: true },
      })
    : [];
  const bookingStatus = new Map(bookings.map((b) => [b.id, b.status]));

  const byBooking = new Map<string, OrgInvoice[]>();
  for (const inv of invoices) {
    if (!inv.bookingId) continue;
    const group = byBooking.get(inv.bookingId) ?? [];
    group.push(inv as OrgInvoice);
    byBooking.set(inv.bookingId, group);
  }

  const ids = new Set<string>();
  const reasons: Record<string, string> = {};

  const mark = (id: string, reason: string) => {
    ids.add(id);
    reasons[id] = reason;
  };

  for (const inv of invoices) {
    if (inv.status === 'VOID') {
      mark(inv.id, 'VOID duplicate/superseded');
    }
  }

  for (const inv of invoices) {
    if (inv.status !== 'DRAFT') continue;
    if (!inv.bookingId) {
      mark(inv.id, 'orphan DRAFT without bookingId');
      continue;
    }
    const bStatus = bookingStatus.get(inv.bookingId);
    if (!bStatus) {
      mark(inv.id, 'DRAFT for missing booking');
      continue;
    }
    if (bStatus === 'CANCELLED' || bStatus === 'NO_SHOW') {
      mark(inv.id, `DRAFT on ${bStatus} booking`);
    }
  }

  for (const [, group] of byBooking) {
    const canonical = [...group]
      .filter((inv) => CANONICAL_STATUSES.has(inv.status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (!canonical) continue;
    for (const inv of group) {
      if (inv.status === 'DRAFT' && inv.id !== canonical.id) {
        mark(inv.id, `superseded DRAFT (canonical ${canonical.status})`);
      }
    }
  }

  return { ids: [...ids], reasons };
}

async function hardDeleteInvoices(prisma: PrismaClient, invoiceIds: string[]) {
  if (invoiceIds.length === 0) return;

  await prisma.generatedDocument.updateMany({
    where: { invoiceId: { in: invoiceIds } },
    data: { invoiceId: null },
  });
  await prisma.orgTask.updateMany({
    where: { invoiceId: { in: invoiceIds } },
    data: { invoiceId: null },
  });
  await prisma.orgInvoicePayment.deleteMany({
    where: { invoiceId: { in: invoiceIds } },
  });
  await prisma.orgInvoice.deleteMany({
    where: { id: { in: invoiceIds } },
  });
}

async function main() {
  const orgId = process.env.ORG_ID?.trim();
  const confirm = process.env.CONFIRM === '1' || process.env.CONFIRM === 'true';
  const prisma = new PrismaClient();

  try {
    const orgIds = orgId
      ? [orgId]
      : (
          await prisma.orgInvoice.groupBy({
            by: ['organizationId'],
          })
        ).map((row) => row.organizationId);

    const results = [];
    for (const id of orgIds) {
      const { ids, reasons } = await collectRemovableIds(prisma, id);
      const detail = ids.map((invoiceId) => ({
        invoiceId,
        reason: reasons[invoiceId],
      }));

      if (confirm && ids.length > 0) {
        await hardDeleteInvoices(prisma, ids);
      }

      results.push({
        orgId: id,
        removed: confirm ? ids.length : 0,
        wouldRemove: ids.length,
        detail,
      });
    }

    console.log(JSON.stringify({ confirm, results }, null, 2));
    if (!confirm) {
      console.log('\nDry-run only. Re-run with CONFIRM=1 to permanently delete invalid invoices.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
