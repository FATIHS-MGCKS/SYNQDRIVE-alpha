import { Test, TestingModule } from '@nestjs/testing';
import { OrgEmailMode } from '@prisma/client';
import { OutboundEmailPolicyService } from './outbound-email-policy.service';
import { PrismaService } from '@shared/database/prisma.service';
import { PlatformEmailSettingsService } from './platform-email-settings.service';

describe('OutboundEmailPolicyService', () => {
  let service: OutboundEmailPolicyService;

  const prisma = {
    organization: {
      findUniqueOrThrow: jest.fn(),
    },
  };

  const platformEmail = {
    getResolvedDefaults: jest.fn().mockResolvedValue({
      defaultFromEmail: 'noreply@synqdrive.eu',
      defaultFromName: 'SynqDrive',
      defaultReplyToEmail: 'support@synqdrive.eu',
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    platformEmail.getResolvedDefaults.mockResolvedValue({
      defaultFromEmail: 'noreply@synqdrive.eu',
      defaultFromName: 'SynqDrive',
      defaultReplyToEmail: 'support@synqdrive.eu',
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboundEmailPolicyService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlatformEmailSettingsService, useValue: platformEmail },
      ],
    }).compile();

    service = module.get(OutboundEmailPolicyService);
  });

  it('uses SynqDrive default from when mode is SYNQDRIVE_DEFAULT', async () => {
    prisma.organization.findUniqueOrThrow.mockResolvedValue({
      name: 'Acme Rental',
      email: 'info@acme.test',
      invoiceEmail: 'billing@acme.test',
      managerEmail: null,
      orgEmailSettings: { mode: OrgEmailMode.SYNQDRIVE_DEFAULT, defaultFromName: null },
      orgEmailDomains: [],
    });

    const identity = await service.resolveIdentity('org-1');
    expect(identity.fromEmail).toBe('noreply@synqdrive.eu');
    expect(identity.replyToEmail).toBe('billing@acme.test');
  });

  it('uses verified custom domain when mode is CUSTOM_DOMAIN', async () => {
    prisma.organization.findUniqueOrThrow.mockResolvedValue({
      name: 'Acme Rental',
      email: 'info@acme.test',
      invoiceEmail: null,
      managerEmail: null,
      orgEmailSettings: {
        mode: OrgEmailMode.CUSTOM_DOMAIN,
        defaultFromName: 'Acme Fleet',
        replyToEmail: 'fleet@acme.test',
      },
      orgEmailDomains: [
        {
          id: 'dom-1',
          domain: 'acme.test',
          fromLocalPart: 'documents',
          status: 'VERIFIED',
          isActive: true,
        },
      ],
    });

    const identity = await service.resolveIdentity('org-1');
    expect(identity.fromEmail).toBe('documents@acme.test');
    expect(identity.fromName).toBe('Acme Fleet');
    expect(identity.replyToEmail).toBe('fleet@acme.test');
  });

  it('falls back reply-to chain', () => {
    expect(
      service.resolveReplyTo({
        settingsReplyTo: null,
        invoiceEmail: null,
        orgEmail: 'office@tenant.test',
        managerEmail: null,
        defaultReplyTo: 'support@synqdrive.eu',
      }),
    ).toBe('office@tenant.test');
  });
});
