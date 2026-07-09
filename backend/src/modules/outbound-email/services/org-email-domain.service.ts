import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActivityAction, ActivityEntity, OrgEmailDomainStatus } from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildDevDnsRecords,
  emailBelongsToDomain,
  isValidEmail,
  normalizeDomain,
  type DnsRecordHint,
} from '../utils/email-domain.util';

export interface CreateOrgEmailDomainInput {
  domain: string;
  fromEmail: string;
  fromName?: string | null;
  replyToEmail?: string | null;
}

@Injectable()
export class OrgEmailDomainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string) {
    return this.prisma.orgEmailDomain.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getForOrg(organizationId: string, domainId: string) {
    const row = await this.prisma.orgEmailDomain.findFirst({
      where: { id: domainId, organizationId },
    });
    if (!row) throw new NotFoundException('Email domain not found');
    return row;
  }

  async create(
    organizationId: string,
    input: CreateOrgEmailDomainInput,
    auditCtx?: {
      actorUserId?: string;
      ipAddress?: string;
      userAgent?: string;
      route?: string;
    },
  ) {
    const domain = normalizeDomain(input.domain);
    if (!domain || domain.includes('@')) {
      throw new BadRequestException('Invalid domain');
    }

    const fromEmail = input.fromEmail.trim().toLowerCase();
    if (!isValidEmail(fromEmail)) {
      throw new BadRequestException('Invalid from email address');
    }
    if (!emailBelongsToDomain(fromEmail, domain)) {
      throw new BadRequestException(
        'fromEmail must belong to the configured domain — spoofing is not allowed',
      );
    }

    if (input.replyToEmail?.trim() && !isValidEmail(input.replyToEmail)) {
      throw new BadRequestException('Invalid reply-to email address');
    }

    const provider = this.config.get<string>('email.domainVerificationProvider', 'dev');
    const dnsRecords = this.generateDnsRecords(domain, provider);

    const created = await this.prisma.orgEmailDomain.create({
      data: {
        organizationId,
        domain,
        fromEmail,
        fromName: input.fromName?.trim() || null,
        replyToEmail: input.replyToEmail?.trim() || null,
        provider,
        status: OrgEmailDomainStatus.PENDING_DNS,
        dnsRecords: dnsRecords as unknown as object,
      },
    });

    void this.audit.record({
      actorUserId: auditCtx?.actorUserId,
      actorOrganizationId: organizationId,
      action: ActivityAction.CREATE,
      entity: ActivityEntity.ORGANIZATION,
      entityId: organizationId,
      description: `Email domain ${domain} configured (pending DNS)`,
      route: auditCtx?.route,
      ipAddress: auditCtx?.ipAddress,
      userAgent: auditCtx?.userAgent,
      metaJson: { domainId: created.id, domain, fromEmail },
    });

    return created;
  }

  async check(
    organizationId: string,
    domainId: string,
    auditCtx?: {
      actorUserId?: string;
      ipAddress?: string;
      userAgent?: string;
      route?: string;
    },
  ) {
    const row = await this.getForOrg(organizationId, domainId);
    const provider = this.config.get<string>('email.domainVerificationProvider', 'dev');
    const now = new Date();

    if (row.status === OrgEmailDomainStatus.VERIFIED) {
      return row;
    }

    const verification = await this.runDomainVerification(row.domain, row.dnsRecords, provider);

    const updated = await this.prisma.orgEmailDomain.update({
      where: { id: row.id },
      data: {
        status: verification.status,
        dnsRecords: verification.dnsRecords as unknown as object,
        lastCheckedAt: now,
        verifiedAt: verification.status === OrgEmailDomainStatus.VERIFIED ? now : null,
        failureReason: verification.failureReason ?? null,
        providerDomainId: verification.providerDomainId ?? row.providerDomainId,
      },
    });

    void this.audit.record({
      actorUserId: auditCtx?.actorUserId,
      actorOrganizationId: organizationId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.ORGANIZATION,
      entityId: organizationId,
      description: `Email domain ${row.domain} verification check → ${verification.status}`,
      route: auditCtx?.route,
      ipAddress: auditCtx?.ipAddress,
      userAgent: auditCtx?.userAgent,
      metaJson: { domainId: row.id, status: verification.status },
    });

    return updated;
  }

  private generateDnsRecords(domain: string, provider: string): DnsRecordHint[] {
    if (provider === 'dev') {
      return buildDevDnsRecords(domain);
    }
    // Placeholder for Resend/Postmark — same shape, provider-specific values later.
    return buildDevDnsRecords(domain);
  }

  private async runDomainVerification(
    domain: string,
    currentRecords: unknown,
    provider: string,
  ): Promise<{
    status: OrgEmailDomainStatus;
    dnsRecords: DnsRecordHint[];
    failureReason?: string;
    providerDomainId?: string;
  }> {
    const records = Array.isArray(currentRecords)
      ? (currentRecords as DnsRecordHint[])
      : buildDevDnsRecords(domain);

    if (provider === 'dev') {
      const autoVerify = this.config.get<boolean>('email.devAutoVerifyDomains', false);
      const allPending = records.every((r) => r.status === 'pending');

      if (autoVerify || !allPending) {
        const verifiedRecords = records.map((r) => ({ ...r, status: 'verified' as const }));
        return {
          status: OrgEmailDomainStatus.VERIFIED,
          dnsRecords: verifiedRecords,
          providerDomainId: `dev-domain-${normalizeDomain(domain)}`,
        };
      }

      const verifyingRecords = records.map((r) =>
        r.status === 'pending' ? { ...r, status: 'verified' as const } : r,
      );
      return {
        status: OrgEmailDomainStatus.VERIFYING,
        dnsRecords: verifyingRecords,
        providerDomainId: `dev-domain-${normalizeDomain(domain)}`,
      };
    }

    return {
      status: OrgEmailDomainStatus.PENDING_DNS,
      dnsRecords: records,
      failureReason: `${provider} domain verification adapter not implemented yet`,
    };
  }
}
