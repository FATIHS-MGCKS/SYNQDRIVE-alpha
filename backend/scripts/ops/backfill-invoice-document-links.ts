/**
 * Backfill invoice ↔ generated-document dual links.
 *
 * Usage:
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/backfill-invoice-document-links.ts --org=<uuid>
 *   ... --apply   # mutate (default is dry-run)
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function parseArgs() {
  const orgId =
    process.argv.find((a) => a.startsWith('--org='))?.slice('--org='.length) ||
    process.env.ORG_ID;
  if (!orgId) {
    console.error('Pass --org=<uuid> or ORG_ID env');
    process.exit(2);
  }
  const apply = process.argv.includes('--apply');
  return { orgId, apply };
}

function pickActiveDoc(
  docs: Array<{ id: string; status: string; createdAt: Date }>,
): string | null {
  const nonVoid = docs.filter((d) => d.status !== 'VOID');
  const sendable = nonVoid.find((d) => d.status === 'GENERATED' || d.status === 'SENT');
  return (sendable ?? nonVoid[0])?.id ?? null;
}

async function main() {
  const { orgId, apply } = parseArgs();
  const prisma = new PrismaClient();

  let docInvoiceIdUpdates = 0;
  let invoicePointerUpdates = 0;

  try {
    const invoices = await prisma.orgInvoice.findMany({
      where: { organizationId: orgId },
      select: { id: true, bookingId: true, generatedDocumentId: true },
    });

    const docs = await prisma.generatedDocument.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        invoiceId: true,
        bookingId: true,
        documentType: true,
        status: true,
        createdAt: true,
      },
    });

    for (const invoice of invoices) {
      const linked = docs.filter((d) => d.invoiceId === invoice.id && d.status !== 'VOID');
      const bookingFallback =
        invoice.bookingId && linked.length === 0
          ? docs.filter(
              (d) =>
                d.bookingId === invoice.bookingId &&
                ['BOOKING_INVOICE', 'FINAL_INVOICE'].includes(d.documentType) &&
                d.status !== 'VOID',
            )
          : [];

      const candidates = linked.length > 0 ? linked : bookingFallback;
      const activeId = pickActiveDoc(candidates);

      if (activeId) {
        const doc = docs.find((d) => d.id === activeId)!;
        if (!doc.invoiceId) {
          docInvoiceIdUpdates += 1;
          console.log(`[doc.invoiceId] ${activeId} -> ${invoice.id}`);
          if (apply) {
            await prisma.generatedDocument.update({
              where: { id: activeId },
              data: { invoiceId: invoice.id },
            });
            doc.invoiceId = invoice.id;
          }
        }
      }

      if (activeId && invoice.generatedDocumentId !== activeId) {
        invoicePointerUpdates += 1;
        console.log(`[invoice.pointer] ${invoice.id} -> ${activeId}`);
        if (apply) {
          await prisma.orgInvoice.update({
            where: { id: invoice.id },
            data: { generatedDocumentId: activeId },
          });
        }
      }
    }

    console.log(
      JSON.stringify(
        {
          orgId,
          apply,
          docInvoiceIdUpdates,
          invoicePointerUpdates,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(2);
});
