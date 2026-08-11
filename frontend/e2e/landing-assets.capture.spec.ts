/**
 * Captures product screenshots for the public marketing site (landingpage/).
 *
 * Every view is rendered from the real SynqDrive frontend against mocked API
 * responses for one synthetic demo tenant (see landing-demo-tenant.ts). No
 * production database, no production tenant and therefore no personal data is
 * involved.
 *
 * Run: npm run capture:landing-assets
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

import { demoTenantUser, installDemoTenantMocks } from './landing-demo-tenant';

/** Repo-root relative, so the run directory does not matter. */
const RAW_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
  'landingpage',
  'assets-raw',
);

async function seedSession(page: Page, token: string, extra?: Record<string, string>) {
  await page.addInitScript(
    ({ t, u, kv }) => {
      localStorage.setItem('synqdrive_token', t);
      localStorage.setItem('synqdrive_user', JSON.stringify(u));
      localStorage.setItem('synqdrive.locale', 'en');
      localStorage.setItem('synqdrive-theme-preference', 'light');
      Object.entries(kv ?? {}).forEach(([k, v]) => sessionStorage.setItem(k, v));
    },
    { t: token, u: demoTenantUser, kv: extra ?? {} },
  );
}

async function openRental(page: Page, extra?: Record<string, string>) {
  await seedSession(page, 'landing-capture', extra);
  await installDemoTenantMocks(page);
  await page.goto('/rental', { waitUntil: 'load' });
  await page
    .getByRole('button', { name: /^Dashboard$/ })
    .first()
    .waitFor({ state: 'visible', timeout: 45_000 });
}

const desktopSidebar = (page: Page) => page.locator('div.hidden.lg\\:flex').first();

async function expandSidebarSection(page: Page, label: string) {
  const header = desktopSidebar(page)
    .getByRole('button', { name: new RegExp(`^${label}`) })
    .first();
  if (!(await header.isVisible().catch(() => false))) return;
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await page.waitForTimeout(400);
}

async function clickSidebarNav(page: Page, label: string) {
  await desktopSidebar(page)
    .getByRole('button', { name: new RegExp(`^${label}$`) })
    .first()
    .click();
}

/** Freeze animations and blinking indicators before capturing. */
async function settle(page: Page, ms = 1_400) {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      caret-color: transparent !important;
    }`,
  });
  await page.waitForTimeout(ms);
}

type Clip = { x: number; y: number; width: number; height: number };

async function capture(page: Page, name: string, clip?: Clip) {
  await fs.mkdir(RAW_DIR, { recursive: true });
  const buffer = await page.screenshot({ animations: 'disabled', clip });
  await fs.writeFile(path.join(RAW_DIR, `${name}.png`), buffer);
}

/** Bounding box of the content column (viewport minus the desktop sidebar). */
async function contentClip(page: Page): Promise<Clip> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('viewport missing');
  const box = await desktopSidebar(page).boundingBox();
  const left = box ? Math.round(box.x + box.width) : 0;
  return { x: left, y: 0, width: viewport.width - left, height: viewport.height };
}

/** Tight clip around a single element, with breathing room. */
async function elementClip(page: Page, selector: string, pad = 16): Promise<Clip> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('viewport missing');
  const x = Math.max(0, Math.round(box.x - pad));
  const y = Math.max(0, Math.round(box.y - pad));
  return {
    x,
    y,
    width: Math.min(viewport.width - x, Math.round(box.width + pad * 2)),
    height: Math.min(viewport.height - y, Math.round(box.height + pad * 2)),
  };
}

test.describe('landing product assets', () => {
  test('operations dashboard', async ({ page }) => {
    await openRental(page);
    await settle(page, 3_200);
    await capture(page, 'operations-dashboard');
    await capture(page, 'operations-dashboard-content', await contentClip(page));
  });

  test('fleet command with live telemetry', async ({ page }) => {
    // Wider viewport so the vehicle list column is roomy enough to render its
    // status filters in full instead of clipping the last one.
    await page.setViewportSize({ width: 1720, height: 940 });
    await openRental(page, { synqdrive_rental_fleet_tab: 'status' });
    await clickSidebarNav(page, 'Fleet');
    await expect(page.getByRole('heading', { name: /^Fleet$/ })).toBeVisible({ timeout: 45_000 });
    await page
      .getByRole('button', { name: /^All\s+\d+$/ })
      .first()
      .click()
      .catch(() => undefined);
    await settle(page, 2_600);
    await capture(page, 'fleet-command', await contentClip(page));
  });

  test('bookings workspace', async ({ page }) => {
    // Taller viewport so the whole fleet plan fits into one frame.
    await page.setViewportSize({ width: 1440, height: 1300 });
    await openRental(page);
    await clickSidebarNav(page, 'Bookings');
    await expect(page.getByRole('button', { name: 'BK-104821' })).toBeVisible({ timeout: 45_000 });
    await settle(page, 2_600);
    await capture(page, 'bookings-timeline', await contentClip(page));

    await page.getByRole('button', { name: 'Table' }).click();
    await expect(page.getByText('Lindberg Bau GmbH').first()).toBeVisible({ timeout: 30_000 });
    await settle(page, 2_000);
    await capture(page, 'bookings-table', await contentClip(page));
  });

  test('fleet condition and service', async ({ page }) => {
    await openRental(page, { synqdrive_rental_fleet_tab: 'condition-service' });
    await clickSidebarNav(page, 'Fleet');
    await expect(page.getByRole('heading', { name: /^Fleet$/ })).toBeVisible({ timeout: 45_000 });
    await page
      .getByRole('tab', { name: /Condition/ })
      .first()
      .click()
      .catch(() => undefined);
    await settle(page, 2_600);
    await capture(page, 'fleet-condition', await contentClip(page));
  });

  test('ai assistant', async ({ page }) => {
    await openRental(page);
    await clickSidebarNav(page, 'AI Assistant');
    await expect(page.getByTestId('ai-assistant-root')).toBeVisible({ timeout: 45_000 });
    await settle(page, 2_400);
    await capture(page, 'ai-assistant', await contentClip(page));
  });

  test('workflow automation', async ({ page }) => {
    await openRental(page);
    await expandSidebarSection(page, 'Automation');
    await clickSidebarNav(page, 'Workflow Automation');
    await expect(page.getByText('Return damage check').first()).toBeVisible({ timeout: 45_000 });
    await settle(page, 2_600);
    await capture(page, 'workflow-automation', await contentClip(page));
  });

  test('customer communication', async ({ page }) => {
    // Taller viewport so the inbox, thread and context column fit into one frame.
    await page.setViewportSize({ width: 1440, height: 1150 });
    await openRental(page);
    await expandSidebarSection(page, 'Automation');
    await clickSidebarNav(page, 'WhatsApp Business');
    await expect(page.getByText('Lindberg Bau GmbH').first()).toBeVisible({ timeout: 45_000 });
    await settle(page, 3_000);
    await capture(page, 'customer-communication');

    await page.getByRole('button', { name: /^Inbox/ }).first().click();
    await page.getByText('Perfect, see you at 10:00.').first().click();
    await expect(page.getByText('BK-104821').first()).toBeVisible({ timeout: 30_000 });
    await settle(page, 2_600);
    await capture(page, 'customer-communication-inbox');
  });
});

export type { Clip };
export { elementClip };
