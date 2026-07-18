// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  buildVoiceRouteSearch,
  hasVoiceDeepLink,
  maskTechnicalId,
  parseVoiceRouteFromSearch,
  reconcileVoiceRoute,
  type VoiceWorkspaceView,
} from './voice-information-architecture';

function workspace(partial: Partial<VoiceWorkspaceView>): VoiceWorkspaceView {
  return {
    organizationId: 'org-1',
    primaryState: 'ONBOARDING',
    issues: [],
    navigation: {
      phase: 'onboarding',
      wizardStep: 'plan',
      opsTab: null,
      settingsSection: null,
      allowedWizardSteps: ['plan'],
      allowedOpsTabs: [],
      allowedSettingsSections: [],
    },
    onboardingStep: 'plan',
    completedSteps: [],
    rolloutStatus: 'DISABLED',
    subscriptionStatus: null,
    assistantStatus: 'DRAFT',
    readinessReady: false,
    testPassed: false,
    canActivate: false,
    updatedAt: '2026-07-18T00:00:00.000Z',
    ...partial,
  };
}

describe('voice information architecture', () => {
  it('parses deep-link query params', () => {
    expect(parseVoiceRouteFromSearch('?voiceTab=conversations')).toEqual({
      wizardStep: null,
      opsTab: 'conversations',
      settingsSection: null,
    });
    expect(hasVoiceDeepLink('?voiceStep=phone')).toBe(true);
  });

  it('builds onboarding and settings routes', () => {
    expect(
      buildVoiceRouteSearch({
        wizardStep: 'assistant',
        opsTab: null,
        settingsSection: null,
      }),
    ).toContain('voiceStep=assistant');

    expect(
      buildVoiceRouteSearch({
        wizardStep: null,
        opsTab: 'settings',
        settingsSection: 'diagnostics',
      }),
    ).toContain('voiceSettings=diagnostics');
  });

  it('blocks wizard jumps ahead of server-allowed steps', () => {
    const reconciled = reconcileVoiceRoute(
      workspace({
        onboardingStep: 'plan',
        navigation: {
          phase: 'onboarding',
          wizardStep: 'plan',
          opsTab: null,
          settingsSection: null,
          allowedWizardSteps: ['plan'],
          allowedOpsTabs: [],
          allowedSettingsSections: [],
        },
      }),
      { wizardStep: 'activation', opsTab: null, settingsSection: null },
    );
    expect(reconciled.wizardStep).toBe('plan');
  });

  it('routes active tenants to operations tabs', () => {
    const reconciled = reconcileVoiceRoute(
      workspace({
        primaryState: 'ACTIVE',
        navigation: {
          phase: 'operations',
          wizardStep: null,
          opsTab: 'overview',
          settingsSection: null,
          allowedWizardSteps: [],
          allowedOpsTabs: ['overview', 'settings'],
          allowedSettingsSections: ['assistant', 'diagnostics'],
        },
      }),
      { wizardStep: null, opsTab: 'settings', settingsSection: 'diagnostics' },
    );
    expect(reconciled.opsTab).toBe('settings');
    expect(reconciled.settingsSection).toBe('diagnostics');
  });

  it('masks technical identifiers by default', () => {
    expect(maskTechnicalId('agent_1234567890abcdef')).toBe('agen…cdef');
    expect(maskTechnicalId('agent_1234567890abcdef', { reveal: true })).toBe(
      'agent_1234567890abcdef',
    );
  });
});
