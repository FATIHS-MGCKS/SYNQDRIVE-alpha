import { BadGatewayException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import {
  VoiceAssistantStatus,
  VoiceConnectionStatus,
  VoiceConversationDirection,
  VoiceConversationOutcome,
  VoiceConversationStatus,
  VoicePstnProvider,
} from '@prisma/client';
import { VoiceAssistantService } from './voice-assistant.service';

describe('VoiceAssistantService characterization', () => {
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
    isConfiguredForOrganization: jest.fn(),
    listPhoneNumbers: jest.fn(),
    initiateOutboundCall: jest.fn(),
    configureInboundWebhooks: jest.fn(),
  };

  const twilioControlPlaneTelephony = {
    isConfigured: jest.fn(),
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
    twilioTelephony.isConfiguredForOrganization.mockResolvedValue(false);
    twilioControlPlaneTelephony.isConfigured.mockReturnValue(false);
    service = new VoiceAssistantService(
      prisma as never,
      elevenLabs as never,
      twilioTelephony as never,
      twilioControlPlaneTelephony as never,
    );
  });

  describe('provider status evaluation', () => {
    it('reports ElevenLabs and Twilio readiness as separate checks', async () => {
      prisma.voiceAssistant.findUnique.mockResolvedValue({
        ...baseAssistant,
        pstnProvider: VoicePstnProvider.TWILIO,
      });
      elevenLabs.isConfigured.mockReturnValue(true);
      twilioTelephony.isConfiguredForOrganization.mockResolvedValue(false);

      const readiness = await service.getReadiness('org-1');
      const elevenCheck = readiness.checks.find((c) => c.key === 'elevenlabs');
      const twilioCheck = readiness.checks.find((c) => c.key === 'twilio');

      expect(elevenCheck?.ok).toBe(true);
      expect(twilioCheck?.ok).toBe(false);
      expect(twilioCheck?.required).toBe(true);
      expect(readiness.ready).toBe(false);
    });

    it('does not treat missing ElevenLabs config as healthy', async () => {
      prisma.voiceAssistant.findUnique.mockResolvedValue(baseAssistant);
      elevenLabs.isConfigured.mockReturnValue(false);

      const readiness = await service.getReadiness('org-1');
      expect(readiness.checks.find((c) => c.key === 'elevenlabs')?.ok).toBe(false);
      expect(readiness.ready).toBe(false);
    });

    it('maps connection status to NOT_CONFIGURED when no provider is configured', async () => {
      prisma.voiceAssistant.findUnique.mockResolvedValue(null);
      prisma.voiceAssistant.create.mockImplementation(async ({ data }) => ({
        ...baseAssistant,
        ...data,
        connectionStatus: VoiceConnectionStatus.NOT_CONFIGURED,
      }));
      elevenLabs.isConfigured.mockReturnValue(false);
      twilioTelephony.isConfiguredForOrganization.mockResolvedValue(false);

      const assistant = await service.getOrCreateAssistantForOrg('org-1');
      expect(assistant.connectionStatus).toBe('NOT_CONFIGURED');
    });

    it('surfaces ElevenLabs provider failure on activation without persisting ACTIVE', async () => {
      prisma.voiceAssistant.findUnique.mockResolvedValue(baseAssistant);
      elevenLabs.createOrUpdateAgent.mockRejectedValue(new Error('ElevenLabs 502'));

      await expect(service.activateAssistant('org-1')).rejects.toThrow('ElevenLabs 502');
      expect(prisma.voiceAssistant.update).not.toHaveBeenCalled();
    });

    it('swallows Twilio list failure and still returns ElevenLabs numbers (current behavior)', async () => {
      prisma.voiceAssistant.findUnique.mockResolvedValue(baseAssistant);
      twilioTelephony.isConfiguredForOrganization.mockResolvedValue(true);
      twilioTelephony.listPhoneNumbers.mockRejectedValue(new BadGatewayException('Twilio down'));
      elevenLabs.listPhoneNumbers.mockResolvedValue([
        { phone_number_id: 'pn-1', phone_number: '+49111', label: 'EL' },
      ]);

      const numbers = await service.listProviderPhoneNumbers('org-1');

      expect(numbers).toHaveLength(1);
      expect(numbers[0].provider).toBe('elevenlabs');
    });
  });

  describe('conversation sync and masking', () => {
    it('deduplicates remote conversations by providerConversationId', async () => {
      prisma.voiceAssistant.findUnique.mockResolvedValue(baseAssistant);
      elevenLabs.listConversations.mockResolvedValue([
        { conversation_id: 'conv-remote-1', agent_id: 'agent-1', status: 'done' },
        { conversation_id: 'conv-remote-1', agent_id: 'agent-1', status: 'done' },
      ]);
      prisma.voiceConversation.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing' });
      elevenLabs.getConversation.mockResolvedValue({
        transcript: 'hello',
        metadata: { summary: 'done' },
      });
      prisma.voiceConversation.create.mockResolvedValue({ id: 'local-1' });
      prisma.voiceAssistant.update.mockResolvedValue(baseAssistant);

      const result = await service.syncConversations('org-1');

      expect(result.synced).toBe(1);
      expect(prisma.voiceConversation.create).toHaveBeenCalledTimes(1);
    });

    it('scopes sync inserts to the requested organization', async () => {
      prisma.voiceAssistant.findUnique.mockResolvedValue(baseAssistant);
      elevenLabs.listConversations.mockResolvedValue([
        {
          conversation_id: 'conv-remote-2',
          agent_id: 'agent-1',
          status: 'done',
          start_time_unix_secs: 1,
          end_time_unix_secs: 61,
        },
      ]);
      prisma.voiceConversation.findFirst.mockResolvedValue(null);
      elevenLabs.getConversation.mockResolvedValue({ transcript: 'hi', metadata: {} });
      prisma.voiceConversation.create.mockResolvedValue({ id: 'local-2' });
      prisma.voiceAssistant.update.mockResolvedValue(baseAssistant);

      await service.syncConversations('org-1');

      expect(prisma.voiceConversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: 'org-1' }),
        }),
      );
    });

    it('masks caller numbers in tenant conversation list responses', async () => {
      prisma.voiceConversation.findMany.mockResolvedValue([
        {
          id: 'c-1',
          organizationId: 'org-1',
          voiceAssistantId: 'asst-1',
          providerConversationId: 'p-1',
          elevenLabsConvId: 'p-1',
          callerNumber: '+491701234567',
          direction: VoiceConversationDirection.INBOUND,
          durationSeconds: 30,
          status: 'COMPLETED',
          outcome: 'RESOLVED',
          transcript: 'secret transcript',
          summary: null,
          escalationReason: null,
          actionsPerformed: [],
          errorMessage: null,
          metadata: null,
          startedAt: new Date(),
          endedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      prisma.voiceConversation.count.mockResolvedValue(1);

      const result = await service.listConversations('org-1');

      expect(result.items[0].callerNumber).toBe('+*** *** 4567');
      expect(result.items[0].callerNumber).not.toContain('01234567');
    });

    it('creates local outbound conversation row when Twilio outbound is initiated', async () => {
      prisma.voiceAssistant.findUnique.mockResolvedValue({
        ...baseAssistant,
        pstnProvider: VoicePstnProvider.TWILIO,
        outboundEnabled: true,
        phoneNumber: '+49111111111',
      });
      twilioTelephony.isConfiguredForOrganization.mockResolvedValue(true);
      twilioTelephony.initiateOutboundCall.mockResolvedValue({ callSid: 'CA-out-1' });
      prisma.voiceConversation.create.mockResolvedValue({ id: 'conv-out-1' });

      await service.initiateTwilioOutboundCall('org-1', '+49222222222');

      expect(prisma.voiceConversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            twilioCallSid: 'CA-out-1',
            direction: VoiceConversationDirection.OUTBOUND,
            status: VoiceConversationStatus.ACTIVE,
            outcome: VoiceConversationOutcome.PENDING,
          }),
        }),
      );
    });
  });

  describe('CRUD validation characterization', () => {
    it('does not validate escalation phone at service layer (DTO ValidationPipe handles format)', async () => {
      prisma.voiceAssistant.findUnique.mockResolvedValue(baseAssistant);
      prisma.voiceAssistant.update.mockImplementation(async ({ data }) => ({
        ...baseAssistant,
        ...data,
      }));

      await expect(
        service.updateAssistant('org-1', { escalationPhone: 'not-a-phone' }),
      ).resolves.toBeDefined();
      expect(prisma.voiceAssistant.update).toHaveBeenCalled();
    });

    it('rejects activation when ElevenLabs is not configured on server', async () => {
      prisma.voiceAssistant.findUnique.mockResolvedValue(baseAssistant);
      elevenLabs.isConfigured.mockReturnValue(false);

      const readiness = await service.getReadiness('org-1');
      expect(readiness.ready).toBe(false);
      expect(readiness.missing).toContain('ElevenLabs connected');

      await expect(service.activateAssistant('org-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns blocked test session when ElevenLabs is not configured', async () => {
      prisma.voiceAssistant.findUnique.mockResolvedValue({
        ...baseAssistant,
        elevenLabsAgentId: 'agent-1',
      });
      elevenLabs.isConfigured.mockReturnValue(false);

      await expect(service.getTestSession('org-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('pending ADR targets', () => {
    it.todo('ADR target: phone number list must be subaccount-scoped per org (no parent inventory leak)');
    it.todo('ADR target: Twilio assignedToOther should reflect numbers assigned to other org assistants');
  });
});
