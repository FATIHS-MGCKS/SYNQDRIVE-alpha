/**
 * Prompt 4 — partial/full refund via BookingPaymentRefundService.
 * Usage:
 *   E2E_PAYMENT_REQUEST_ID=... E2E_REFUND_CENTS=20000 npx ts-node -r tsconfig-paths/register scripts/ops/stripe-connect-e2e-refund.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { BookingPaymentRefundService } from '../../src/modules/payments/booking-payment-refund.service';

const ORG_ID = process.env.E2E_ORG_ID?.trim() || 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const PAYMENT_REQUEST_ID = process.env.E2E_PAYMENT_REQUEST_ID?.trim();
const REFUND_CENTS = process.env.E2E_REFUND_CENTS ? Number(process.env.E2E_REFUND_CENTS) : undefined;

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
  if (!PAYMENT_REQUEST_ID) throw new Error('E2E_PAYMENT_REQUEST_ID required');

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const refunds = app.get(BookingPaymentRefundService);

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

    const idempotencyKey = `e2e-refund:${PAYMENT_REQUEST_ID}:${REFUND_CENTS ?? 'full'}:${Date.now()}`;
    const result = await refunds.refundPaymentRequest({
      organizationId: ORG_ID,
      paymentRequestId: PAYMENT_REQUEST_ID,
      actor,
      idempotencyKey,
      amountCents: REFUND_CENTS,
      reason: 'E2E testmode refund',
    });

    console.log(
      JSON.stringify(
        {
          step: 'refund',
          paymentRequestId: PAYMENT_REQUEST_ID,
          refundAmountCents: result.refundAmountCents,
          applicationFeeRefundCents: result.applicationFeeRefundCents,
          stripeRefundId: result.stripeRefundId,
          requestStatus: result.request.status,
          idempotentReplay: result.idempotentReplay,
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
