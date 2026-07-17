import { expect, type Page } from '@playwright/test';

export const VOICE_STAGING_ORG_ID = 'org-voice-staging-e2e';

export const mockMasterAdmin = {
  id: 'user-voice-e2e-master',
  email: 'voice-master@synqdrive.eu',
  name: 'Voice E2E Master',
  platformRole: 'MASTER_ADMIN',
  membershipRole: 'MASTER_ADMIN',
  organizationId: null,
  organizationName: null,
  organizationLogoUrl: null,
  permissions: {},
};

const mockPlatformStatus = {
  checkedAt: '2026-07-17T12:00:00.000Z',
  providers: {
    elevenLabs: { ok: true, label: 'Connected' },
    twilioIe1: { ok: true, label: 'Connected' },
    mcpGateway: { ok: true, label: 'Enabled' },
    webhookIngestion: { ok: true, label: 'Active' },
  },
  queues: { waiting: 0, active: 0, failed: 0, webhookBacklog: 0 },
  webhooks: { byStatus: { PROCESSED: 12 }, dlqCount24h: 0, avgProcessingDelayMs: 95 },
  activeIncidents: [],
};

const mockOrganizations = {
  summary: {
    totalOrgs: 1,
    configuredOrgs: 1,
    activeOrgs: 1,
    totalCalls: 3,
    totalMinutes: 7,
    totalTalkTimeSeconds: 420,
    costTrackingConnected: true,
    costTrackingMessage: 'ok',
  },
  organizations: [
    {
      organizationId: VOICE_STAGING_ORG_ID,
      organizationName: 'Voice Staging E2E GmbH',
      assistantStatus: 'ACTIVE',
      readinessPercent: 100,
      missingReadinessItemsCount: 0,
      elevenLabsConnected: true,
      agentProvisioned: true,
      telephonyEnabled: true,
      phoneNumber: '+49 *** **42',
      inboundEnabled: true,
      outboundEnabled: true,
      totalCalls: 3,
      callsToday: 1,
      escalatedCalls: 0,
      missedCalls: 0,
      lastCallAt: '2026-07-17T11:30:00.000Z',
      lastSyncedAt: '2026-07-17T12:00:00.000Z',
      providerWarning: null,
      lastError: null,
      planCode: 'BUSINESS',
      subscriptionStatus: 'ACTIVE',
      subaccountStatus: 'ACTIVE',
      consumedMinutes: 7,
      remainingMinutes: 93,
      monthlyBudgetCents: 50000,
      maxConcurrentCalls: 2,
      openErrors: 0,
    },
  ],
};

const mockPhoneNumbers = [
  {
    id: 'pn-staging-1',
    organizationId: VOICE_STAGING_ORG_ID,
    organizationName: 'Voice Staging E2E GmbH',
    maskedPhoneNumber: '+49 *** **42',
    status: 'ACTIVE',
    region: 'IE1',
    regulatoryStatus: 'APPROVED',
    elevenLabsAssigned: true,
    updatedAt: '2026-07-17T12:00:00.000Z',
  },
];

export async function installVoiceControlPlaneMocks(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/me') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockMasterAdmin),
      });
    }

    if (url.includes('/admin/dashboard') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalOrganizations: 1,
          activeOrganizations: 1,
          totalUsers: 1,
          totalVehicles: 0,
          totalDimoVehicles: 0,
          totalRevenueMrr: 0,
          activeSubscriptions: 1,
          trialOrganizations: 0,
          suspendedOrganizations: 0,
          totalProspects: 0,
          openSupportTickets: 0,
          recentActivity: [],
        }),
      });
    }

    if (url.includes('/admin/monitoring/alerts') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }

    if (url.includes('/admin/support/open') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }

    if (url.includes('/admin/support/newest') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }

    if (url.includes('/organizations') && method === 'GET' && !url.includes('voice-assistant')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    }

    if (url.includes('/users') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }

    if (url.includes('/vehicles') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    }

    if (url.includes('/dimo/') && method === 'GET') {
      const body = url.includes('/stats')
        ? JSON.stringify({ connected: 0, total: 0 })
        : JSON.stringify([]);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body,
      });
    }

    if (url.includes('/admin/voice-assistant/control-plane/platform-status') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPlatformStatus),
      });
    }

    if (url.includes('/admin/voice-assistant/control-plane/organizations') && method === 'GET' && !url.includes('/workspace')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockOrganizations),
      });
    }

    if (url.includes('/admin/voice-assistant/control-plane/phone-numbers') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPhoneNumbers),
      });
    }

    if (url.includes('/admin/voice-assistant/control-plane/webhook-events') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total: 0, items: [] }),
      });
    }

    if (url.includes('/admin/voice-assistant/control-plane/audit-events') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
    }

    if (url.includes('/admin/voice-assistant/billing/organizations/') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          organizationId: VOICE_STAGING_ORG_ID,
          periodStart: '2026-07-01T00:00:00.000Z',
          periodEnd: '2026-08-01T00:00:00.000Z',
          planCode: 'BUSINESS',
          planCatalogVersion: 'v1',
          includedMinutes: 100,
          consumedMinutes: 7,
          inboundMinutes: 5,
          outboundMinutes: 2,
          remainingIncludedMinutes: 93,
          overageMinutes: 0,
          currency: 'EUR',
          estimatedUsageRevenueCents: 0,
          monthlyBaseFeeCents: 9900,
          providerCostCents: 210,
          revenueCents: 9900,
          marginCents: 9690,
          marginPercent: 97.88,
          setupFeeOutstandingCents: 0,
          estimatedCostCents: 210,
          finalCostCents: 210,
        }),
      });
    }

    if (url.includes('/health') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], items: [] }),
    });
  });
}

export async function openVoiceControlPlane(page: Page, section?: string) {
  await page.addInitScript(
    ({ token, user, locale }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(user));
      localStorage.setItem('synqdrive.locale', locale);
    },
    {
      token: 'voice-e2e-master-token',
      user: mockMasterAdmin,
      locale: 'de',
    },
  );

  await installVoiceControlPlaneMocks(page);
  const params = new URLSearchParams();
  params.set('masterView', 'voice-assistant');
  if (section) params.set('voiceSection', section);
  await page.goto(`/master?${params.toString()}`, { waitUntil: 'networkidle' });

  await expect(page.getByTestId('voice-control-plane')).toBeVisible({ timeout: 30_000 });
}

export async function assertNoUnmaskedPhoneNumbers(page: Page) {
  const text = await page.locator('body').innerText();
  expect(text).toContain('+49 *** **42');
  expect(text).not.toMatch(/\+491[0-9]{9,}/);
}

export async function assertNoVoiceSecretsInDom(page: Page) {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/sk_(live|test)_[0-9a-zA-Z]{10,}/);
  expect(text).not.toMatch(/AC[0-9a-fA-F]{32}/);
  expect(text).not.toContain('accountSid');
}
