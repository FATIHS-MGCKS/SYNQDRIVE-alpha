import { test } from '@playwright/test';
import { feuxProdAuditTest, isFeuxProdAuditRunArmed } from './feux-prod-audit-readonly.harness';

const armed = isFeuxProdAuditRunArmed();

test.describe('FEUX prod UI audit (read-only)', () => {
  test.skip(!armed, 'Requires FEUX_PROD_UI_AUDIT_AUTHORIZED=1 and storageState path');

  feuxProdAuditTest('defense-in-depth blocks client-side business POST', async ({ auditPage }) => {
    const outcome = await auditPage.evaluate(async () => {
      try {
        const r = await fetch('/api/v1/organizations/test-org/bookings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ probe: true }),
        });
        return { blocked: false, status: r.status };
      } catch (err) {
        return { blocked: true, status: 0, message: String(err) };
      }
    });
    test.expect(outcome.blocked).toBe(true);
  });
});