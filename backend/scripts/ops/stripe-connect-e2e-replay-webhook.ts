/**
 * Replay a Stripe Connect webhook event to the local/public ingest endpoint.
 * Usage:
 *   E2E_STRIPE_EVENT_ID=evt_... npx ts-node -r tsconfig-paths/register scripts/ops/stripe-connect-e2e-replay-webhook.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import Stripe from 'stripe';

const EVENT_ID = process.env.E2E_STRIPE_EVENT_ID?.trim();
const WEBHOOK_URL =
  process.env.E2E_WEBHOOK_URL?.trim() || 'https://app.synqdrive.eu/api/v1/webhooks/stripe-connect';
const CONNECTED_ACCOUNT_ID = process.env.E2E_CONNECTED_ACCOUNT_ID?.trim();

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
  if (!EVENT_ID) throw new Error('E2E_STRIPE_EVENT_ID required');
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim();
  if (!secretKey || !webhookSecret) {
    throw new Error('STRIPE_SECRET_KEY and STRIPE_CONNECT_WEBHOOK_SECRET required');
  }

  const stripe = new Stripe(secretKey);
  const event = CONNECTED_ACCOUNT_ID
    ? await stripe.events.retrieve(EVENT_ID, { stripeAccount: CONNECTED_ACCOUNT_ID })
    : await stripe.events.retrieve(EVENT_ID);

  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
  });

  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
    body: payload,
  });

  const body = await response.text();
  console.log(
    JSON.stringify(
      {
        step: 'webhook_replay',
        eventId: EVENT_ID,
        status: response.status,
        body: body.slice(0, 500),
      },
      null,
      2,
    ),
  );
  if (!response.ok) process.exit(1);
  process.exit(0);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
