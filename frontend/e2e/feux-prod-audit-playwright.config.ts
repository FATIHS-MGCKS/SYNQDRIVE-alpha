import { defineConfig } from '@playwright/test';
import {
  assertFeuxProdAuditOriginApproved,
  isFeuxProdAuditRunArmed,
  resolveFeuxProdAuditBaseUrl,
  resolveStorageStatePath,
} from './feux-prod-audit-readonly.harness';

const baseURL = process.env.FEUX_PROD_AUDIT_BASE_URL
  ? resolveFeuxProdAuditBaseUrl()
  : 'https://app.synqdrive.eu';

if (process.env.FEUX_PROD_AUDIT_BASE_URL) {
  assertFeuxProdAuditOriginApproved(baseURL);
}

export default defineConfig({
  testDir: '.',
  testMatch: ['feux-prod-audit-readonly.spec.ts', 'feux-prod-audit-readonly.harness.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    storageState: isFeuxProdAuditRunArmed() ? resolveStorageStatePath() : undefined,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    browserName: 'chromium',
  },
});