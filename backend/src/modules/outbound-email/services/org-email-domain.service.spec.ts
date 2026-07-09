import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { OrgEmailDomainService } from './org-email-domain.service';

describe('OrgEmailDomainService — domain policy', () => {
  let service: OrgEmailDomainService;
  let prisma: {
    orgEmailDomain: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      orgEmailDomain: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const config = {
      get: (key: string, fallback?: unknown) => {
        if (key === 'email.domainVerificationProvider') return 'dev';
        if (key === 'email.devAutoVerifyDomains') return false;
        return fallback;
      },
    } as unknown as ConfigService;
    const audit = { record: jest.fn().mockResolvedValue('log-1') } as unknown as AuditService;
    service = new OrgEmailDomainService(
      prisma as unknown as PrismaService,
      config,
      audit,
    );
  });

  it('rejects fromEmail on foreign domain', async () => {
    await expect(
      service.create('org-1', {
        domain: 'acme.test',
        fromEmail: 'noreply@other.test',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orgEmailDomain.create).not.toHaveBeenCalled();
  });

  it('creates pending domain with DNS hints', async () => {
    prisma.orgEmailDomain.create.mockResolvedValue({
      id: 'd-1',
      domain: 'acme.test',
      status: 'PENDING_DNS',
    });

    await service.create('org-1', {
      domain: 'acme.test',
      fromEmail: 'noreply@acme.test',
      replyToEmail: 'support@acme.test',
    });

    expect(prisma.orgEmailDomain.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          domain: 'acme.test',
          fromEmail: 'noreply@acme.test',
          status: 'PENDING_DNS',
        }),
      }),
    );
  });
});
