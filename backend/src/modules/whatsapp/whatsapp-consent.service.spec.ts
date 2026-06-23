import { WhatsAppConsentService } from './whatsapp-consent.service';
import { WhatsAppConsentBlockedException } from './utils/whatsapp-errors';

describe('WhatsAppConsentService', () => {
  const prisma = {
    whatsAppConsent: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const audit = { record: jest.fn() };
  let service: WhatsAppConsentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WhatsAppConsentService(prisma as any, audit as any);
  });

  it('blocks outbound when opted out', async () => {
    prisma.whatsAppConsent.findUnique.mockResolvedValue({
      optedOutAt: new Date('2026-01-02'),
      optedInAt: null,
      transactionalAllowed: true,
    });

    await expect(
      service.assertCanSend('org-1', '+491701234567', 'support'),
    ).rejects.toBeInstanceOf(WhatsAppConsentBlockedException);
  });

  it('sets opt-out on STOP keyword', async () => {
    prisma.whatsAppConsent.upsert.mockResolvedValue({});
    const result = await service.processInboundConsentKeywords(
      'org-1',
      '01701234567',
      'STOP',
      'cust-1',
    );
    expect(result).toBe('opt_out');
    expect(prisma.whatsAppConsent.upsert).toHaveBeenCalled();
  });
});
