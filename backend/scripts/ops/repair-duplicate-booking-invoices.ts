/**
 * Repair duplicate OUTGOING_BOOKING invoices and finalize drafts for confirmed bookings.
 *
 * Dry-run (default):
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/repair-duplicate-booking-invoices.ts
 *
 * Apply fixes:
 *   CONFIRM=1 ORG_ID=<uuid> npx ts-node -r tsconfig-paths/register scripts/ops/repair-duplicate-booking-invoices.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { BookingInvoiceLifecycleService } from '../../src/modules/invoices/booking-invoice-lifecycle.service';
import { PrismaService } from '../../src/shared/database/prisma.service';

async function main() {
  const orgId = process.env.ORG_ID?.trim();
  const confirm = process.env.CONFIRM === '1' || process.env.CONFIRM === 'true';

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const lifecycle = app.get(BookingInvoiceLifecycleService);
    const prisma = app.get(PrismaService);

    const orgIds = orgId
      ? [orgId]
      : (
          await prisma.orgInvoice.groupBy({
            by: ['organizationId'],
            where: { type: 'OUTGOING_BOOKING' },
          })
        ).map((row) => row.organizationId);

    const results = [];
    for (const id of orgIds) {
      results.push(
        await lifecycle.repairBookingInvoicesForOrg(id, {
          dryRun: !confirm,
          markConfirmedPaid: true,
        }),
      );
    }

    console.log(JSON.stringify({ confirm, results }, null, 2));
    if (!confirm) {
      console.log('\nDry-run only. Re-run with CONFIRM=1 to apply fixes.');
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
