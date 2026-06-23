import { WhatsAppWebhookService } from './whatsapp-webhook.service';
import { WhatsAppMessageDeliveryStatus } from '@prisma/client';

describe('WhatsAppWebhookService idempotency', () => {
  const prisma = {
    whatsAppWebhookEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    orgWhatsAppConfig: {
      findFirst: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        phoneNumberId: 'pn-1',
        accessTokenConfigured: true,
        appSecretConfigured: false,
        webhookVerifyToken: 'tok',
        metaApiVersion: 'v21.0',
      }),
      update: jest.fn(),
    },
    whatsAppMessage: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    whatsAppConversation: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const provider = {
    parseWebhook: jest.fn(),
    validateSignature: jest.fn().mockReturnValue(true),
  };
  const matcher = {
    matchContext: jest.fn().mockResolvedValue({
      customerId: null,
      bookingId: null,
      vehicleId: null,
      contactName: null,
      status: 'PENDING_HUMAN',
    }),
  };
  const consent = { processInboundConsentKeywords: jest.fn() };
  const audit = { record: jest.fn() };
  const whatsAppService = { processInboundAutoReply: jest.fn().mockResolvedValue(undefined) };

  let service: WhatsAppWebhookService;

  const inboundEntry = {
    externalEventId: 'msg:wamid.abc',
    eventType: 'messages',
    inboundMessage: {
      providerMessageId: 'wamid.abc',
      fromPhone: '491701234567',
      body: 'Hello',
      timestamp: new Date(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    provider.parseWebhook.mockReturnValue({
      phoneNumberId: 'pn-1',
      entries: [inboundEntry],
    });
    prisma.whatsAppWebhookEvent.findUnique.mockResolvedValue(null);
    prisma.whatsAppMessage.findUnique.mockResolvedValue(null);
    prisma.whatsAppConversation.findUnique.mockResolvedValue(null);
    prisma.whatsAppConversation.create.mockResolvedValue({ id: 'convo-1' });
    prisma.whatsAppMessage.create.mockResolvedValue({ id: 'm-1' });
    prisma.whatsAppWebhookEvent.create.mockResolvedValue({ id: 'evt-1' });

    service = new WhatsAppWebhookService(
      prisma as any,
      provider as any,
      matcher as any,
      consent as any,
      audit as any,
      whatsAppService as any,
    );
  });

  it('creates inbound message from webhook', async () => {
    await service.receiveWebhook(Buffer.from('{}'), {}, {});
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerMessageId: 'wamid.abc',
          status: WhatsAppMessageDeliveryStatus.DELIVERED,
        }),
      }),
    );
    expect(whatsAppService.processInboundAutoReply).toHaveBeenCalledWith('org-1', 'convo-1');
  });

  it('skips duplicate provider message', async () => {
    prisma.whatsAppMessage.findUnique.mockResolvedValue({ id: 'existing' });
    await service.receiveWebhook(Buffer.from('{}'), {}, {});
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });
});
