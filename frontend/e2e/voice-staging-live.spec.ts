/**
 * Manual live staging call scenarios (Prompt 10B).
 * Skipped unless VOICE_E2E_ALLOW_LIVE_CALLS=true and allowlist is configured.
 *
 * These tests do NOT place calls in CI — they document the safety gate only.
 */
import { test } from '@playwright/test';

const liveEnabled = process.env.VOICE_E2E_ALLOW_LIVE_CALLS === 'true';
const allowlistConfigured = Boolean(process.env.VOICE_E2E_ALLOWLIST_E164?.trim());

test.describe('Voice staging live calls (manual only)', () => {
  test.skip(!liveEnabled || !allowlistConfigured, 'Requires VOICE_E2E_ALLOW_LIVE_CALLS=true and VOICE_E2E_ALLOWLIST_E164');

  test('inbound greeting checklist — operator executes manually', async () => {
    test.info().annotations.push({
      type: 'manual',
      description: 'Call staging DID; verify greeting, synthetic customer lookup, booking query, staff fallback.',
    });
  });

  test('outbound no-answer checklist — operator executes manually', async () => {
    test.info().annotations.push({
      type: 'manual',
      description: 'Initiate outbound to allowlisted test handset; verify no-answer handling and usage ledger.',
    });
  });
});
