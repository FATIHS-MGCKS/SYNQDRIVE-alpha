import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ORG_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

async function main() {
  const [
    invoices,
    generatedDocs,
    sequences,
    org,
    invoiceTasks,
    bookings,
    customers,
    tasks,
  ] = await Promise.all([
    prisma.orgInvoice.findMany({
      where: { organizationId: ORG_ID },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        bookingId: true,
        customerId: true,
        invoiceNumberDisplay: true,
      },
    }),
    prisma.generatedDocument.findMany({
      where: { organizationId: ORG_ID },
      select: {
        id: true,
        documentType: true,
        bookingId: true,
        customerId: true,
        invoiceId: true,
        status: true,
      },
    }),
    prisma.orgInvoiceSequence.findMany({ where: { organizationId: ORG_ID } }),
    prisma.organization.findUnique({
      where: { id: ORG_ID },
      select: { companyName: true, nextInvoiceNumber: true, invoicePrefix: true },
    }),
    prisma.orgTask.findMany({
      where: { organizationId: ORG_ID, invoiceId: { not: null } },
      select: { id: true, title: true, invoiceId: true },
    }),
    prisma.booking.count({ where: { organizationId: ORG_ID } }),
    prisma.customer.count({ where: { organizationId: ORG_ID } }),
    prisma.orgTask.findMany({
      where: { organizationId: ORG_ID },
      select: { id: true, title: true, dedupKey: true },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        org,
        counts: {
          invoices: invoices.length,
          generatedDocs: generatedDocs.length,
          sequences: sequences.length,
          invoiceTasks: invoiceTasks.length,
          bookings,
          customers,
          tasks: tasks.length,
        },
        invoices,
        generatedDocs,
        sequences,
        invoiceTasks,
        tasks,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
