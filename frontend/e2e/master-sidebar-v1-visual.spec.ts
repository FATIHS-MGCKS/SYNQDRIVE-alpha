import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  desktopSidebar,
  openMasterSidebarView,
  saveSidebarScreenshot,
  seedMasterSidebarAuth,
  installMasterSidebarMocks,
} from './master-sidebar-v1-fixtures';

const EVIDENCE_DIR = '/opt/cursor/artifacts/master-sidebar-v1-polish';

const VIEWPORTS: Array<{ name: string; width: number; height: number }> = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-320', width: 320, height: 568 },
  { name: 'landscape-812', width: 812, height: 375 },
];

test.describe.configure({ timeout: 90_000, mode: 'serial' });

test.describe('Master Sidebar V1 — visual evidence', () => {
  test.beforeEach(async ({ page }) => {
    await seedMasterSidebarAuth(page);
    await installMasterSidebarMocks(page);
  });

  test('mounts master shell with sidebar navigation', async ({ page }) => {
    await openMasterSidebarView(page, 'dashboard', { width: 1280, height: 800 });
    await saveSidebarScreenshot(page, 'mount-desktop-1280-light.png', EVIDENCE_DIR);
  });

  for (const vp of VIEWPORTS) {
    test(`screenshot ${vp.name} light dashboard`, async ({ page }) => {
      await openMasterSidebarView(page, 'dashboard', { width: vp.width, height: vp.height, theme: 'light' });
      if (vp.width >= 1024) {
        await saveSidebarScreenshot(page, `${vp.name}-dashboard-light.png`, EVIDENCE_DIR);
      } else {
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `${vp.name}-shell-light.png`),
          fullPage: true,
          animations: 'disabled',
        });
      }
    });
  }

  test('desktop scenarios — accordion, collapse, dark', async ({ page }) => {
    await openMasterSidebarView(page, 'dashboard', { width: 1440, height: 900 });

    await desktopSidebar(page).getByRole('button', { name: /Produkte.*Business/i }).click();
    await saveSidebarScreenshot(page, 'desktop-produkte-open-light.png', EVIDENCE_DIR);

    await page.goto('/master?view=high-mobility', { waitUntil: 'domcontentloaded' });
    await expect(
      desktopSidebar(page).locator('[data-master-nav-parent-toggle="platform-integrations"]'),
    ).toHaveAttribute('aria-expanded', 'true');
    await saveSidebarScreenshot(page, 'desktop-integrations-child-light.png', EVIDENCE_DIR);

    const sidebar = desktopSidebar(page);
    await sidebar.locator('.sq-sidebar-footer__toggle').click();
    await saveSidebarScreenshot(page, 'desktop-collapsed-light.png', EVIDENCE_DIR);
    await sidebar.locator('.sq-sidebar-footer__toggle').click();

    await page.addInitScript(() => {
      localStorage.setItem('synqdrive-theme-preference', 'dark');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(desktopSidebar(page).locator('[data-master-nav-view="dashboard"]')).toBeVisible({ timeout: 60_000 });
    await saveSidebarScreenshot(page, 'desktop-dashboard-dark.png', EVIDENCE_DIR);
  });

  test('geometry measurements on desktop', async ({ page }) => {
    await openMasterSidebarView(page, 'dashboard', { width: 1280, height: 800 });
    const sidebar = desktopSidebar(page);
    const sidebarBox = await sidebar.boundingBox();
    expect(sidebarBox?.width).toBeCloseTo(260, 0);

    const dash = sidebar.locator('[data-master-nav-view="dashboard"]');
    const dashBox = await dash.boundingBox();
    const dashStyles = await dash.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { minHeight: cs.minHeight, gap: cs.gap, fontSize: cs.fontSize, paddingLeft: cs.paddingLeft };
    });

    const metrics = {
      sidebarWidth: sidebarBox?.width,
      dashHeight: dashBox?.height,
      dashStyles,
    };
    await fs.mkdir(EVIDENCE_DIR, { recursive: true });
    await fs.writeFile(path.join(EVIDENCE_DIR, 'geometry-metrics.json'), JSON.stringify(metrics, null, 2));
    expect(Number.parseFloat(dashStyles.minHeight)).toBeGreaterThanOrEqual(36);
  });

  test('axe on desktop sidebar region (full violations, no filter)', async ({ page }) => {
    const summaries: Array<{ theme: string; violations: unknown[] }> = [];
    for (const theme of ['light', 'dark'] as const) {
      await page.addInitScript((t) => {
        localStorage.setItem('synqdrive-theme-preference', t);
      }, theme);
      await openMasterSidebarView(page, 'dashboard', { width: 1280, height: 800, theme });
      const results = await new AxeBuilder({ page }).include('[data-testid="master-sidebar-desktop"]').analyze();
      summaries.push({
        theme,
        violations: results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.map((n) => ({
            html: n.html,
            failureSummary: n.failureSummary,
          })),
        })),
      });
    }
    await fs.writeFile(path.join(EVIDENCE_DIR, 'axe-sidebar-full.json'), JSON.stringify(summaries, null, 2));
    const contrast = summaries.flatMap((s) =>
      (s.violations as { id: string }[]).filter((v) => v.id === 'color-contrast').map((v) => ({ theme: s.theme, ...v })),
    );
    expect(contrast, JSON.stringify(contrast, null, 2)).toEqual([]);
    const allViolations = summaries.flatMap((s) => s.violations as { id: string }[]);
    expect(allViolations, JSON.stringify(allViolations, null, 2)).toEqual([]);
  });

  test('collapsed nav tooltip visible and unclipped on keyboard focus', async ({ page }) => {
    await openMasterSidebarView(page, 'dashboard', { width: 1280, height: 800 });
    const sidebar = desktopSidebar(page);
    await sidebar.locator('.sq-sidebar-footer__toggle').click();
    const supportBtn = sidebar.locator('[data-master-nav-view="support"]');
    await supportBtn.focus();
    const tooltip = supportBtn.locator('.sq-overlay');
    await expect
      .poll(async () => tooltip.evaluate((el) => getComputedStyle(el).opacity))
      .toBe('1');
    const tipBox = await tooltip.boundingBox();
    const shellBox = await sidebar.boundingBox();
    expect(tipBox).toBeTruthy();
    expect(shellBox).toBeTruthy();
    if (tipBox && shellBox) {
      expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(shellBox.x + shellBox.width + 220);
      expect(tipBox.height).toBeGreaterThan(8);
    }
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'collapsed-keyboard-tooltip-focus.png'),
      clip: shellBox ?? undefined,
      animations: 'disabled',
    });
  });

  test('mobile menu open', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/master?view=dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main', { name: 'Master Admin' })).toBeVisible({ timeout: 60_000 });
    const toggle = page.locator('.lg\\:hidden button[aria-controls]').first();
    const panelId = await toggle.getAttribute('aria-controls');
    await toggle.click();
    await expect(page.locator(`#${panelId}`)).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'mobile-390-menu-open-light.png'), fullPage: true });
  });
});