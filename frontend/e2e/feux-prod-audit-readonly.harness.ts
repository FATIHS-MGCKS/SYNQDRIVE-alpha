import { test as base, expect, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const DEFAULT_APPROVED_ORIGINS = ['https://app.synqdrive.eu'] as const;

const AUTH_SESSION_MAINT_PREFIXES = [
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/login',
  '/api/v1/auth/mfa/challenge',
  '/api/v1/auth/mfa/verify',
] as const;

export function parseApprovedOrigins(): string[] {
  const raw = process.env.FEUX_PROD_AUDIT_APPROVED_ORIGINS;
  if (!raw) return [...DEFAULT_APPROVED_ORIGINS];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolveFeuxProdAuditBaseUrl(): string {
  const baseUrl = (process.env.FEUX_PROD_AUDIT_BASE_URL ?? DEFAULT_APPROVED_ORIGINS[0]).replace(
    /\/$/,
    '',
  );
  assertFeuxProdAuditOriginApproved(baseUrl);
  return baseUrl;
}

export function assertFeuxProdAuditOriginApproved(baseUrl: string): void {
  const parsed = new URL(baseUrl);
  const host = parsed.hostname;
  if (process.env.FEUX_PROD_UI_AUDIT_AUTHORIZED === '1') {
    if (host === 'localhost' || host === '127.0.0.1') {
      throw new Error('FEUX prod audit mode refuses local dev origin');
    }
  }
  const origin = parsed.origin;
  const approved = parseApprovedOrigins();
  if (!approved.some((a) => new URL(a).origin === origin)) {
    throw new Error(`FEUX prod audit origin not approved: ${origin}`);
  }
}

export function resolveStorageStatePath(): string | undefined {
  const path = process.env.FEUX_PROD_AUDIT_STORAGE_STATE_PATH;
  if (!path) return undefined;
  return path;
}

export function assertStorageStateConfigured(): void {
  const path = resolveStorageStatePath();
  if (!path) {
    throw new Error('FEUX_PROD_AUDIT_STORAGE_STATE_PATH is required for armed prod audit runs');
  }
  if (!fs.existsSync(path)) {
    throw new Error(`FEUX prod audit storageState file missing: ${path}`);
  }
}

function isAuthSessionMaintenanceUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    return AUTH_SESSION_MAINT_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  } catch {
    return false;
  }
}

export function isFeuxProdAuditRunArmed(): boolean {
  return (
    process.env.FEUX_PROD_UI_AUDIT_AUTHORIZED === '1' &&
    Boolean(process.env.FEUX_PROD_AUDIT_STORAGE_STATE_PATH)
  );
}

export const feuxProdAuditTest = base.extend<{ auditPage: Page }>({
  auditPage: async ({ page }, use) => {
    if (isFeuxProdAuditRunArmed()) {
      assertStorageStateConfigured();
    }
    const baseUrl = resolveFeuxProdAuditBaseUrl();
    await page.route('**/*', async (route: Route) => {
      const method = route.request().method().toUpperCase();
      const url = route.request().url();
      const isApi = url.includes('/api/');
      const isAuthMaint = isApi && isAuthSessionMaintenanceUrl(url);
      if (isApi && MUTATING.has(method) && !isAuthMaint) {
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await use(page);
    await expect(page).toHaveURL(new RegExp(baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  },
});