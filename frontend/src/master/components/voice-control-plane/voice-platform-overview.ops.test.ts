import { describe, expect, it } from 'vitest';
import type { VoiceControlPlaneOrganizationRow } from '../../../lib/api';
import {
  DEFAULT_VOICE_ORG_FILTERS,
  filterOrganizations,
  healthStateTone,
  maskOrgId,
  nextOrgAction,
} from './voice-platform-overview.ops';

const org = (overrides: Partial<VoiceControlPlaneOrganizationRow> = {}): VoiceControlPlaneOrganizationRow =>
  ({
    organizationId: 'org-1234567890',
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
    rolloutStatus: 'ENABLED',
    subaccountStatus: null,
    maskedPhoneNumber: '+49 *** **42',
    consumedMinutes: 10,
    remainingMinutes: 90,
    monthlyBudgetCents: 50000,
    maxConcurrentCalls: 2,
    openErrors: 0,
    agentDeploymentStatus: 'ACTIVE',
    provisioningFailed: false,
    budgetStatus: 'ok',
    problemStatus: 'ok',
    providerHealth: 'healthy',
    ...overrides,
  }) as VoiceControlPlaneOrganizationRow;

describe('voice-platform-overview.ops', () => {
  it('masks organization ids for display', () => {
    expect(maskOrgId('org-1234567890abcdef')).toBe('org-…cdef');
  });

  it('filters by plan and provisioning failures', () => {
    const rows = [
      org(),
      org({ organizationId: 'org-2', planCode: 'START', provisioningFailed: true, problemStatus: 'warning' }),
    ];
    expect(filterOrganizations(rows, { ...DEFAULT_VOICE_ORG_FILTERS, plan: 'BUSINESS' })).toHaveLength(1);
    expect(
      filterOrganizations(rows, { ...DEFAULT_VOICE_ORG_FILTERS, provisioningFailed: true }),
    ).toHaveLength(1);
    expect(
      filterOrganizations(rows, { ...DEFAULT_VOICE_ORG_FILTERS, incidentsOnly: true }),
    ).toHaveLength(1);
  });

  it('maps health state tones', () => {
    expect(healthStateTone('healthy')).toBe('success');
    expect(healthStateTone('incident')).toBe('critical');
  });

  it('suggests next actions based on org state', () => {
    expect(nextOrgAction(org({ provisioningFailed: true }))).toBe('Provisioning prüfen');
    expect(nextOrgAction(org({ assistantStatus: 'NOT_CONFIGURED' }))).toBe('Onboarding starten');
    expect(nextOrgAction(org())).toBeNull();
  });
});
