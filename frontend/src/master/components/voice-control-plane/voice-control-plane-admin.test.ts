// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForHook } from '../../../test/renderHook';

vi.mock('../../../lib/auth', () => ({
  isMasterAdmin: vi.fn(() => true),
  getStoredUser: vi.fn(() => ({ platformRole: 'MASTER_ADMIN' })),
}));

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      voiceAssistant: {
        ...actual.api.voiceAssistant,
        admin: {
          ...actual.api.voiceAssistant.admin,
          billing: {
            plans: vi.fn(),
            orgBilling: vi.fn(),
          },
          controlPlane: {
            platformStatus: vi.fn(),
            organizations: vi.fn(),
            organizationWorkspace: vi.fn(),
            phoneNumbers: vi.fn(),
            webhookEvents: vi.fn(),
            auditEvents: vi.fn(),
            suspendOrganization: vi.fn(),
            replayWebhookEvent: vi.fn(),
            deployAgent: vi.fn(),
            rollbackAgent: vi.fn(),
          },
          provisioning: {
            twilioPreview: vi.fn(),
            twilioProvisionSubaccount: vi.fn(),
            elevenLabsImport: vi.fn(),
          },
        },
      },
    },
  };
});

import { isMasterAdmin } from '../../../lib/auth';
import { api } from '../../../lib/api';
import { VoiceAssistantAdminView } from '../VoiceAssistantAdminView';
import { readVoiceControlPlaneSection } from '../voice-control-plane/voice-control-plane-navigation';
import { readVoiceOrgId } from '../voice-control-plane/voice-org-workspace/voice-org-workspace-navigation';

const mockPlatformStatus = {
  checkedAt: '2026-07-17T12:00:00.000Z',
  overall: { state: 'healthy' as const, label: 'Healthy' },
  providers: {
    elevenLabs: { ok: true, label: 'Healthy', state: 'healthy' as const },
    twilioIe1: { ok: true, label: 'Healthy', state: 'healthy' as const },
    mcpGateway: { ok: true, label: 'Healthy', state: 'healthy' as const },
    webhookIngestion: { ok: true, label: 'Healthy', state: 'healthy' as const },
  },
  operations: {
    callsToday: 12,
    usageMinutesToday: 34,
    estimatedCostTodayCents: 450,
    activeVoiceOrganizations: 3,
    failedProvisionings: 0,
  },
  queues: { waiting: 0, active: 0, failed: 0, webhookBacklog: 0 },
  webhooks: { byStatus: {}, dlqCount24h: 0, avgProcessingDelayMs: 120 },
  activeIncidents: [],
};

describe('VoiceAssistantAdminView control plane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/master?voiceSection=platform');
    vi.mocked(isMasterAdmin).mockReturnValue(true);
    vi.mocked(api.voiceAssistant.admin.controlPlane.platformStatus).mockResolvedValue(mockPlatformStatus);
    vi.mocked(api.voiceAssistant.admin.controlPlane.organizations).mockResolvedValue({
      summary: {
        totalOrgs: 1,
        configuredOrgs: 1,
        activeOrgs: 1,
        totalCalls: 0,
        totalMinutes: 0,
        totalTalkTimeSeconds: 0,
        costTrackingConnected: true,
        costTrackingMessage: 'ok',
      },
      organizations: [
        {
          organizationId: 'org-1',
          organizationName: 'Acme GmbH',
          assistantStatus: 'ACTIVE',
          readinessPercent: 100,
          missingReadinessItemsCount: 0,
          elevenLabsConnected: true,
          agentProvisioned: true,
          telephonyEnabled: true,
          phoneNumber: '+49 *** **42',
          inboundEnabled: true,
          outboundEnabled: true,
          totalCalls: 0,
          callsToday: 0,
          escalatedCalls: 0,
          missedCalls: 0,
          lastCallAt: null,
          lastSyncedAt: null,
          providerWarning: null,
          lastError: null,
          planCode: 'BUSINESS',
          subscriptionStatus: 'ACTIVE',
          subaccountStatus: null,
          consumedMinutes: 12,
          remainingMinutes: 88,
          monthlyBudgetCents: 50000,
          maxConcurrentCalls: 2,
          openErrors: 0,
          rolloutStatus: 'ENABLED',
          maskedPhoneNumber: '+49 *** **42',
          agentDeploymentStatus: 'ACTIVE',
          provisioningFailed: false,
          budgetStatus: 'ok',
          problemStatus: 'ok',
          providerHealth: 'healthy',
        },
      ],
    });
    vi.mocked(api.voiceAssistant.admin.controlPlane.phoneNumbers).mockResolvedValue([
      {
        id: 'pn-1',
        organizationId: 'org-1',
        organizationName: 'Acme GmbH',
        maskedPhoneNumber: '+49 *** **42',
        status: 'ACTIVE',
        region: 'IE1',
        regulatoryStatus: 'APPROVED',
        elevenLabsAssigned: true,
        updatedAt: '2026-07-17T12:00:00.000Z',
      },
    ]);
    vi.mocked(api.voiceAssistant.admin.controlPlane.webhookEvents).mockResolvedValue({ total: 0, items: [] });
    vi.mocked(api.voiceAssistant.admin.controlPlane.auditEvents).mockResolvedValue({ items: [] });
    vi.mocked(api.voiceAssistant.admin.billing.orgBilling).mockResolvedValue({
      organizationId: 'org-1',
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: '2026-08-01T00:00:00.000Z',
      planCode: 'BUSINESS',
      planCatalogVersion: 'v1',
      includedMinutes: 100,
      consumedMinutes: 12,
      inboundMinutes: 8,
      outboundMinutes: 4,
      remainingIncludedMinutes: 88,
      overageMinutes: 0,
      currency: 'EUR',
      estimatedUsageRevenueCents: 0,
      monthlyBaseFeeCents: 9900,
      providerCostCents: 400,
      revenueCents: 9900,
      marginCents: 9500,
      marginPercent: 95.96,
      setupFeeOutstandingCents: 0,
      estimatedCostCents: 400,
      finalCostCents: 400,
    });
  });

  it('denies access without master admin role', async () => {
    vi.mocked(isMasterAdmin).mockReturnValue(false);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(VoiceAssistantAdminView));
    });

    await waitForHook(() => document.body.textContent?.includes('Kein Zugriff') ?? false);
    expect(document.body.textContent).toContain('Kein Zugriff');
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders platform status tab with masked provider labels', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(VoiceAssistantAdminView));
    });

    await waitForHook(() => document.querySelector('[data-testid="voice-control-plane"]') != null);
    expect(document.body.textContent).toContain('Voice Betriebszentrum');
    expect(document.body.textContent).toContain('ElevenLabs');
    expect(document.querySelector('[data-testid="voice-platform-status"]')).toBeTruthy();
    expect(document.body.textContent).not.toContain('accountSid');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('shows masked phone numbers in phone-numbers section', async () => {
    window.history.replaceState(null, '', '/master?voiceSection=phone-numbers');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(createElement(VoiceAssistantAdminView));
    });

    await waitForHook(() => document.body.textContent?.includes('+49 *** **42') ?? false);
    expect(document.body.textContent).toContain('+49 *** **42');
    expect(document.body.textContent).not.toMatch(/\+491[0-9]{9,}/);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('parses voice section from URL', () => {
    expect(readVoiceControlPlaneSection('?voiceSection=audit')).toBe('audit');
    expect(readVoiceControlPlaneSection('')).toBe('platform');
    expect(readVoiceOrgId('?voiceOrgId=org-1')).toBe('org-1');
  });
});

describe('Voice control plane API contract', () => {
  it('exposes secure control-plane endpoints in api client', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const apiSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/api.ts'), 'utf8');
    expect(apiSource).toContain('/admin/voice-assistant/control-plane/platform-status');
    expect(apiSource).toContain('/admin/voice-assistant/control-plane/organizations/');
    expect(apiSource).toContain('/admin/voice-assistant/control-plane/webhook-events/');
    expect(apiSource).toContain('Idempotency-Key');
  });
});
