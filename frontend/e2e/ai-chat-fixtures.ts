import { expect, type Page } from '@playwright/test';

import { assertNoHorizontalOverflow } from './document-upload-fixtures';

export { assertNoHorizontalOverflow };

export const AI_CHAT_E2E_ORG_ID = 'org-ai-chat-e2e';

export const mockUser = {
  id: 'user-ai-chat-e2e',
  email: 'ai-chat@synqdrive.eu',
  name: 'AI Chat E2E',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: AI_CHAT_E2E_ORG_ID,
  organizationName: 'AI Chat E2E GmbH',
  organizationLogoUrl: null,
  permissions: {
    chat: { read: true, write: true, manage: true },
    fleet: { read: true, write: true, manage: true },
    bookings: { read: true, write: true, manage: true },
    tasks: { read: true, write: true, manage: true },
  },
};

const LONG_URL = 'https://example.com/fleet/vehicles/very-long-vehicle-id-12345678901234567890/path';

const longHealthStructured = {
  responseType: 'HEALTH_SUMMARY',
  vehicle: { displayName: 'VW Golf Langversion Flottenfahrzeug', licensePlate: 'B-XY-1234-LANG' },
  dataFreshness: {
    freshness: 'live',
    observedAt: '2026-07-24T10:00:00.000Z',
    isLastKnown: false,
    label: null,
  },
  sources: [{ label: 'Fahrzeug-Gesundheit' }, { label: 'Telemetrie-Signale' }],
  warnings: ['Begrenzte Datenlage für Reifendrucksensoren auf der Hinterachse'],
  partial: false,
  generatedAt: '2026-07-24T10:05:00.000Z',
  usedDeterministicFallback: false,
  compactSummary: {
    headline: 'Gesundheitsübersicht mit mehreren Warnungen und langen Werten',
    statusTone: 'warning',
    facts: [
      { id: 'brakes', label: 'Bremsen Vorder-/Hinterachse', value: 'Vorderachse 4.2mm / Hinterachse 3.1mm — Warnung', tone: 'warning' },
      { id: 'tires', label: 'Reifen VL / VR / HL / HR', value: '6.2mm / 5.8mm / 4.9mm / 4.7mm', tone: 'neutral' },
      { id: 'battery', label: 'Batterie SoH letzte Messung', value: '87% am 2026-07-20T10:00:00.000Z', tone: 'info' },
      { id: 'oil', label: 'Ölwechsel fällig', value: 'in 1.200 km oder 14 Tagen', tone: 'warning' },
      { id: 'service', label: 'Service Inspektion', value: 'überfällig seit 12 Tagen', tone: 'critical' },
      { id: 'url', label: 'Detailseite', value: LONG_URL, tone: 'neutral' },
    ],
  },
};

const longOverdueStructured = {
  responseType: 'OVERDUE_EXPLANATION',
  vehicle: { displayName: 'Mercedes E-Klasse Lang', licensePlate: 'M-AB-9999' },
  dataFreshness: {
    freshness: 'stale',
    observedAt: '2026-07-23T08:00:00.000Z',
    isLastKnown: true,
    label: 'Letzte bekannte Buchungsdaten',
  },
  sources: [{ label: 'Buchungskalender' }, { label: 'Aufgaben-Workflow' }],
  warnings: ['Teilweise Datenlage — Rückgabe nicht bestätigt'],
  partial: true,
  generatedAt: '2026-07-24T09:00:00.000Z',
  usedDeterministicFallback: true,
  compactSummary: {
    headline: 'Überfällige Rückgabe mit ausführlicher Erklärung',
    statusTone: 'critical',
    facts: [
      { id: 'booking', label: 'Buchungsnummer', value: 'BK-2026-009871234567890-LANG', tone: 'neutral' },
      { id: 'customer', label: 'Kunde', value: 'Anna Schmidt mit sehr langem Nachnamen GmbH', tone: 'neutral' },
      { id: 'due', label: 'Fällig seit', value: '3 Tagen und 14 Stunden', tone: 'critical' },
      { id: 'vehicle', label: 'Fahrzeug', value: 'M-AB 9999 · Mercedes E-Klasse Lang', tone: 'warning' },
      { id: 'station', label: 'Station', value: 'Berlin Mitte Hauptbahnhof Süd-Ausgang', tone: 'info' },
      { id: 'url', label: 'Buchungsdetail', value: LONG_URL, tone: 'neutral' },
    ],
  },
  actions: [
    {
      kind: 'OPEN_BOOKING',
      messageDe: 'Buchung im Kalender öffnen und Rückgabe bestätigen',
      messageEn: 'Open booking in calendar and confirm return',
    },
  ],
};

const longHealthBody = `**Gesundheitsübersicht VW Golf (B-XY-1234-LANG)**

1. Bremsen: Vorderachse 4.2mm / Hinterachse 3.1mm — Warnung
2. Reifen: VL 6.2mm VR 5.8mm HL 4.9mm HR 4.7mm
3. Batterie SoH: 87% (letzte Messung 2026-07-20)
4. Ölwechsel: fällig in 1.200 km oder 14 Tagen
5. Service: Inspektion überfällig seit 12 Tagen
- Langsame URL: ${LONG_URL}`;

const longOverdueBody = `**Überfällige Rückgabe BK-2026-009871234567890-LANG**

- Kunde: Anna Schmidt mit sehr langem Nachnamen GmbH
- Fahrzeug: M-AB 9999 Mercedes E-Klasse Lang
- Fällig seit: 3 Tagen und 14 Stunden
- Detail: ${LONG_URL}`;

let mockHistory: Array<Record<string, unknown>> = [];

export function setMockChatHistory(history: Array<Record<string, unknown>>) {
  mockHistory = history;
}

export function resetAiChatMockState() {
  mockHistory = [];
}

function baseStructuredHistory() {
  return [
    {
      id: 'hist-user-1',
      role: 'user',
      content: 'Warum ist die Rückgabe überfällig und wie ist der Gesundheitsstatus?',
      createdAt: '2026-07-24T10:03:00.000Z',
    },
    {
      id: 'hist-health',
      role: 'assistant',
      content: longHealthBody,
      createdAt: '2026-07-24T10:05:00.000Z',
      structured: longHealthStructured,
    },
    {
      id: 'hist-overdue',
      role: 'assistant',
      content: longOverdueBody,
      createdAt: '2026-07-24T09:10:00.000Z',
      structured: longOverdueStructured,
    },
    {
      id: 'hist-user-2',
      role: 'user',
      content: 'Bitte erkläre noch einmal alle offenen Punkte im Detail mit Fristen und nächsten Schritten.',
      createdAt: '2026-07-24T09:05:00.000Z',
    },
    {
      id: 'hist-followup',
      role: 'assistant',
      content:
        'Zusammenfassung: Bremsen und Service sind kritisch, Rückgabe ist überfällig, Kunde muss kontaktiert werden, Fahrzeug in Werkstatt einplanen.',
      createdAt: '2026-07-24T09:08:00.000Z',
      structured: longOverdueStructured,
    },
  ];
}

export async function installAiChatMocks(page: Page, history: Array<Record<string, unknown>> = mockHistory) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/me') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) });
    }

    if (url.includes(`/organizations/${AI_CHAT_E2E_ORG_ID}/chat/agent`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ agent: { agentName: 'e2e-agent', dimoAgentId: 'dimo-e2e' } }),
      });
    }

    if (url.includes(`/organizations/${AI_CHAT_E2E_ORG_ID}/chat/history`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(history),
      });
    }

    if (url.includes(`/organizations/${AI_CHAT_E2E_ORG_ID}/chat/history`) && method === 'DELETE') {
      mockHistory = [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cleared: true }) });
    }

    if (url.includes(`/organizations/${AI_CHAT_E2E_ORG_ID}/stations`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'st-1', name: 'Berlin Mitte' }]),
      });
    }

    if (url.includes(`/organizations/${AI_CHAT_E2E_ORG_ID}/fleet-map`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${AI_CHAT_E2E_ORG_ID}/rental-health`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ vehicles: [] }) });
    }

    if (url.includes(`/organizations/${AI_CHAT_E2E_ORG_ID}/notifications`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          url.includes('/counts')
            ? { totalActive: 0, unread: 0, critical: 0, warning: 0, info: 0, resolvedRecent: 0, byDomain: {} }
            : { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } },
        ),
      });
    }

    if (url.includes(`/organizations/${AI_CHAT_E2E_ORG_ID}/support/unread-count`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) });
    }

    if (url.includes('/dashboard-insights') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generatedAt: new Date().toISOString(),
          hasRun: true,
          stale: false,
          activeInsightCount: 0,
          error: null,
          insights: [],
          summary: { total: 0, critical: 0, warning: 0, opportunity: 0, info: 0 },
        }),
      });
    }

    if (url.includes(`/organizations/${AI_CHAT_E2E_ORG_ID}/bookings/today`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${AI_CHAT_E2E_ORG_ID}/bookings`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    }

    if (url.includes(`/organizations/${AI_CHAT_E2E_ORG_ID}/customers`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    }

    if (url.includes(`/organizations/${AI_CHAT_E2E_ORG_ID}/invoices`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${AI_CHAT_E2E_ORG_ID}/vehicles`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    }

    if (url.includes(`/organizations/${AI_CHAT_E2E_ORG_ID}/tasks`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    return route.continue();
  });
}

export async function navigateToAiAssistantView(page: Page) {
  const root = page.getByTestId('ai-assistant-root');
  if (await root.isVisible().catch(() => false)) return;

  const viewport = page.viewportSize();
  const navLabel = /^(KI-Assistent|KI-Flottenassistent)$/;

  if (viewport && viewport.width < 1024) {
    await page.locator('div.lg\\:hidden.fixed.top-0.left-0.right-0 button').first().click();
    await page.locator('div.lg\\:hidden.fixed.top-0').getByRole('button', { name: navLabel }).click();
  } else {
    await page.getByRole('button', { name: navLabel }).click();
  }

  await expect(root).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('ai-chat-compose')).toBeVisible();
}

export async function openAiChatPage(page: Page, options?: { withLongHistory?: boolean }) {
  const history = options?.withLongHistory ? baseStructuredHistory() : [];
  resetAiChatMockState();
  setMockChatHistory(history);

  await page.addInitScript(
    ({ token, user, locale }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(user));
      localStorage.setItem('synqdrive.locale', locale);
    },
    { token: 'ai-chat-e2e-token', user: mockUser, locale: 'de' },
  );

  await installAiChatMocks(page, history);
  await page.goto('/rental', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^(Dashboard|Übersicht)$/ }).first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
  await navigateToAiAssistantView(page);
}

export async function assertChatInputReachable(page: Page) {
  const input = page.getByTestId('ai-chat-input');
  await expect(input).toBeVisible();
  await input.scrollIntoViewIfNeeded();
  const box = await input.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual((viewport?.height ?? 800) + 2);
}

export async function assertMessagesScrollRegion(page: Page) {
  const container = page.getByTestId('ai-chat-messages');
  await expect(container).toBeVisible();
  const metrics = await container.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    scrollTop: el.scrollTop,
  }));
  expect(metrics.scrollHeight).toBeGreaterThanOrEqual(metrics.clientHeight);
  if (metrics.scrollHeight > metrics.clientHeight + 8) {
    expect(metrics.scrollTop + metrics.clientHeight).toBeGreaterThanOrEqual(metrics.scrollHeight - 8);
  }
}

export async function assertCompactSummaryFullyVisible(page: Page, responseType: string) {
  const card = page.locator(`[data-testid="fleet-chat-compact-summary"][data-response-type="${responseType}"]`).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual((viewport?.width ?? 1280) + 1);
}
