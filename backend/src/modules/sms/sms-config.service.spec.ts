import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { SmsConfigService } from './sms-config.service';

describe('SmsConfigService', () => {
  let service: SmsConfigService;
  const prisma = {
    orgSmsConfig: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SmsConfigService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(SmsConfigService);
  });

  it('returns safe public config without secrets', async () => {
    prisma.orgSmsConfig.findUnique.mockResolvedValue({
      organizationId: 'org-1',
      isConnected: false,
      isActive: false,
      apiKeyConfigured: false,
      webhookSigningSecretConfigured: false,
      senderProfileId: null,
      webhookEndpointId: null,
      lastWebhookAt: null,
      updatedAt: new Date('2026-08-22T10:00:00.000Z'),
    });

    const result = await service.getPublicConfig('org-1');

    expect(result).toEqual({
      organizationId: 'org-1',
      isConnected: false,
      isActive: false,
      credentialsConfigured: false,
      webhookConfigured: false,
      senderProfileConfigured: false,
      webhookEndpointConfigured: false,
      lastWebhookAt: null,
      updatedAt: '2026-08-22T10:00:00.000Z',
    });
    expect(result).not.toHaveProperty('apiKey');
    expect(result).not.toHaveProperty('webhookSigningSecret');
  });
});
