/**
 * Ensures Stripe TEST billing webhook endpoint exists and STRIPE_WEBHOOK_SECRET is set.
 * Run on VPS only — writes secret to backend.env, never logs secret value.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/ensure-stripe-billing-webhook.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import Stripe from 'stripe';
import { STRIPE_BILLING_WEBHOOK_EVENT_TYPES } from '../../src/modules/billing/domain/stripe-webhook-matrix';

const WEBHOOK_URL = 'https://app.synqdrive.eu/api/v1/webhooks/stripe';
const ENV_PATH = process.env.SYNQDRIVE_BACKEND_ENV_PATH ?? '/opt/synqdrive/shared/backend.env';

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function upsertEnvVar(filePath: string, key: string, value: string) {
  const lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').split(/\r?\n/) : [];
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) next.push(`${key}=${value}`);
  fs.writeFileSync(filePath, next.filter((line, idx, arr) => !(idx === arr.length - 1 && line === '')).join('\n') + '\n', {
    mode: 0o600,
  });
}

async function main() {
  loadEnvFile(path.resolve(__dirname, '..', '..', '.env'));
  loadEnvFile(ENV_PATH);

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey?.startsWith('sk_test_')) {
    console.error('Refusing to configure billing webhook without sk_test_ key');
    process.exit(1);
  }

  if (process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) {
    console.log(JSON.stringify({ status: 'already_configured', webhookUrl: WEBHOOK_URL }));
    return;
  }

  const stripe = new Stripe(secretKey);
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const billingEndpoints = existing.data.filter(
    (endpoint) => endpoint.url === WEBHOOK_URL && !endpoint.livemode,
  );

  let endpoint = billingEndpoints[0];
  let signingSecret = endpoint?.secret ?? null;

  if (!signingSecret) {
    for (const duplicate of billingEndpoints) {
      await stripe.webhookEndpoints.del(duplicate.id);
    }
    endpoint = await stripe.webhookEndpoints.create({
      url: WEBHOOK_URL,
      description: 'SynqDrive Billing SaaS testmode (platform subscriptions)',
      enabled_events: [...STRIPE_BILLING_WEBHOOK_EVENT_TYPES],
      connect: false,
    });
    signingSecret = endpoint.secret ?? null;
  }
  if (!signingSecret) {
    console.error('Stripe did not return webhook signing secret — recreate endpoint manually');
    process.exit(1);
  }

  upsertEnvVar(ENV_PATH, 'STRIPE_WEBHOOK_SECRET', signingSecret);
  console.log(
    JSON.stringify({
      status: 'configured',
      webhookId: endpoint.id,
      webhookUrl: endpoint.url,
      livemode: endpoint.livemode,
      envPath: ENV_PATH,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
