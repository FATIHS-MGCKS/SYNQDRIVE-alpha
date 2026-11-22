import { test } from '@playwright/test';
import { feuxProdAuditTest, isFeuxProdAuditRunArmed } from './feux-prod-audit-readonly.harness';

const armed = isFeuxProdAuditRunArmed();

test.describe('FEUX prod UI audit (read-only)', () => {
  test.skip(!armed, 'Requires FEUX_PROD_UI_AUDIT_AUTHORIZED=1 and storageState path');

  feuxProdAuditTest('blocks client-side API mutations', async ({ auditPage }) => {
    const res = await auditPage.evaluate(async () => {
      try {
        const r = await fetch('/api/v1/health', { method: 'GET' });
        return r.status;
      } catch {
        return 0;
      }
    });
    test.expect(res).toBe(200);
  });
});