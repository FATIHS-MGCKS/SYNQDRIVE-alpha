import { ConfigService } from '@nestjs/config';
import { OutboundEmailSourceType, OutboundEmailStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DevEmailProvider } from '../providers/dev-email.provider';
import { EmailProviderFactory } from '../providers/email-provider.factory';
import { EmailAddressPolicyService } from './email-address-policy.service';
import { EmailSendGuardService } from './email-send-guard.service';
import { OrgEmailSettingsService } from './org-email-settings.service';
import { OutboundEmailService } from './outbound-email.service';

describe('OutboundEmailService — dev provider', () => {
  let service: OutboundEmailService;
  let prisma: {
    outboundEmail: {
      create: jest.Mock;
      update: jest.Mock;
    };
    outboundEmailEvent: {
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      outboundEmail: {
        create: jest.fn().mockResolvedValue({ id: 'mail-1', attachments: [] }),
        update: jest.fn().mockImplementation(({ data }) => ({
          id: 'mail-1',
          status: data.status,
          providerMessageId: data.providerMessageId,
          events: [],
          attachments: [],
        })),
      },
      outboundEmailEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
      },
    };

    const settingsService = {
      getOrganizationForPolicy: jest.fn().mockResolvedValue({
        companyName: 'Acme',
        invoiceEmail: null,
        email: null,
        managerEmail: null,
      }),
      getOrCreate: jest.fn().mockResolvedValue({
        mode: 'SYNQDRIVE_DEFAULT',
        defaultFromName: null,
        defaultReplyToEmail: null,
      }),
      getVerifiedDomain: jest.fn().mockResolvedValue(null),
    } as unknown as OrgEmailSettingsService;

    const config = {
      get: (key: string, fallback?: string) => {
        const map: Record<string, string> = {
          'email.defaultFromEmail': 'noreply@synqdrive.eu',
          'email.defaultFromName': 'SynqDrive',
          'email.defaultReplyTo': 'platform@synqdrive.eu',
          'email.provider': 'dev',
        };
        return map[key] ?? fallback;
      },
    } as unknown as ConfigService;

    const policy = new EmailAddressPolicyService(config);
    const devProvider = new DevEmailProvider();
    const providerFactory = {
      getProvider: () => devProvider,
    } as unknown as EmailProviderFactory;

    const sendGuard = {
      assertCanSend: jest.fn().mockResolvedValue(undefined),
    } as unknown as EmailSendGuardService;

    service = new OutboundEmailService(
      prisma as unknown as PrismaService,
      settingsService,
      policy,
      providerFactory,
      sendGuard,
    );
  });

  it('creates outbound email and marks SENT_SIMULATED via dev provider', async () => {
    const result = await service.sendExplicit({
      organizationId: 'org-1',
      sentByUserId: 'user-1',
      to: 'customer@example.test',
      subject: 'Test',
      bodyText: 'Hello',
      sourceType: OutboundEmailSourceType.MANUAL,
    });

    expect(prisma.outboundEmail.create).toHaveBeenCalled();
    expect(prisma.outboundEmailEvent.create).toHaveBeenCalled();
    expect(result.status).toBe(OutboundEmailStatus.SENT_SIMULATED);
  });
});
