import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearWizardProgress,
  isWizardStepComplete,
  loadWizardStep,
  nextWizardStep,
  prevWizardStep,
  saveWizardStep,
  shouldShowOnboardingWizard,
  WIZARD_STEPS,
} from './voice-wizard.ops';
import type { VoiceAssistantData } from '../../../lib/api';

function assistant(partial: Partial<VoiceAssistantData> = {}): VoiceAssistantData {
  return {
    id: 'va-1',
    organizationId: 'org-1',
    name: 'Fleet Assistant',
    role: 'SynqDrive Rental',
    personality: null,
    language: 'de',
    voiceId: 'voice-1',
    voiceName: 'Anna',
    greetingMessage: 'Hello',
    systemPrompt: 'You are helpful',
    companyContext: null,
    businessRules: null,
    forbiddenActions: null,
    knowledgeSnippets: null,
    provider: 'elevenlabs',
    elevenLabsAgentId: null,
    elevenLabsPhoneNumberId: null,
    phoneNumberId: null,
    phoneNumber: null,
    connectionStatus: 'NOT_CONFIGURED',
    lastProvisionedAt: null,
    lastSyncedAt: null,
    telephonyEnabled: false,
    inboundEnabled: false,
    outboundEnabled: false,
    permAnswerQuestions: true,
    permManageBookings: false,
    permCreateBookingDrafts: false,
    permCancelBookings: false,
    permCreateTasks: false,
    permWorkshopHandling: false,
    permBreakdownSupport: false,
    permContactCustomers: false,
    permContactVendors: false,
    permModifyRecords: false,
    permCreateActions: false,
    permEmergencyHandling: true,
    toolPermissions: {
      answerGeneralQuestions: 'AUTONOMOUS',
      customerLookup: 'SUGGEST_ONLY',
      bookingSearch: 'SUGGEST_ONLY',
      createBookingDraft: 'DISABLED',
      modifyBooking: 'DISABLED',
      cancelBooking: 'DISABLED',
      quotePrices: 'DISABLED',
      createTask: 'DISABLED',
      createDamageCase: 'SUGGEST_ONLY',
      contactCustomer: 'DISABLED',
      contactVendor: 'DISABLED',
      modifyRecords: 'DISABLED',
      emergencyEscalation: 'AUTONOMOUS',
    },
    escalationPhone: '+491234',
    escalationUserId: null,
    escalationDepartment: null,
    escalateOnLowConf: true,
    escalateOnSensitive: true,
    escalateOnRequest: true,
    fallbackMessage: 'Please call back',
    escalationTriggers: null,
    businessHoursStart: '09:00',
    businessHoursEnd: '18:00',
    businessHoursTimezone: 'Europe/Berlin',
    afterHoursMessage: 'Closed',
    businessHours: null,
    status: 'DRAFT',
    totalCalls: 0,
    answeredCalls: 0,
    missedCalls: 0,
    escalatedCalls: 0,
    totalTalkTimeSeconds: 0,
    totalTalkMinutes: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    activatedAt: null,
    deactivatedAt: null,
    ...partial,
  };
}

describe('voice-wizard.ops', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
  });

  it('defines eight onboarding steps in order', () => {
    expect(WIZARD_STEPS).toEqual([
      'plan',
      'assistant',
      'knowledge',
      'permissions',
      'phone',
      'availability',
      'tests',
      'activation',
    ]);
  });

  it('navigates forward and backward across steps', () => {
    expect(nextWizardStep('plan')).toBe('assistant');
    expect(prevWizardStep('assistant')).toBe('plan');
    expect(nextWizardStep('activation')).toBeNull();
  });

  it('shows wizard until assistant is active', () => {
    expect(shouldShowOnboardingWizard(assistant({ status: 'DRAFT' }))).toBe(true);
    expect(shouldShowOnboardingWizard(assistant({ status: 'ACTIVE' }))).toBe(false);
  });

  it('persists and resumes wizard step per organization', () => {
    const orgId = `org-test-${Date.now()}`;
    saveWizardStep(orgId, 'permissions');
    expect(loadWizardStep(orgId)).toBe('permissions');
    clearWizardProgress(orgId);
    expect(loadWizardStep(orgId)).toBe('plan');
  });

  it('evaluates step completion from real assistant state', () => {
    const ctx = {
      planCode: 'START' as const,
      assistant: assistant(),
      readiness: { ready: false, missing: ['voice'], checks: [] },
      testPassed: false,
      knowledgeReady: true,
    };
    expect(isWizardStepComplete('plan', ctx)).toBe(true);
    expect(isWizardStepComplete('assistant', ctx)).toBe(true);
    expect(isWizardStepComplete('tests', ctx)).toBe(false);
  });
});
