import { describe, expect, it } from 'vitest';
import {
  buildProvisioningSteps,
  provisioningProgressPercent,
  provisioningStatusLabel,
} from './voice-org-provisioning.ops';
import type { VoiceControlPlaneOrgWorkspace } from '../../../../lib/api';

function mockWorkspace(
  overrides: Partial<VoiceControlPlaneOrgWorkspace> = {},
): VoiceControlPlaneOrgWorkspace {
  return {
    detail: {
      exists: true,
      organization: { id: 'org-1', companyName: 'Acme GmbH' },
      assistant: {
        id: 'va-1',
        status: 'ACTIVE',
        hasAgent: true,
        lastProvisionedAt: '2026-07-18T10:00:00.000Z',
      },
      readiness: {
        ready: true,
        checks: [
          { key: 'elevenlabs', label: 'ElevenLabs', ok: true },
          { key: 'twilio', label: 'Twilio', ok: true },
          { key: 'tests', label: 'Tests', ok: true },
        ],
      },
      telephonyStatus: {
        status: 'CONNECTED',
        label: 'Connected',
        detail: 'ok',
        providerConfigured: true,
        agentProvisioned: true,
        phoneAssigned: true,
        inboundReady: true,
        outboundEnabled: true,
      },
      recentConversations: [],
    },
    subscription: { status: 'ACTIVE', planCode: 'BUSINESS' },
    billing: null,
    protectionAudit: [],
    providerAccounts: [
      {
        id: 'pa-1',
        provider: 'TWILIO',
        status: 'ACTIVE',
        maskedExternalRef: 'AC…42',
        region: 'IE1',
        updatedAt: '2026-07-18T09:00:00.000Z',
      },
    ],
    phoneNumbers: [
      {
        id: 'pn-1',
        maskedPhoneNumber: '+49 *** **42',
        status: 'ACTIVE',
        region: 'IE1',
        regulatoryStatus: 'APPROVED',
        elevenLabsAssigned: true,
      },
    ],
    provisioningJobs: [],
    agentDeployment: { draft: null, diff: null },
    ...overrides,
  };
}

describe('voice-org-provisioning.ops', () => {
  it('builds 10 provisioning steps', () => {
    const steps = buildProvisioningSteps(mockWorkspace());
    expect(steps).toHaveLength(10);
    expect(steps[0].label).toBe('Voice Subscription');
    expect(steps[9].label).toBe('Activation');
  });

  it('marks failed twilio job as failed step', () => {
    const steps = buildProvisioningSteps(
      mockWorkspace({
        provisioningJobs: [
          {
            id: 'job-1',
            jobType: 'TWILIO_SUBACCOUNT_CREATE',
            status: 'FAILED',
            currentStep: 'create_subaccount',
            resumeStep: 'create_subaccount',
            lastError: 'Twilio API error',
            updatedAt: '2026-07-18T11:00:00.000Z',
          },
        ],
        providerAccounts: [],
      }),
    );
    const twilio = steps.find(s => s.id === 'twilio_subaccount');
    expect(twilio?.status).toBe('failed');
    expect(twilio?.actionLabel).toBe('Fehlgeschlagenen Schritt erneut versuchen');
    expect(twilio?.error).toContain('Twilio');
  });

  it('calculates progress percent', () => {
    const steps = buildProvisioningSteps(mockWorkspace());
    expect(provisioningProgressPercent(steps)).toBeGreaterThan(0);
    expect(provisioningStatusLabel('completed')).toBe('Abgeschlossen');
  });
});
