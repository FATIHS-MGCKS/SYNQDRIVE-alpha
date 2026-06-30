import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ORG_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const KEEP_TASK_ID = '63c20577-a42b-46f4-ab76-b9e3bc69f1b5';
const MERCEDES_VEHICLE_ID = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63';
const KEEP_TASK_DEDUP_KEY = `service_overdue:${MERCEDES_VEHICLE_ID}`;

async function inspect() {
  const bookingIds = (
    await prisma.booking.findMany({
      where: { organizationId: ORG_ID },
      select: { id: true },
    })
  ).map((b) => b.id);

  const customerIds = (
    await prisma.customer.findMany({
      where: { organizationId: ORG_ID },
      select: { id: true },
    })
  ).map((c) => c.id);

  const [
    invoices,
    generatedDocs,
    docBundles,
    drivingAnalysis,
    misuseCases,
    damages,
    whatsapp,
    tasksToDelete,
  ] = await Promise.all([
    prisma.orgInvoice.count({ where: { organizationId: ORG_ID } }),
    prisma.generatedDocument.count({
      where: {
        organizationId: ORG_ID,
        OR: [{ bookingId: { in: bookingIds } }, { customerId: { in: customerIds } }],
      },
    }),
    prisma.bookingDocumentBundle.count({ where: { organizationId: ORG_ID } }),
    prisma.rentalDrivingAnalysis.count({ where: { organizationId: ORG_ID } }),
    prisma.misuseCase.count({ where: { organizationId: ORG_ID } }),
    prisma.vehicleDamage.count({
      where: {
        OR: [{ bookingId: { in: bookingIds } }, { customerId: { in: customerIds } }],
      },
    }),
    prisma.whatsAppConversation.count({ where: { organizationId: ORG_ID } }),
    prisma.orgTask.count({
      where: { organizationId: ORG_ID, id: { not: KEEP_TASK_ID } },
    }),
  ]);

  console.log({
    bookingIds,
    customerIds,
    invoices,
    generatedDocs,
    docBundles,
    drivingAnalysis,
    misuseCases,
    damages,
    whatsapp,
    tasksToDelete,
    keepTask: KEEP_TASK_ID,
  });
}

async function cleanup(dryRun: boolean) {
  const org = await prisma.organization.findUnique({
    where: { id: ORG_ID },
    select: { companyName: true },
  });
  if (!org) throw new Error(`Organization ${ORG_ID} not found`);

  const keepTask = await prisma.orgTask.findFirst({
    where: {
      organizationId: ORG_ID,
      id: KEEP_TASK_ID,
      dedupKey: KEEP_TASK_DEDUP_KEY,
      vehicleId: MERCEDES_VEHICLE_ID,
    },
  });
  if (!keepTask) {
    throw new Error(
      `Expected Mercedes service-overdue task (${KEEP_TASK_ID}) not found — aborting`,
    );
  }

  const bookingIds = (
    await prisma.booking.findMany({
      where: { organizationId: ORG_ID },
      select: { id: true },
    })
  ).map((b) => b.id);

  const customerIds = (
    await prisma.customer.findMany({
      where: { organizationId: ORG_ID },
      select: { id: true },
    })
  ).map((c) => c.id);

  console.log(`Org: ${org.companyName} (${ORG_ID})`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Bookings to delete: ${bookingIds.length}`);
  console.log(`Customers to delete: ${customerIds.length}`);

  const run = async () => {
    // 1) Tasks except Mercedes service overdue
    const deletedTasks = await prisma.orgTask.deleteMany({
      where: { organizationId: ORG_ID, id: { not: KEEP_TASK_ID } },
    });
    console.log(`Deleted tasks: ${deletedTasks.count}`);

    // 2) All org invoices for this tenant (payments cascade)
    const deletedInvoices = await prisma.orgInvoice.deleteMany({
      where: { organizationId: ORG_ID },
    });
    console.log(`Deleted invoices: ${deletedInvoices.count}`);

    // 2b) Invoice sequences + legacy counter reset
    const deletedSequences = await prisma.orgInvoiceSequence.deleteMany({
      where: { organizationId: ORG_ID },
    });
    console.log(`Deleted invoice sequences: ${deletedSequences.count}`);
    await prisma.organization.update({
      where: { id: ORG_ID },
      data: { nextInvoiceNumber: 1 },
    });
    console.log('Reset nextInvoiceNumber to 1');

    // 3) All generated documents for this tenant
    const deletedDocs = await prisma.generatedDocument.deleteMany({
      where: { organizationId: ORG_ID },
    });
    console.log(`Deleted generated documents: ${deletedDocs.count}`);

    // 4) Booking document bundles (cascade from booking delete may handle, but explicit first)
    const deletedBundles = await prisma.bookingDocumentBundle.deleteMany({
      where: { organizationId: ORG_ID, bookingId: { in: bookingIds } },
    });
    console.log(`Deleted booking document bundles: ${deletedBundles.count}`);

    // 5) Rental driving analysis (1:1 with booking)
    const deletedRda = await prisma.rentalDrivingAnalysis.deleteMany({
      where: { organizationId: ORG_ID, bookingId: { in: bookingIds } },
    });
    console.log(`Deleted rental driving analyses: ${deletedRda.count}`);

    // 6) Misuse cases — unlink booking/customer then delete org misuse cases tied to them
    await prisma.misuseCase.updateMany({
      where: { organizationId: ORG_ID, bookingId: { in: bookingIds } },
      data: { bookingId: null },
    });
    await prisma.misuseCase.updateMany({
      where: { organizationId: ORG_ID, customerId: { in: customerIds } },
      data: { customerId: null },
    });

    // 7) Vehicle damages linked to bookings/customers
    const deletedDamages = await prisma.vehicleDamage.deleteMany({
      where: {
        OR: [{ bookingId: { in: bookingIds } }, { customerId: { in: customerIds } }],
      },
    });
    console.log(`Deleted vehicle damages: ${deletedDamages.count}`);

    // 8) WhatsApp conversations
    const deletedWa = await prisma.whatsAppConversation.deleteMany({
      where: {
        organizationId: ORG_ID,
        OR: [{ bookingId: { in: bookingIds } }, { customerId: { in: customerIds } }],
      },
    });
    console.log(`Deleted whatsapp conversations: ${deletedWa.count}`);

    // 9) Bookings (cascades handover protocols, price snapshots, deposits, etc.)
    const deletedBookings = await prisma.booking.deleteMany({
      where: { organizationId: ORG_ID },
    });
    console.log(`Deleted bookings: ${deletedBookings.count}`);

    // 10) Customers (cascades documents, timeline, verification checks)
    const deletedCustomers = await prisma.customer.deleteMany({
      where: { organizationId: ORG_ID },
    });
    console.log(`Deleted customers: ${deletedCustomers.count}`);
  };

  if (dryRun) {
    console.log('DRY RUN — no changes written');
    return;
  }

  await prisma.$transaction(async () => {
    await run();
  });

  const [remainingBookings, remainingCustomers, remainingInvoices, remainingSequences, remainingTasks] =
    await Promise.all([
    prisma.booking.count({ where: { organizationId: ORG_ID } }),
    prisma.customer.count({ where: { organizationId: ORG_ID } }),
    prisma.orgInvoice.count({ where: { organizationId: ORG_ID } }),
    prisma.orgInvoiceSequence.count({ where: { organizationId: ORG_ID } }),
    prisma.orgTask.findMany({
      where: { organizationId: ORG_ID },
      select: { id: true, title: true, dedupKey: true, vehicleId: true },
    }),
  ]);

  console.log('After cleanup:', {
    remainingBookings,
    remainingCustomers,
    remainingInvoices,
    remainingSequences,
    remainingTasks,
  });
}

const mode = process.argv[2] ?? 'inspect';
if (mode === 'inspect') {
  inspect()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
} else if (mode === 'dry-run' || mode === 'execute') {
  cleanup(mode === 'dry-run')
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
} else {
  console.error('Usage: npx ts-node scripts/ops/cleanup-fs-mobility-demo-data.ts [inspect|dry-run|execute]');
  prisma.$disconnect();
  process.exit(1);
}
