import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const SANDBOX_ORG_METADATA_KEY = 'synqdriveOrganizationId';
export const SANDBOX_TEST_ORG_ID = 'org-sandbox-billing-e2e';

const FIXTURES_DIR = resolve(__dirname, '__fixtures__', 'stripe-sandbox', 'events');

export interface StripeSandboxEventFixture {
  id: string;
  object: 'event';
  type: string;
  created: number;
  livemode: false;
  data: {
    object: Record<string, unknown>;
  };
}

export function loadStripeSandboxFixture(filename: string): StripeSandboxEventFixture {
  const path = resolve(FIXTURES_DIR, filename);
  if (!existsSync(path)) {
    throw new Error(`Stripe sandbox fixture not found: ${filename}`);
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as StripeSandboxEventFixture;
  if (raw.livemode !== false) {
    throw new Error(`Fixture ${filename} must be test mode (livemode: false)`);
  }
  return raw;
}

export function withSandboxOrgMetadata(
  fixture: StripeSandboxEventFixture,
  organizationId = SANDBOX_TEST_ORG_ID,
): StripeSandboxEventFixture {
  const object = fixture.data.object;
  const metadata =
    typeof object.metadata === 'object' && object.metadata !== null
      ? { ...(object.metadata as Record<string, string>) }
      : {};

  return {
    ...fixture,
    data: {
      object: {
        ...object,
        metadata: {
          ...metadata,
          [SANDBOX_ORG_METADATA_KEY]: organizationId,
        },
      },
    },
  };
}

export function assertTestModeStripeKey(secretKey: string | undefined): void {
  const key = secretKey?.trim() ?? '';
  if (key.startsWith('sk_live_')) {
    throw new Error('Live Stripe keys are not allowed in sandbox E2E');
  }
  if (!key.startsWith('sk_test_')) {
    throw new Error('Stripe sandbox requires sk_test_* keys only — live keys are rejected');
  }
}
