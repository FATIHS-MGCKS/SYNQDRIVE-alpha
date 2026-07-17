import { NotFoundException } from '@nestjs/common';
import {
  VoiceAssistantStatus,
  VoiceConnectionStatus,
  VoiceConversationDirection,
  VoiceConversationOutcome,
  VoicePstnProvider,
} from '@prisma/client';
import { VoiceAssistantService } from './voice-assistant.service';

describe('VoiceAssistant admin characterization', () => {
  const prisma = {
    organization: { findMany: jest.fn(), findUnique: jest.fn() },
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
    listConversations: jest.fn(),
    getConversation: jest.fn(),
    listPhoneNumbers: jest.fn(),
    listVoices: jest.fn(),
    getSignedTestUrl: jest.fn(),
  };

  const twilioTelephony = {
    isConfigured: jest.fn(),
    listPhoneNumbers: jest.fn(),
    initiateOutboundCall: jest.fn(),
    configureInboundWebhooks: jest.fn(),
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
    elevenLabsAgentId: 'agent-1',
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
    twilioTelephony.isConfigured.mockReturnValue(false);
    service = new VoiceAssistantService(
      prisma as never,
      elevenLabs as never,
      twilioTelephony as never,
    );
  });

  describe('getAdminOrgDetail', () => {
    it('returns masked caller numbers and omits full transcripts for master admin', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        companyName: 'Alpha Fleet',
      });
      prisma.voiceAssistant.findUnique.mockResolvedValue(baseAssistant);
      prisma.voiceConversation.findMany.mockResolvedValue([
        {
          id: 'conv-1',
          organizationId: 'org-1',
          voiceAssistantId: 'asst-1',
          providerConversationId: 'remote-1',
          elevenLabsConvId: 'remote-1',
          callerNumber: '+491701234567',
          direction: VoiceConversationDirection.INBOUND,
          durationSeconds: 42,
          status: 'COMPLETED',
          outcome: VoiceConversationOutcome.RESOLVED,
          transcript: 'full secret transcript',
          summary: 'Handled booking',
          escalationReason: null,
          actionsPerformed: ['lookup_booking'],
          errorMessage: 'provider error detail',
          metadata: { foo: 'bar' },
          startedAt: new Date(),
          endedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      prisma.voiceConversation.count.mockResolvedValue(1);

      const detail = await service.getAdminOrgDetail('org-1');

      expect(detail.exists).toBe(true);
      const recent = detail.recentConversations?.[0] as Record<string, unknown>;
      expect(recent.callerNumber).toBe('+*** *** 4567');
      expect(recent).not.toHaveProperty('transcript');
      expect(recent).not.toHaveProperty('metadata');
      expect(recent).not.toHaveProperty('actionsPerformed');
      expect(recent).not.toHaveProperty('errorMessage');
      expect(recent).not.toHaveProperty('organizationId');
    });

    it('reports cost tracking as not connected (current stub)', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        companyName: 'Alpha Fleet',
      });
      prisma.voiceAssistant.findUnique.mockResolvedValue(null);

      const detail = await service.getAdminOrgDetail('org-1');

      expect(detail.exists).toBe(false);
      expect(detail.costTracking).toEqual({
        connected: false,
        message: 'Cost tracking not connected yet',
      });
    });

    it('rejects unknown organization', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      await expect(service.getAdminOrgDetail('missing-org')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getAdminOverview', () => {
    it('aggregates per-organization rows without exposing cross-org conversation payloads', async () => {
      prisma.organization.findMany.mockResolvedValue([
        { id: 'org-1', companyName: 'Alpha Fleet' },
        { id: 'org-2', companyName: 'Beta Rent' },
      ]);
      prisma.voiceAssistant.findMany.mockResolvedValue([
        {
          ...baseAssistant,
          organizationId: 'org-1',
          status: VoiceAssistantStatus.ACTIVE,
          totalCalls: 5,
        },
      ]);
      prisma.voiceConversation.groupBy
        .mockResolvedValueOnce([{ organizationId: 'org-1', _count: { _all: 2 } }])
        .mockResolvedValueOnce([
          { organizationId: 'org-1', _max: { startedAt: new Date('2026-07-17T10:00:00Z') } },
        ]);

      const overview = await service.getAdminOverview();

      expect(overview.assistants).toHaveLength(2);
      expect(overview.assistants[0].organizationId).toBe('org-1');
      expect(overview.assistants[1].assistantStatus).toBe('NOT_CONFIGURED');
      expect(overview.summary.costTrackingConnected).toBe(false);
      expect(overview.summary.costTrackingMessage).toContain('not connected');
    });

    it('does not derive ElevenLabs admin connectivity from Twilio-only config', async () => {
      prisma.organization.findMany.mockResolvedValue([
        { id: 'org-1', companyName: 'Alpha Fleet' },
      ]);
      prisma.voiceAssistant.findMany.mockResolvedValue([]);
      prisma.voiceConversation.groupBy.mockResolvedValue([]);
      elevenLabs.isConfigured.mockReturnValue(false);
      twilioTelephony.isConfigured.mockReturnValue(true);

      const overview = await service.getAdminOverview();

      expect(overview.elevenLabsConfigured).toBe(false);
      expect(overview.twilioConfigured).toBe(true);
      expect(overview.assistants[0].elevenLabsConnected).toBe(false);
      expect(overview.assistants[0].twilioConnected).toBe(true);
    });
  });

  describe('assertOrgAccess', () => {
    it('rejects cross-tenant access when scoped org differs', () => {
      expect(() => service.assertOrgAccess('org-b', 'org-a')).toThrow('Cross-tenant access denied');
    });

    it('allows access when scoped org matches requested org', () => {
      expect(() => service.assertOrgAccess('org-a', 'org-a')).not.toThrow();
    });
  });

  describe('pending ADR targets', () => {
    it.todo('ADR target: master admin overview should not expose raw phone numbers from other tenants inventory');
  });
});
