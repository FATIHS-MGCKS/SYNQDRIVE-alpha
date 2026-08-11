/**
 * Visual and behavioural QA for the public marketing site (landingpage/).
 *
 * Runs against the built static output served on 127.0.0.1:4321:
 *   node landingpage/tools/build-site.mjs
 *   (cd landingpage/dist && python3 -m http.server 4321 --bind 127.0.0.1)
 *
 * Run: npx playwright test --config playwright.landing-qa.config.ts
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
  'landingpage',
  'qa',
);

const WIDTHS = [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920];

/** Every section the brief requires, in page order. */
const SECTION_IDS = [
  'platform',
  'vehicle-intelligence',
  'ai-orchestration',
  'workflow-automation',
  'communication',
  'integrations',
  'contact',
];

async function collectProblems(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) =>
    failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? ''}`),
  );
  page.on('response', (response) => {
    if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
  });

  return { consoleErrors, failedRequests };
}

/**
 * Scrolls the whole page so every reveal observer and every lazy image fires,
 * then returns to the top. The scroll must be instant: the page sets
 * `scroll-behavior: smooth`, and animated jumps would lag far behind the loop,
 * leaving the lower sections at their pre-reveal opacity.
 */
async function settle(page: Page) {
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise((resolve) => setTimeout(resolve, 90));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  // Reveal transitions run 620ms plus up to 240ms of stagger delay.
  await page.waitForTimeout(1100);
}

/** Set LANDING_QA_LABEL so an acceptance run does not overwrite the local set. */
const LABEL = process.env.LANDING_QA_LABEL ? `${process.env.LANDING_QA_LABEL}-` : '';

async function shoot(page: Page, name: string) {
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({
    path: path.join(OUT, `${LABEL}${name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
}

test.describe('public landing page', () => {
  for (const locale of ['de', 'en'] as const) {
    const url = locale === 'de' ? '/' : '/en/';

    test(`${locale}: structure, links and metadata`, async ({ page }) => {
      const { consoleErrors, failedRequests } = await collectProblems(page);
      await page.goto(url, { waitUntil: 'load' });

      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://synqdrive.eu${url}`,
      );
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        'content',
        /SynqDrive/,
      );
      await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
        'content',
        'summary_large_image',
      );
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveCount(1);

      // Exactly one h1, and every required section present.
      await expect(page.locator('h1')).toHaveCount(1);
      for (const id of SECTION_IDS) {
        await expect(page.locator(`#${id}`)).toHaveCount(1);
      }

      // No heading level is skipped.
      const levels = await page.$$eval('h1, h2, h3', (nodes) =>
        nodes.map((node) => Number(node.tagName.slice(1))),
      );
      let previous = 0;
      for (const level of levels) {
        expect(level - previous).toBeLessThanOrEqual(1);
        previous = Math.max(previous, level);
      }

      // Every image has non-empty alt text and intrinsic dimensions, and every
      // eager image (the hero, the logos) has already decoded at load.
      const images = await page.$$eval('img', (nodes) =>
        nodes.map((node) => ({
          alt: node.getAttribute('alt'),
          width: node.getAttribute('width'),
          height: node.getAttribute('height'),
          lazy: node.getAttribute('loading') === 'lazy',
          loaded: (node as HTMLImageElement).naturalWidth > 0,
          src: node.getAttribute('src'),
        })),
      );
      expect(images.length).toBeGreaterThan(0);
      for (const image of images) {
        expect(image.alt, `alt for ${image.src}`).toBeTruthy();
        expect(image.width, `width for ${image.src}`).toBeTruthy();
        expect(image.height, `height for ${image.src}`).toBeTruthy();
        if (!image.lazy) expect(image.loaded, `eager image loaded: ${image.src}`).toBe(true);
      }

      // Internal anchors must resolve, external targets must be the known hosts.
      const hrefs = await page.$$eval('a[href]', (nodes) =>
        nodes.map((node) => node.getAttribute('href') as string),
      );
      for (const href of hrefs) {
        if (href.startsWith('#')) {
          await expect(page.locator(href), `anchor ${href}`).toHaveCount(1);
        } else if (href.startsWith('http')) {
          expect(href, `external ${href}`).toMatch(/^https:\/\/app\.synqdrive\.eu/);
        } else if (!href.startsWith('mailto:')) {
          expect(['/', '/en/'], `relative ${href}`).toContain(href);
        }
      }

      // Demo call to action reaches a real contact channel.
      const demo = page.locator('a[href^="mailto:info@synqdrive.eu"]').first();
      await expect(demo).toHaveCount(1);

      // No em dash or en dash anywhere in rendered text.
      const dashes = await page.evaluate(() => {
        const text = document.body.innerText;
        return (text.match(/[\u2014\u2013]/g) ?? []).length;
      });
      expect(dashes).toBe(0);

      await settle(page);

      // Scrolling the whole page has triggered every lazy image, so all of them
      // resolve to a real file rather than a 404.
      await expect
        .poll(
          () =>
            page.$$eval('img', (nodes) =>
              nodes
                .filter((node) => (node as HTMLImageElement).naturalWidth === 0)
                .map((node) => node.getAttribute('src') as string),
            ),
          { timeout: 10_000 },
        )
        .toEqual([]);

      // Nothing may still be sitting at its pre-reveal opacity once the page has
      // been scrolled end to end, otherwise a section renders blank.
      const unrevealed = await page.$$eval('[data-reveal]', (nodes) =>
        nodes
          .filter((node) => Number(window.getComputedStyle(node).opacity) < 0.99)
          .map(
            (node) =>
              `${node.closest('section')?.id ?? 'hero'} ${node.tagName.toLowerCase()}.${node.className}`,
          ),
      );
      expect(unrevealed, unrevealed.join('\n')).toEqual([]);

      expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
      expect(failedRequests, failedRequests.join('\n')).toEqual([]);
    });

    test(`${locale}: no horizontal overflow across breakpoints`, async ({ page }) => {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url, { waitUntil: 'load' });
        await settle(page);

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          offenders: Array.prototype.slice
            .call(document.querySelectorAll('body *'))
            .filter((node) => {
              const rect = (node as HTMLElement).getBoundingClientRect();
              return rect.right > document.documentElement.clientWidth + 1 && rect.width > 0;
            })
            .slice(0, 5)
            .map((node) => {
              const el = node as HTMLElement;
              return `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 90);
            }),
        }));

        expect(
          overflow.scrollWidth,
          `${width}px overflow, offenders: ${overflow.offenders.join(' | ')}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1);
      }
    });

    test(`${locale}: touch targets are large enough on mobile`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(url, { waitUntil: 'load' });
      await settle(page);

      const small = await page.$$eval('a, button', (nodes) =>
        nodes
          .filter((node) => {
            const rect = node.getBoundingClientRect();
            const style = window.getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            return rect.width > 0 && rect.height > 0 && rect.height < 32;
          })
          .map((node) => `${node.tagName.toLowerCase()}.${node.className}: ${Math.round(node.getBoundingClientRect().height)}px`),
      );
      expect(small, small.join('\n')).toEqual([]);
    });
  }

  test('platform dropdown works by pointer and keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'load' });

    const trigger = page.getByRole('button', { name: /Plattform/ });
    const menuItem = page.getByRole('link', { name: 'Vernetzte Fahrzeugintelligenz' }).first();

    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(menuItem).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.click();
    await menuItem.click();
    await expect(page).toHaveURL(/#vehicle-intelligence$/);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('mobile drawer opens, navigates and closes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'load' });

    const toggle = page.locator('[data-nav-toggle]');
    await expect(toggle).toBeVisible();
    await expect(page.locator('[data-nav-panel]')).toBeHidden();

    await toggle.click();
    await expect(page.locator('[data-nav-panel]')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await page.locator('[data-nav-panel]').getByRole('link', { name: 'Integrationen' }).click();
    await expect(page.locator('[data-nav-panel]')).toBeHidden();
    await expect(page).toHaveURL(/#integrations$/);
  });

  test('language switch moves between locales', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'load' });
    await page.locator('.locale-switch').click();
    await expect(page).toHaveURL(/\/en\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.locator('.locale-switch').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });

  test('layout stays stable while images load', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'commit' });

    const shift = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as unknown as Array<{
              value: number;
              hadRecentInput: boolean;
            }>) {
              if (!entry.hadRecentInput) total += entry.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => resolve(total), 3500);
        }),
    );

    expect(shift).toBeLessThan(0.1);
  });

  test('captures reference screenshots', async ({ page }) => {
    for (const [name, width, height] of [
      ['desktop-1440-de', 1440, 900],
      ['mobile-390-de', 390, 844],
    ] as Array<[string, number, number]>) {
      await page.setViewportSize({ width, height });
      await page.goto('/', { waitUntil: 'load' });
      await settle(page);
      await shoot(page, name);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/en/', { waitUntil: 'load' });
    await settle(page);
    await shoot(page, 'desktop-1440-en');
  });
});
