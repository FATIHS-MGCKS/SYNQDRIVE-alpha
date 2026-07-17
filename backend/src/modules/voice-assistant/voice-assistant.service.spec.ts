import { BadRequestException } from '@nestjs/common';
import {
  VoiceAssistantStatus,
  VoiceConnectionStatus,
  VoicePstnProvider,
} from '@prisma/client';
import { VoiceAssistantService } from './voice-assistant.service';
import { ElevenLabsService } from './elevenlabs.service';
import { TwilioControlPlaneTelephonyService } from '@modules/twilio/twilio-control-plane.telephony.service';

describe('VoiceAssistantService', () => {
  const prisma = {
    organization: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    voiceAssistant: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    voiceConversation: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  const elevenLabs = {
    isConfigured: jest.fn(),
    createOrUpdateAgent: jest.fn(),
    assignPhoneNumberToAgent: jest.fn(),
    listConversations: jest.fn(),
    getConversation: jest.fn(),
    getSignedTestUrl: jest.fn(),
    listVoices: jest.fn(),
  };

  const twilioTelephony = {
    isConfiguredForOrganization: jest.fn(),
    listPhoneNumbers: jest.fn(),
    configureInboundWebhooks: jest.fn(),
    clearInboundWebhooks: jest.fn(),
    initiateOutboundCall: jest.fn(),
    resolveVoiceWebhookUrls: jest.fn(),
  };

  const twilioControlPlaneTelephony = {
    isConfigured: jest.fn(),
    listParentPhoneNumbers: jest.fn(),
  };

  let service: VoiceAssistantService;

  const baseAssistant = {
    id: 'asst-1',
    organizationId: 'org-1',
    name: 'Fleet Assistant',
    role: null,
    personality: null,
    language: 'en',
    voiceId: 'voice-1',
    voiceName: 'Rachel',
    greetingMessage: 'Hello',
    systemPrompt: 'You are helpful',
    companyContext: null,
    businessRules: null,
    forbiddenActions: null,
    knowledgeSnippets: null,
    provider: 'elevenlabs',
    pstnProvider: VoicePstnProvider.ELEVENLABS,
    elevenLabsAgentId: null,
    elevenLabsPhoneNumberId: null,
    twilioPhoneNumberSid: null,
    phoneNumberId: null,
    phoneNumber: null,
    connectionStatus: VoiceConnectionStatus.NOT_CONFIGURED,
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
    permEmergencyHandling: false,
    toolPermissions: null,
    escalationPhone: '+49123456789',
    escalationUserId: null,
    escalationDepartment: null,
    escalateOnLowConf: true,
    escalateOnSensitive: true,
    escalateOnRequest: true,
    fallbackMessage: null,
    escalationTriggers: null,
    businessHoursStart: null,
    businessHoursEnd: null,
    businessHoursTimezone: null,
    afterHoursMessage: null,
    businessHours: null,
    status: VoiceAssistantStatus.DRAFT,
    totalCalls: 0,
    answeredCalls: 0,
    missedCalls: 0,
    escalatedCalls: 0,
    totalTalkTimeSeconds: 0,
    totalTalkMinutes: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    activatedAt: null,
    deactivatedAt: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    elevenLabs.isConfigured.mockReturnValue(true);
    twilioTelephony.isConfiguredForOrganization.mockResolvedValue(false);
    twilioControlPlaneTelephony.isConfigured.mockReturnValue(false);
    service = new VoiceAssistantService(
      prisma as any,
      elevenLabs as any,
      twilioTelephony as any,
      twilioControlPlaneTelephony as any,
    );
  });

  it('creates default assistant idempotently', async () => {
    prisma.voiceAssistant.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(baseAssistant);
    prisma.voiceAssistant.create.mockResolvedValue(baseAssistant);

    const first = await service.getOrCreateAssistantForOrg('org-1');
    const second = await service.getOrCreateAssistantForOrg('org-1');

    expect(prisma.voiceAssistant.create).toHaveBeenCalledTimes(1);
    expect(first.organizationId).toBe('org-1');
    expect(second.organizationId).toBe('org-1');
  });

  it('updates assistant scoped to organization', async () => {
    prisma.voiceAssistant.findUnique.mockResolvedValue(baseAssistant);
    prisma.voiceAssistant.update.mockResolvedValue({
      ...baseAssistant,
      name: 'Updated',
    });

    const updated = await service.updateAssistant('org-1', { name: 'Updated' });

    expect(prisma.voiceAssistant.update).toHaveBeenCalledWith({
      where: { id: 'asst-1' },
      data: expect.objectContaining({ name: 'Updated' }),
    });
    expect(updated.name).toBe('Updated');
  });

  it('reports missing readiness fields', async () => {
    prisma.voiceAssistant.findUnique.mockResolvedValue({
      ...baseAssistant,
      voiceId: null,
      greetingMessage: null,
    });

    const readiness = await service.getReadiness('org-1');

    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toEqual(
      expect.arrayContaining(['Voice selected', 'Greeting message']),
    );
  });

  it('fails activation when not ready', async () => {
    prisma.voiceAssistant.findUnique.mockResolvedValue({
      ...baseAssistant,
      systemPrompt: null,
    });

    await expect(service.activateAssistant('org-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(elevenLabs.createOrUpdateAgent).not.toHaveBeenCalled();
  });

  it('activates when ready and provider succeeds', async () => {
    prisma.voiceAssistant.findUnique.mockResolvedValue(baseAssistant);
    elevenLabs.createOrUpdateAgent.mockResolvedValue({ agentId: 'agent-1' });
    prisma.voiceAssistant.update.mockResolvedValue({
      ...baseAssistant,
      status: VoiceAssistantStatus.ACTIVE,
      elevenLabsAgentId: 'agent-1',
      connectionStatus: VoiceConnectionStatus.CONNECTED,
    });

    const activated = await service.activateAssistant('org-1');

    expect(elevenLabs.createOrUpdateAgent).toHaveBeenCalled();
    expect(prisma.voiceAssistant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asst-1' },
        data: expect.objectContaining({ status: VoiceAssistantStatus.ACTIVE }),
      }),
    );
    expect(activated.status).toBe(VoiceAssistantStatus.ACTIVE);
  });

  it('does not set ACTIVE when provider fails', async () => {
    prisma.voiceAssistant.findUnique.mockResolvedValue(baseAssistant);
    elevenLabs.createOrUpdateAgent.mockRejectedValue(new Error('provider down'));

    await expect(service.activateAssistant('org-1')).rejects.toThrow('provider down');
    expect(prisma.voiceAssistant.update).not.toHaveBeenCalled();
  });

  it('scopes conversations by organization', async () => {
    prisma.voiceConversation.findMany.mockResolvedValue([]);
    prisma.voiceConversation.count.mockResolvedValue(0);

    await service.listConversations('org-1', { limit: 10, outcome: 'RESOLVED' as never });

    expect(prisma.voiceConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ organizationId: 'org-1' }]),
        }),
      }),
    );
  });

  it('aggregates conversation analytics for organization', async () => {
    prisma.voiceConversation.findMany.mockResolvedValue([
      {
        outcome: 'RESOLVED',
        status: 'COMPLETED',
        durationSeconds: 120,
        escalationReason: null,
        metadata: { productiveAiCall: true },
        transcript: 'Booking confirmed.',
      },
      {
        outcome: 'ESCALATED',
        status: 'COMPLETED',
        durationSeconds: 60,
        escalationReason: 'Low confidence',
        metadata: { productiveAiCall: true },
        transcript: null,
      },
      {
        outcome: 'ESCALATED',
        status: 'COMPLETED',
        durationSeconds: 45,
        escalationReason: 'Low confidence',
        metadata: { productiveAiCall: true },
        transcript: null,
      },
      {
        outcome: 'ABANDONED',
        status: 'FAILED',
        durationSeconds: null,
        escalationReason: null,
        metadata: { telephonyMode: 'LEGACY_TWIML_SAY', productiveAiCall: false },
        transcript: null,
      },
      {
        outcome: 'RESOLVED',
        status: 'COMPLETED',
        durationSeconds: 30,
        escalationReason: null,
        metadata: { telephonyMode: 'LEGACY_TWIML_SAY', productiveAiCall: false },
        transcript: null,
      },
    ]);

    const analytics = await service.getConversationAnalytics('org-1');

    expect(prisma.voiceConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1' } }),
    );
    expect(analytics.totalCalls).toBe(5);
    expect(analytics.answeredCalls).toBe(3);
    expect(analytics.escalatedCalls).toBe(2);
    expect(analytics.missedCalls).toBe(1);
    expect(analytics.topEscalationReasons[0]).toEqual({
      reason: 'Low confidence',
      count: 2,
    });
    expect(analytics.insights.hasEnoughData).toBe(false);
  });

  it('denies cross-tenant access assertion', () => {
    expect(() => service.assertOrgAccess('org-2', 'org-1')).toThrow();
    expect(() => service.assertOrgAccess('org-1', 'org-1')).not.toThrow();
  });

  it('rejects dangerous tool permission modes on update', async () => {
    prisma.voiceAssistant.findUnique.mockResolvedValue(baseAssistant);
    await expect(
      service.updateAssistant('org-1', {
        toolPermissions: { cancelBooking: 'AUTONOMOUS' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.voiceAssistant.update).not.toHaveBeenCalled();
  });

  it('rejects inbound telephony without assigned phone number', async () => {
    prisma.voiceAssistant.findUnique.mockResolvedValue(baseAssistant);
    await expect(
      service.updateTelephonySettings('org-1', { inboundEnabled: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns blocked test session when voice or prompt missing', async () => {
    prisma.voiceAssistant.findUnique.mockResolvedValue({
      ...baseAssistant,
      elevenLabsAgentId: 'agent-1',
      voiceId: null,
    });
    const session = await service.getTestSession('org-1');
    expect(session.status).toBe('blocked');
    expect(session.developerDetails).toBeNull();
    expect(session.warnings.length).toBeGreaterThan(0);
  });

  it('aggregates admin overview across organizations', async () => {
    prisma.organization.findMany.mockResolvedValue([
      { id: 'org-1', companyName: 'Alpha Fleet' },
      { id: 'org-2', companyName: 'Beta Rent' },
    ]);
    prisma.voiceAssistant.findMany.mockResolvedValue([
      {
        ...baseAssistant,
        organizationId: 'org-1',
        status: VoiceAssistantStatus.ACTIVE,
        totalCalls: 12,
        escalatedCalls: 2,
        missedCalls: 1,
        lastSyncedAt: new Date('2026-06-20T10:00:00Z'),
      },
    ]);
    prisma.voiceConversation.groupBy
      .mockResolvedValueOnce([{ organizationId: 'org-1', _count: { _all: 3 } }])
      .mockResolvedValueOnce([
        { organizationId: 'org-1', _max: { startedAt: new Date('2026-06-20T12:00:00Z') } },
      ]);
    elevenLabs.isConfigured.mockReturnValue(true);

    const overview = await service.getAdminOverview();

    expect(overview.assistants).toHaveLength(2);
    expect(overview.assistants[0].readinessPercent).toBeGreaterThanOrEqual(0);
    expect(overview.assistants[1].assistantStatus).toBe('NOT_CONFIGURED');
    expect(overview.summary.configuredOrgs).toBe(1);
    expect(overview.summary.costTrackingConnected).toBe(false);
  });

  it('rejects admin sync for unknown organization', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    await expect(service.adminSyncOrganization('missing-org')).rejects.toThrow();
  });

  it('persists validated tool permissions and syncs legacy booleans', async () => {
    prisma.voiceAssistant.findUnique.mockResolvedValue(baseAssistant);
    prisma.voiceAssistant.update.mockImplementation(async ({ data }) => ({
      ...baseAssistant,
      ...data,
      toolPermissions: data.toolPermissions,
    }));

    const updated = await service.updateAssistant('org-1', {
      toolPermissions: { createTask: 'SUGGEST_ONLY' },
    });

    expect(prisma.voiceAssistant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toolPermissions: expect.objectContaining({ createTask: 'SUGGEST_ONLY' }),
          permCreateTasks: true,
        }),
      }),
    );
    expect(updated.toolPermissions?.createTask).toBe('SUGGEST_ONLY');
  });
});
