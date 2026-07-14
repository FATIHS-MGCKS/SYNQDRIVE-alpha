/**
 * Prompt 4 — pay an open Connect Checkout Session with Stripe test card (API).
 * Usage:
 *   E2E_CHECKOUT_SESSION_ID=cs_test_... npx ts-node -r tsconfig-paths/register scripts/ops/stripe-connect-e2e-pay-checkout.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';

const ORG_ID = process.env.E2E_ORG_ID?.trim() || 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const CHECKOUT_SESSION_ID = process.env.E2E_CHECKOUT_SESSION_ID?.trim();
const PAYMENT_REQUEST_ID = process.env.E2E_PAYMENT_REQUEST_ID?.trim();

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
  if (!CHECKOUT_SESSION_ID && !PAYMENT_REQUEST_ID) {
    throw new Error('E2E_CHECKOUT_SESSION_ID or E2E_PAYMENT_REQUEST_ID required');
  }
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY required');

  const prisma = new PrismaClient();
  const stripe = new Stripe(secretKey);

  try {
    const account = await prisma.organizationPaymentAccount.findFirst({
      where: { organizationId: ORG_ID },
    });
    if (!account?.stripeConnectedAccountId) {
      throw new Error('No connected account for org');
    }

    const connectedAccountId = account.stripeConnectedAccountId;
    const pr = PAYMENT_REQUEST_ID
      ? await prisma.bookingPaymentRequest.findFirst({
          where: { id: PAYMENT_REQUEST_ID, organizationId: ORG_ID },
        })
      : await prisma.bookingPaymentRequest.findFirst({
          where: {
            organizationId: ORG_ID,
            stripeCheckoutSessionId: CHECKOUT_SESSION_ID,
          },
        });

    const checkoutSessionId = CHECKOUT_SESSION_ID ?? pr?.stripeCheckoutSessionId ?? undefined;
    if (!checkoutSessionId) throw new Error('Checkout session id not found');

    const session = await stripe.checkout.sessions.retrieve(
      checkoutSessionId,
      { expand: ['payment_intent'] },
      { stripeAccount: connectedAccountId },
    );

    let paymentIntentId =
      pr?.stripePaymentIntentId
      ?? (typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null);

    if (!paymentIntentId) {
      throw new Error(
        'No payment_intent on checkout session — open checkout URL once or recreate session',
      );
    }

    const pm = await stripe.paymentMethods.create(
      { type: 'card', card: { token: 'tok_visa' } },
      { stripeAccount: connectedAccountId },
    );
    const paid = await stripe.paymentIntents.confirm(
      paymentIntentId,
      { payment_method: pm.id },
      { stripeAccount: connectedAccountId },
    );

    console.log(
      JSON.stringify(
        {
          step: 'checkout_paid',
          checkoutSessionId,
          paymentRequestId: pr?.id ?? null,
          connectedAccountId,
          paymentIntentId: paid.id,
          status: paid.status,
          amount: paid.amount,
          metadata: paid.metadata,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
  process.exit(0);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
