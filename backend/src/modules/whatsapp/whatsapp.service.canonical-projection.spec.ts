import { Logger } from '@nestjs/common';
import { WhatsAppMessageDeliveryStatus, WhatsAppAiDecision, WhatsAppAiMode } from '@prisma/client';
import { WhatsAppService } from './whatsapp.service';
import { CommunicationProjectionService } from '@modules/communication/communication-projection.service';
import { CommunicationProjectionFeatureService } from '@modules/communication/communication-projection-feature.service';
import { MetaWhatsAppCommunicationAdapter } from '@modules/communication/adapters/whatsapp/meta-whatsapp-communication.adapter';
import { WhatsAppCommunicationProjectionIntegration } from '@modules/communication/adapters/whatsapp/whatsapp-communication-projection.integration';

describe('WhatsAppService canonical outbound projection', () => {
  const orgId = 'org-1';
  const conversationId = 'convo-1';

  const baseConvo = {
    id: conversationId,
    organizationId: orgId,
    contactPhone: '+491701234567',
    customerId: 'cust-1',
    lastCustomerMessageAt: new Date(),
    status: 'OPEN',
  };

  const baseConfig = {
    organizationId: orgId,
    isActive: true,
    serviceWindowOpen: true,
    accessTokenConfigured: true,
    phoneNumberId: 'pn-1',
    aiMode: WhatsAppAiMode.FULL,
    aiAutoReplyEnabled: true,
  };

  let prisma: any;
  let provider: any;
  let policy: any;
  let consent: any;
  let audit: any;
  let projection: jest.Mocked<CommunicationProjectionService>;
  let integration: WhatsAppCommunicationProjectionIntegration;
  let service: WhatsAppService;

  beforeEach(() => {
    jest.clearAllMocks();

    const sentMessage = {
      id: 'msg-out-1',
      organizationId: orgId,
      conversationId,
      direction: 'outgoing',
      senderType: 'human',
      content: 'AI reply',
      status: WhatsAppMessageDeliveryStatus.SENT,
      providerMessageId: 'wamid.out.1',
      aiGenerated: false,
      aiSuggested: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prisma = {
      orgWhatsAppConfig: { findUnique: jest.fn().mockResolvedValue(baseConfig) },
      whatsAppConversation: {
        findFirst: jest.fn().mockResolvedValue(baseConvo),
        update: jest.fn(),
      },
      whatsAppMessage: {
        create: jest.fn().mockResolvedValue({ ...sentMessage, status: WhatsAppMessageDeliveryStatus.QUEUED }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...sentMessage,
            ...data,
          }),
        ),
      },
      whatsAppAiSuggestion: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    provider = {
      isConfigured: jest.fn().mockReturnValue(true),
      sendTextMessage: jest.fn().mockResolvedValue({
        status: 'SENT',
        providerMessageId: 'wamid.out.1',
      }),
    };

    policy = {
      canSendFreeText: jest.fn().mockReturnValue({ allowed: true }),
      assertAutoReplyAllowed: jest.fn(),
      canAutoReply: jest.fn().mockReturnValue({ allowed: true }),
    };

    consent = { assertCanSend: jest.fn() };
    audit = { record: jest.fn() };

    projection = {
      projectNormalizedInput: jest.fn().mockResolvedValue({
        conversationId: 'cc-1',
        eventId: 'ev-1',
        conversationCreated: false,
        eventCreated: true,
      }),
    } as any;

    const featureFlags = {
      isWhatsAppProjectionEnabled: jest.fn().mockReturnValue(true),
    } as unknown as CommunicationProjectionFeatureService;

    integration = new WhatsAppCommunicationProjectionIntegration(
      featureFlags,
      new MetaWhatsAppCommunicationAdapter(),
      projection,
    );

    service = new WhatsAppService(
      prisma,
      { route: jest.fn() } as any,
      { get: jest.fn() } as any,
      provider,
      consent,
      policy,
      {} as any,
      audit,
      integration,
    );
  });

  it('A: AI reply with latestSuggestion projects exactly one MESSAGE_SENT', async () => {
    prisma.whatsAppAiSuggestion.findFirst.mockResolvedValue({
      id: 'sug-1',
      decision: WhatsAppAiDecision.AUTO_ALLOWED,
      intent: 'PICKUP_INFO',
      confidence: 0.9,
      riskFlags: [],
    });

    await service.sendAiReply(orgId, conversationId, 'AI reply', 'sug-1');

    expect(projection.projectNormalizedInput).toHaveBeenCalledTimes(1);
    expect(projection.projectNormalizedInput.mock.calls[0][0].event.eventType).toBe('MESSAGE_SENT');
    expect(projection.projectNormalizedInput.mock.calls[0][0].event.actorType).toBe('AI_AGENT');
  });

  it('B: AI reply without latestSuggestion still projects exactly one MESSAGE_SENT', async () => {
    prisma.whatsAppAiSuggestion.findFirst.mockResolvedValue(null);

    await service.sendAiReply(orgId, conversationId, 'AI reply without suggestion');

    expect(projection.projectNormalizedInput).toHaveBeenCalledTimes(1);
    expect(projection.projectNormalizedInput.mock.calls[0][0].event.eventType).toBe('MESSAGE_SENT');
    expect(projection.projectNormalizedInput.mock.calls[0][0].event.actorType).toBe('AI_AGENT');
  });

  it('C: human sendMessage projects exactly one MESSAGE_SENT', async () => {
    await service.sendMessage(orgId, conversationId, 'Human reply');

    expect(projection.projectNormalizedInput).toHaveBeenCalledTimes(1);
    expect(projection.projectNormalizedInput.mock.calls[0][0].event.eventType).toBe('MESSAGE_SENT');
    expect(projection.projectNormalizedInput.mock.calls[0][0].event.actorType).toBe('USER');
  });

  it('D: sendAiReply does not double-project via sendMessage skip flag', async () => {
    prisma.whatsAppAiSuggestion.findFirst.mockResolvedValue({
      id: 'sug-1',
      decision: WhatsAppAiDecision.AUTO_ALLOWED,
      intent: 'PICKUP_INFO',
      confidence: 0.9,
      riskFlags: [],
    });

    await service.sendAiReply(orgId, conversationId, 'AI reply', 'sug-1');

    expect(provider.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(projection.projectNormalizedInput).toHaveBeenCalledTimes(1);
  });

  it('E: projection failure does not cause a second provider send', async () => {
    projection.projectNormalizedInput.mockRejectedValue(new Error('db down'));
    prisma.whatsAppAiSuggestion.findFirst.mockResolvedValue(null);

    await expect(
      service.sendAiReply(orgId, conversationId, 'AI reply without suggestion'),
    ).resolves.toBeDefined();

    expect(provider.sendTextMessage).toHaveBeenCalledTimes(1);
  });
});

describe('WhatsAppCommunicationProjectionIntegration safety', () => {
  it('resolves when adapter normalization throws before projection', async () => {
    const featureFlags = {
      isWhatsAppProjectionEnabled: jest.fn().mockReturnValue(true),
    } as unknown as CommunicationProjectionFeatureService;
    const adapter = {
      fromInbound: jest.fn(() => {
        throw new Error('sensitive phone +491701234567 in error');
      }),
    } as unknown as MetaWhatsAppCommunicationAdapter;
    const projection = {
      projectNormalizedInput: jest.fn(),
    } as unknown as CommunicationProjectionService;

    const integration = new WhatsAppCommunicationProjectionIntegration(
      featureFlags,
      adapter,
      projection,
    );

    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(
      integration.projectInbound({
        conversation: { id: 'wa-1', organizationId: 'org-1' } as any,
        message: { id: 'm-1', conversationId: 'wa-1', organizationId: 'org-1' } as any,
        webhookExternalEventId: 'msg:1',
      }),
    ).resolves.toBeUndefined();

    expect(projection.projectNormalizedInput).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    const logged = JSON.parse(String(warnSpy.mock.calls[0][0]));
    expect(logged.errorCode).toBe('PROJECTION_FAILURE');
    expect(logged).not.toHaveProperty('errorMessage');
    expect(JSON.stringify(logged)).not.toContain('+491701234567');

    warnSpy.mockRestore();
  });
});
