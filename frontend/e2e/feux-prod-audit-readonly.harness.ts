import { test as base, expect, type Page, type Route } from '@playwright/test';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const feuxProdAuditTest = base.extend<{ auditPage: Page }>({
  auditPage: async ({ page }, use) => {
    const baseUrl = process.env.FEUX_PROD_AUDIT_BASE_URL ?? 'https://app.synqdrive.eu';
    await page.route('**/*', async (route: Route) => {
      const method = route.request().method().toUpperCase();
      const url = route.request().url();
      const isApi = url.includes('/api/');
      const isAuthMaint =
        isApi &&
        (url.includes('/api/v1/auth/refresh') ||
          url.includes('/api/v1/auth/logout') ||
          url.includes('/api/v1/auth/mfa/'));
      if (isApi && MUTATING.has(method) && !isAuthMaint) {
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    await page.goto(baseUrl.replace(/\/$/, ''), { waitUntil: 'domcontentloaded' });
    await use(page);
    await expect(page).toHaveURL(new RegExp(baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  },
});

export function isFeuxProdAuditRunArmed(): boolean {
  return (
    process.env.FEUX_PROD_UI_AUDIT_AUTHORIZED === '1' &&
    Boolean(process.env.FEUX_PROD_AUDIT_STORAGE_STATE_PATH)
  );
}