import { WhatsAppService } from './whatsapp.service';
import { WhatsAppSimulationDisabledException } from './utils/whatsapp-errors';
import { WhatsAppAiMode } from '@prisma/client';

describe('WhatsAppService simulation', () => {
  const prisma = {
    orgWhatsAppConfig: { findUnique: jest.fn() },
    whatsAppConversation: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    whatsAppMessage: { create: jest.fn() },
  };
  const configService = { get: jest.fn() };
  const matcher = { matchContext: jest.fn() };
  const consent = { processInboundConsentKeywords: jest.fn() };
  const audit = { record: jest.fn() };

  let service: WhatsAppService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WhatsAppService(
      prisma as any,
      { route: jest.fn() } as any,
      configService as any,
      {} as any,
      consent as any,
      {} as any,
      matcher as any,
      audit as any,
    );
  });

  it('simulateIncoming disabled in production', async () => {
    configService.get.mockReturnValue(false);
    await expect(
      service.simulateIncoming('org-1', { contactPhone: '+49170', content: 'Hi' }),
    ).rejects.toBeInstanceOf(WhatsAppSimulationDisabledException);
  });
});

describe('WhatsAppService sendMessage provider guard', () => {
  const prisma = {
    orgWhatsAppConfig: {
      findUnique: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        isActive: true,
        serviceWindowOpen: true,
        accessTokenConfigured: false,
        phoneNumberId: null,
        aiMode: WhatsAppAiMode.OFF,
      }),
    },
    whatsAppConversation: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'convo-1',
        organizationId: 'org-1',
        contactPhone: '+491701234567',
        customerId: 'c-1',
        lastCustomerMessageAt: new Date(),
      }),
      update: jest.fn(),
    },
    whatsAppMessage: {
      create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
      update: jest.fn(),
    },
  };

  const provider = { isConfigured: jest.fn().mockReturnValue(false) };
  const policy = {
    canSendFreeText: jest.fn().mockReturnValue({ allowed: true }),
  };
  const consent = { assertCanSend: jest.fn() };
  const audit = { record: jest.fn() };

  it('fails when provider missing', async () => {
    const service = new WhatsAppService(
      prisma as any,
      { route: jest.fn() } as any,
      { get: jest.fn() } as any,
      provider as any,
      consent as any,
      policy as any,
      {} as any,
      audit as any,
    );

    await expect(service.sendMessage('org-1', 'convo-1', 'Hello')).rejects.toBeInstanceOf(
      (await import('./utils/whatsapp-errors')).WhatsAppProviderNotConfiguredException,
    );
  });
});
