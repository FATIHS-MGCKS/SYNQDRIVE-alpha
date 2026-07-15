/**
 * Replay a Stripe **platform SaaS billing** webhook event to the ingest endpoint.
 *
 * Test mode only — requires sk_test_* and whsec_* from Stripe CLI or Dashboard.
 *
 * Usage:
 *   E2E_STRIPE_EVENT_ID=evt_... npm run billing:sandbox:replay-webhook
 *   E2E_WEBHOOK_URL=http://localhost:3000/api/v1/webhooks/stripe npm run billing:sandbox:replay-webhook
 *   E2E_FIXTURE_FILE=invoice.paid.json npm run billing:sandbox:replay-webhook
 */
import * as fs from 'fs';
import * as path from 'path';
import Stripe from 'stripe';

const EVENT_ID = process.env.E2E_STRIPE_EVENT_ID?.trim();
const FIXTURE_FILE = process.env.E2E_FIXTURE_FILE?.trim();
const WEBHOOK_URL =
  process.env.E2E_WEBHOOK_URL?.trim() || 'http://localhost:3000/api/v1/webhooks/stripe';
const SANDBOX_ORG_ID = process.env.E2E_BILLING_ORG_ID?.trim() || 'org-sandbox-billing-e2e';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function assertTestKey(secretKey: string) {
  if (!secretKey.startsWith('sk_test_')) {
    throw new Error('Sandbox replay requires STRIPE_SECRET_KEY=sk_test_* — live keys rejected');
  }
}

function loadFixtureEvent(): Stripe.Event {
  const fixturePath = path.resolve(
    __dirname,
    '..',
    'src',
    'modules',
    'billing',
    '__fixtures__',
    'stripe-sandbox',
    'events',
    FIXTURE_FILE!,
  );
  const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as Stripe.Event;
  if (raw.livemode) throw new Error('Fixture must be test mode');
  const object = raw.data?.object as unknown as Record<string, unknown> | undefined;
  if (object && typeof object === 'object') {
    const metadata =
      typeof object.metadata === 'object' && object.metadata !== null
        ? { ...(object.metadata as Record<string, string>) }
        : {};
    object.metadata = { ...metadata, synqdriveOrganizationId: SANDBOX_ORG_ID };
  }
  return raw;
}

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secretKey || !webhookSecret) {
    throw new Error('STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET required');
  }
  assertTestKey(secretKey);

  const stripe = new Stripe(secretKey);
  let event: Stripe.Event;

  if (FIXTURE_FILE) {
    event = loadFixtureEvent();
  } else if (EVENT_ID) {
    event = await stripe.events.retrieve(EVENT_ID);
    if (event.livemode) {
      throw new Error(`Event ${EVENT_ID} is livemode — sandbox replay aborted`);
    }
  } else {
    throw new Error('Set E2E_STRIPE_EVENT_ID or E2E_FIXTURE_FILE');
  }

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
        step: 'billing_webhook_replay',
        mode: 'test',
        source: FIXTURE_FILE ? 'fixture' : 'stripe_api',
        eventId: event.id,
        eventType: event.type,
        webhookUrl: WEBHOOK_URL,
        organizationId: SANDBOX_ORG_ID,
        status: response.status,
        body: body.slice(0, 500),
      },
      null,
      2,
    ),
  );
  if (!response.ok) process.exit(1);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
