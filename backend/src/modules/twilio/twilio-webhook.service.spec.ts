import { UnauthorizedException } from '@nestjs/common';
import { VoiceAssistantStatus, VoicePstnProvider } from '@prisma/client';
import { TwilioWebhookService } from './twilio-webhook.service';

describe('TwilioWebhookService', () => {
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

  const twilio = {
    isConfigured: jest.fn().mockReturnValue(true),
    getVoiceWebhookBaseUrl: jest.fn().mockReturnValue('https://app.synqdrive.eu'),
  };

  const config = {
    get: jest.fn((key: string): string | undefined => {
      if (key === 'twilio.authToken') return '';
      return undefined;
    }),
  };

  const bridge = {
    buildInboundTwiml: jest.fn().mockReturnValue('<Response><Say>Hi</Say></Response>'),
  };

  const voiceWebhookIngest = {
    ingestTwilioEvent: jest.fn().mockResolvedValue({ accepted: true, duplicate: false, eventId: 'evt-1', queued: true }),
  };

  let service: TwilioWebhookService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.voiceAssistant.findFirst.mockResolvedValue({
      id: 'asst-1',
      organizationId: 'org-1',
      elevenLabsAgentId: 'agent-1',
      status: VoiceAssistantStatus.ACTIVE,
      pstnProvider: VoicePstnProvider.TWILIO,
      phoneNumber: '+491234',
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
      twilio as never,
      config as never,
      bridge as never,
      voiceWebhookIngest as never,
    );
  });

  it('builds inbound TwiML without throwing when webhook signing is unset in non-production', async () => {
    const twiml = await service.handleInboundVoice({
      body: {
        CallSid: 'CA123',
        From: '+49999',
        To: '+491234',
        Direction: 'inbound',
      },
      headers: {},
      requestUrl: 'https://app.synqdrive.eu/api/v1/webhooks/twilio/voice',
    });

    expect(twiml).toContain('Response');
    expect(prisma.voiceConversation.create).toHaveBeenCalled();
  });

  it('rejects invalid signatures in production when auth token is configured', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    config.get.mockImplementation((key: string) => {
      if (key === 'twilio.authToken') return 'secret';
      return undefined;
    });

    await expect(
      service.handleInboundVoice({
        body: { CallSid: 'CA123', From: '+49999', To: '+491234' },
        headers: { 'x-twilio-signature': 'invalid' },
        requestUrl: 'https://app.synqdrive.eu/api/v1/webhooks/twilio/voice',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    process.env.NODE_ENV = originalEnv;
  });
});
