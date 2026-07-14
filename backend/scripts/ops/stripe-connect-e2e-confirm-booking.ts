/**
 * Confirm an existing wizard draft booking with payment_link.
 * Usage: E2E_BOOKING_ID=<uuid> npx ts-node -r tsconfig-paths/register scripts/ops/stripe-connect-e2e-confirm-booking.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { BookingWizardDraftService } from '../../src/modules/bookings/booking-wizard-draft.service';

const ORG_ID = process.env.E2E_ORG_ID?.trim() || 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const BOOKING_ID = process.env.E2E_BOOKING_ID?.trim();

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

async function main() {
  if (!BOOKING_ID) throw new Error('E2E_BOOKING_ID required');

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const wizard = app.get(BookingWizardDraftService);

    const membership = await prisma.organizationMembership.findFirst({
      where: { organizationId: ORG_ID, role: 'ORG_ADMIN', status: 'ACTIVE' },
      include: { user: { select: { id: true } } },
    });
    if (!membership?.user) throw new Error('No ORG_ADMIN');

    const confirmed = await wizard.confirmDraft(
      ORG_ID,
      BOOKING_ID,
      {
        agbAccepted: true,
        privacyAccepted: true,
        status: 'CONFIRMED',
        paymentIntent: 'payment_link',
      },
      { userId: membership.user.id },
    );

    const pr = confirmed.paymentFlow?.paymentRequestId
      ? await prisma.bookingPaymentRequest.findUnique({
          where: { id: confirmed.paymentFlow.paymentRequestId },
        })
      : null;

    console.log(
      JSON.stringify(
        {
          bookingId: BOOKING_ID,
          bookingStatus: confirmed.booking.status,
          paymentFlow: confirmed.paymentFlow,
          paymentRequest: pr
            ? {
                status: pr.status,
                amountCents: pr.amountCents,
                commissionableAmountCents: pr.commissionableAmountCents,
                applicationFeeAmountCents: pr.applicationFeeAmountCents,
                stripeCheckoutSessionId: pr.stripeCheckoutSessionId,
              }
            : null,
          checkoutUrl: confirmed.paymentFlow?.checkoutUrl ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close().catch(() => undefined);
  }
  process.exit(0);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
