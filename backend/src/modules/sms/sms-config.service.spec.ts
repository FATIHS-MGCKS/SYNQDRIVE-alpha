import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { buildSyntheticSmsConfigPublicDto } from './sms-config.public';
import { SmsConfigService } from './sms-config.service';

describe('SmsConfigService', () => {
  let service: SmsConfigService;
  const prisma = {
    orgSmsConfig: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
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

  it('returns safe public config without secrets when row exists', async () => {
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
      hasConfigRow: true,
      isConnected: false,
      isActive: false,
      credentialsConfigured: false,
      webhookSigningConfigured: false,
      senderProfileConfigured: false,
      webhookEndpointConfigured: false,
      lastWebhookAt: null,
      updatedAt: '2026-08-22T10:00:00.000Z',
    });
    expect(result).not.toHaveProperty('apiKey');
    expect(result).not.toHaveProperty('webhookSigningSecret');
  });

  it('GET sms config does not create OrgSmsConfig when no row exists', async () => {
    prisma.orgSmsConfig.findUnique.mockResolvedValue(null);

    const result = await service.getPublicConfig('org-1');

    expect(result).toEqual(buildSyntheticSmsConfigPublicDto('org-1'));
    expect(prisma.orgSmsConfig.create).not.toHaveBeenCalled();
    expect(prisma.orgSmsConfig.update).not.toHaveBeenCalled();
    expect(prisma.orgSmsConfig.upsert).not.toHaveBeenCalled();
  });

  it('parallel GET with no row returns synthetic DTO and never writes', async () => {
    prisma.orgSmsConfig.findUnique.mockResolvedValue(null);

    const [first, second] = await Promise.all([
      service.getPublicConfig('org-1'),
      service.getPublicConfig('org-1'),
    ]);

    expect(first).toEqual(buildSyntheticSmsConfigPublicDto('org-1'));
    expect(second).toEqual(buildSyntheticSmsConfigPublicDto('org-1'));
    expect(prisma.orgSmsConfig.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.orgSmsConfig.create).not.toHaveBeenCalled();
  });

  it('distinguishes existing row with partial flags from missing row', async () => {
    prisma.orgSmsConfig.findUnique.mockResolvedValue({
      organizationId: 'org-2',
      isConnected: false,
      isActive: false,
      apiKeyConfigured: true,
      webhookSigningSecretConfigured: false,
      senderProfileId: null,
      webhookEndpointId: null,
      lastWebhookAt: null,
      updatedAt: new Date('2026-08-22T11:00:00.000Z'),
    });

    const result = await service.getPublicConfig('org-2');

    expect(result.hasConfigRow).toBe(true);
    expect(result.credentialsConfigured).toBe(true);
    expect(result.webhookSigningConfigured).toBe(false);
    expect(result.updatedAt).toBe('2026-08-22T11:00:00.000Z');
  });
});
