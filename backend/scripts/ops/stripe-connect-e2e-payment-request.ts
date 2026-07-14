/**
 * Create payment request + checkout for confirmed booking (post-confirm recovery).
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { BookingPaymentRequestService } from '../../src/modules/payments/booking-payment-request.service';
import { StripeCheckoutService } from '../../src/modules/payments/stripe-checkout.service';

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
    const paymentRequests = app.get(BookingPaymentRequestService);
    const checkout = app.get(StripeCheckoutService);

    const membership = await prisma.organizationMembership.findFirst({
      where: { organizationId: ORG_ID, role: 'ORG_ADMIN', status: 'ACTIVE' },
      include: { user: { select: { id: true, email: true } } },
    });
    if (!membership?.user) throw new Error('No ORG_ADMIN');

    const actor = {
      id: membership.user.id,
      email: membership.user.email,
      organizationId: ORG_ID,
    };

    const idempotencyBase = `e2e-recovery:${BOOKING_ID}`;
    const created = await paymentRequests.createRentalPaymentRequest({
      organizationId: ORG_ID,
      bookingId: BOOKING_ID,
      actor,
      idempotencyKey: `${idempotencyBase}:payment-request`,
      sendEmail: false,
    });

    const session = await checkout.createCheckoutSessionForPaymentRequest({
      organizationId: ORG_ID,
      bookingId: BOOKING_ID,
      paymentRequestId: created.request.id,
      actor,
      idempotencyKey: `${idempotencyBase}:checkout`,
    });

    console.log(
      JSON.stringify(
        {
          paymentRequestId: created.request.id,
          amountCents: created.request.amountCents,
          commissionableAmountCents: created.request.commissionableAmountCents,
          applicationFeeAmountCents: created.request.applicationFeeAmountCents,
          currency: created.request.currency,
          status: created.request.status,
          checkoutUrl: session.checkoutUrl,
          checkoutSessionId: session.checkoutSessionId,
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
