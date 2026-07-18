import { BadRequestException } from '@nestjs/common';
import {
  OrganizationStatus,
  VoiceAssistantStatus,
  VoiceConnectionStatus,
  VoiceSubscriptionStatus,
} from '@prisma/client';
import { VoiceWorkspaceService } from './voice-workspace.service';

describe('VoiceWorkspaceService', () => {
  const prisma = {
    voiceAssistant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    organization: { findUnique: jest.fn() },
    voiceProvisioningJob: { findFirst: jest.fn() },
    voicePhoneNumber: { findFirst: jest.fn() },
    voiceAgentDeployment: { findFirst: jest.fn() },
  };

  const testCenter = {
    getSummary: jest.fn(),
  };

  const assistantService = {
    getOrCreateAssistantForOrg: jest.fn(),
    getReadiness: jest.fn(),
  };

  const subscriptions = {
    listByOrganization: jest.fn(),
  };

  const protection = {
    assertActivationAllowed: jest.fn().mockResolvedValue(undefined),
  };

  let service: VoiceWorkspaceService;

  const baseAssistant = {
    id: 'va-1',
    organizationId: 'org-1',
    name: 'Assistant',
    voiceId: 'voice-1',
    greetingMessage: 'Hello',
    toolPermissions: { answerGeneralQuestions: 'AUTONOMOUS' },
    phoneNumber: '+49123',
    telephonyEnabled: true,
    inboundEnabled: true,
    businessHoursStart: '09:00',
    businessHoursEnd: '18:00',
    fallbackMessage: 'Call back',
    escalationPhone: null,
    companyContext: 'Fleet',
    businessRules: null,
    knowledgeSnippets: null,
    status: VoiceAssistantStatus.DRAFT,
    connectionStatus: VoiceConnectionStatus.CONNECTED,
    onboardingStep: 'permissions',
    onboardingCompletedSteps: ['plan', 'assistant', 'knowledge'],
    updatedAt: new Date('2026-07-18T00:00:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VoiceWorkspaceService(
      prisma as never,
      assistantService as never,
      subscriptions as never,
      protection as never,
      testCenter as never,
    );

    assistantService.getOrCreateAssistantForOrg.mockResolvedValue(baseAssistant);
    prisma.voiceAssistant.findUnique.mockResolvedValue(baseAssistant);
    prisma.organization.findUnique.mockResolvedValue({ status: OrganizationStatus.ACTIVE });
    subscriptions.listByOrganization.mockResolvedValue([
      { status: VoiceSubscriptionStatus.TRIAL, planCode: 'START' },
    ]);
    assistantService.getReadiness.mockResolvedValue({
      ready: false,
      missing: ['agentProvisioned'],
      checks: [
        { key: 'elevenlabs', ok: true },
        { key: 'twilio', ok: true },
      ],
    });
    prisma.voiceProvisioningJob.findFirst.mockResolvedValue(null);
    prisma.voicePhoneNumber.findFirst.mockResolvedValue(null);
    prisma.voiceAgentDeployment.findFirst.mockResolvedValue(null);
    testCenter.getSummary.mockResolvedValue({
      ready: false,
      passedCount: 0,
      partialCount: 0,
      failedCount: 0,
      pendingCount: 10,
      requiredCount: 10,
      scenarios: [],
    });
  });

  it('derives NO_PLAN without subscription', async () => {
    subscriptions.listByOrganization.mockResolvedValue([]);
    const workspace = await service.getWorkspace('org-1');
    expect(workspace.primaryState).toBe('NO_PLAN');
    expect(workspace.issues.some((issue) => issue.code === 'subscription_missing')).toBe(true);
  });

  it('derives ONBOARDING for incomplete wizard', async () => {
    const workspace = await service.getWorkspace('org-1');
    expect(workspace.primaryState).toBe('ONBOARDING');
    expect(workspace.navigation.phase).toBe('onboarding');
    expect(workspace.completedSteps).toContain('plan');
  });

  it('derives READY_TO_ACTIVATE when pre-activation steps complete', async () => {
    testCenter.getSummary.mockResolvedValue({
      ready: true,
      passedCount: 8,
      partialCount: 2,
      failedCount: 0,
      pendingCount: 0,
      requiredCount: 10,
      scenarios: [],
    });
    assistantService.getReadiness.mockResolvedValue({ ready: true, missing: [], checks: [] });
    prisma.voiceAssistant.findUnique.mockResolvedValue({
      ...baseAssistant,
      onboardingCompletedSteps: [
        'plan',
        'assistant',
        'knowledge',
        'permissions',
        'phone',
        'availability',
        'tests',
      ],
    });

    const workspace = await service.getWorkspace('org-1');
    expect(workspace.primaryState).toBe('READY_TO_ACTIVATE');
  });

  it('derives ACTIVE operations navigation for active assistant', async () => {
    prisma.voiceAssistant.findUnique.mockResolvedValue({
      ...baseAssistant,
      status: VoiceAssistantStatus.ACTIVE,
    });
    const workspace = await service.getWorkspace('org-1');
    expect(workspace.primaryState).toBe('ACTIVE');
    expect(workspace.navigation.phase).toBe('operations');
    expect(workspace.navigation.allowedOpsTabs).toContain('settings');
  });

  it('blocks onboarding jumps ahead of completed steps', async () => {
    await expect(
      service.updateOnboardingStep('org-1', { step: 'activation' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates route against workspace permissions', async () => {
    const workspace = await service.getWorkspace('org-1');
    const nav = service.validateRoute({
      workspace,
      wizardStep: 'activation',
    });
    expect(nav.wizardStep).not.toBe('activation');
  });
});
