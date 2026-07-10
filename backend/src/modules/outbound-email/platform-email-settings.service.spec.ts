import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PlatformEmailSettingsService } from './platform-email-settings.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('PlatformEmailSettingsService', () => {
  let service: PlatformEmailSettingsService;

  const prisma = {
    platformEmailSettings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      const map: Record<string, string> = {
        'email.defaultFrom': 'noreply@synqdrive.eu',
        'email.defaultFromName': 'SynqDrive',
        'email.defaultReplyTo': 'support@synqdrive.eu',
      };
      return map[key] ?? fallback;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformEmailSettingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(PlatformEmailSettingsService);
  });

  it('falls back to env defaults when no DB row exists', async () => {
    prisma.platformEmailSettings.findUnique.mockResolvedValue(null);
    const defaults = await service.getResolvedDefaults();
    expect(defaults.defaultFromEmail).toBe('noreply@synqdrive.eu');
    expect(defaults.defaultFromName).toBe('SynqDrive');
  });

  it('uses DB values when configured', async () => {
    prisma.platformEmailSettings.findUnique.mockResolvedValue({
      defaultFromEmail: 'documents@tenant.test',
      defaultFromName: 'SynqDrive Platform',
      defaultReplyToEmail: 'help@tenant.test',
    });
    const defaults = await service.getResolvedDefaults();
    expect(defaults.defaultFromEmail).toBe('documents@tenant.test');
    expect(defaults.defaultReplyToEmail).toBe('help@tenant.test');
  });
});
