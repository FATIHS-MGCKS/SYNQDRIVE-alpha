import { UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import twilio = require('twilio');
import { VoiceAssistantStatus, VoicePstnProvider } from '@prisma/client';
import { TwilioWebhookService } from './twilio-webhook.service';

describe('TwilioWebhookService characterization', () => {
  const prisma = {
    voiceAssistant: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    voiceConversation: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    twilioWebhookEvent: {
      create: jest.fn(),
    },
  };

  const twilioService = {
    isConfigured: jest.fn().mockReturnValue(true),
    getVoiceWebhookBaseUrl: jest.fn().mockReturnValue('https://app.synqdrive.eu'),
  };

  const config = {
    get: jest.fn((key: string): string | undefined => {
      if (key === 'twilio.authToken') return 'test-auth-token';
      return undefined;
    }),
  };

  const bridge = {
    buildInboundTwiml: jest.fn().mockReturnValue('<Response><Say>Hi</Say></Response>'),
  };

  let service: TwilioWebhookService;

  const requestUrl = 'https://app.synqdrive.eu/api/v1/webhooks/twilio/voice';
  const body = {
    CallSid: 'CA-valid-1',
    From: '+49999111222',
    To: '+49123456789',
    Direction: 'inbound',
  };

  function signedHeaders(form: Record<string, string>) {
    const signature = twilio.getExpectedTwilioSignature('test-auth-token', requestUrl, form);
    return { 'x-twilio-signature': signature };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.voiceAssistant.findFirst.mockResolvedValue({
      id: 'asst-1',
      organizationId: 'org-1',
      elevenLabsAgentId: 'agent-1',
      status: VoiceAssistantStatus.ACTIVE,
      pstnProvider: VoicePstnProvider.TWILIO,
      phoneNumber: '+49123456789',
      greetingMessage: 'Hello',
      fallbackMessage: null,
      escalationPhone: null,
      language: 'en',
      telephonyEnabled: true,
      inboundEnabled: true,
    });
    prisma.twilioWebhookEvent.create.mockResolvedValue({ id: 'evt-1' });
    prisma.voiceConversation.findFirst.mockResolvedValue(null);
    prisma.voiceConversation.create.mockResolvedValue({ id: 'conv-1' });

    service = new TwilioWebhookService(
      prisma as never,
      twilioService as never,
      config as never,
      bridge as never,
    );
  });

  describe('signature validation', () => {
    it('accepts inbound voice webhooks with a valid Twilio signature', async () => {
      const twiml = await service.handleInboundVoice({
        body,
        headers: signedHeaders(body),
        requestUrl,
      });

      expect(twiml).toContain('Response');
      expect(prisma.voiceConversation.create).toHaveBeenCalled();
    });

    it('rejects inbound voice webhooks with an invalid signature when auth token is set', async () => {
      await expect(
        service.handleInboundVoice({
          body,
          headers: { 'x-twilio-signature': 'invalid-signature' },
          requestUrl,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.voiceConversation.create).not.toHaveBeenCalled();
    });
  });

  describe('duplicate and unknown events', () => {
    it('swallows duplicate webhook persistence without failing the handler', async () => {
      prisma.twilioWebhookEvent.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.handleInboundVoice({
          body,
          headers: signedHeaders(body),
          requestUrl,
        }),
      ).resolves.toContain('Response');
    });

    it('records status callback for unknown call SID without updating conversations', async () => {
      const statusUrl = 'https://app.synqdrive.eu/api/v1/webhooks/twilio/status';
      const statusBody = {
        CallSid: 'CA-unknown-9',
        CallStatus: 'completed',
        From: '+49999',
        To: '+48888',
        CallDuration: '12',
      };

      prisma.voiceAssistant.findFirst.mockResolvedValue(null);
      prisma.voiceConversation.findFirst.mockResolvedValue(null);

      await service.handleStatusCallback({
        body: statusBody,
        headers: {
          'x-twilio-signature': twilio.getExpectedTwilioSignature(
            'test-auth-token',
            statusUrl,
            statusBody,
          ),
        },
        requestUrl: statusUrl,
      });

      expect(prisma.twilioWebhookEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            callSid: 'CA-unknown-9',
            organizationId: null,
          }),
        }),
      );
      expect(prisma.voiceConversation.update).not.toHaveBeenCalled();
    });

    it('does not create duplicate inbound conversations for the same call SID', async () => {
      prisma.voiceConversation.findFirst.mockResolvedValue({ id: 'existing-conv' });

      await service.handleInboundVoice({
        body,
        headers: signedHeaders(body),
        requestUrl,
      });

      expect(prisma.voiceConversation.create).not.toHaveBeenCalled();
    });
  });

  describe('pending ADR targets', () => {
    it.todo('ADR target: reject unsigned webhooks in production when auth token is missing');
  });
});
