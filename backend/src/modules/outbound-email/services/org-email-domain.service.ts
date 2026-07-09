import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActivityAction, ActivityEntity, OrgEmailDomainStatus } from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { ResendDomainAdapter } from '../providers/resend/resend-domain.adapter';
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
    private readonly resendDomain: ResendDomainAdapter,
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
    const { dnsRecords, providerDomainId, initialStatus } =
      await this.provisionProviderDomain(domain, provider);

    const created = await this.prisma.orgEmailDomain.create({
      data: {
        organizationId,
        domain,
        fromEmail,
        fromName: input.fromName?.trim() || null,
        replyToEmail: input.replyToEmail?.trim() || null,
        provider,
        providerDomainId,
        status: initialStatus ?? OrgEmailDomainStatus.PENDING_DNS,
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

    const verification = await this.runDomainVerification(
      row.domain,
      row.dnsRecords,
      provider,
      row.providerDomainId,
    );

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

  private async provisionProviderDomain(
    domain: string,
    provider: string,
  ): Promise<{
    dnsRecords: DnsRecordHint[];
    providerDomainId: string | null;
    initialStatus?: OrgEmailDomainStatus;
  }> {
    if (provider === 'resend' && this.resendDomain.isAvailable()) {
      try {
        const provisioned = await this.resendDomain.provisionDomain(domain);
        return {
          dnsRecords: provisioned.dnsRecords,
          providerDomainId: provisioned.providerDomainId,
          initialStatus: provisioned.status,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Resend domain provisioning failed';
        throw new BadRequestException(message);
      }
    }

    return {
      dnsRecords: this.generateDnsRecords(domain, provider),
      providerDomainId: provider === 'dev' ? `dev-domain-${normalizeDomain(domain)}` : null,
      initialStatus: OrgEmailDomainStatus.PENDING_DNS,
    };
  }

  private generateDnsRecords(domain: string, provider: string): DnsRecordHint[] {
    if (provider === 'dev') {
      return buildDevDnsRecords(domain);
    }
    return buildDevDnsRecords(domain);
  }

  private async runDomainVerification(
    domain: string,
    currentRecords: unknown,
    provider: string,
    providerDomainId?: string | null,
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
          providerDomainId: providerDomainId ?? `dev-domain-${normalizeDomain(domain)}`,
        };
      }

      const verifyingRecords = records.map((r) =>
        r.status === 'pending' ? { ...r, status: 'verified' as const } : r,
      );
      return {
        status: OrgEmailDomainStatus.VERIFYING,
        dnsRecords: verifyingRecords,
        providerDomainId: providerDomainId ?? `dev-domain-${normalizeDomain(domain)}`,
      };
    }

    if (provider === 'resend' && providerDomainId && this.resendDomain.isAvailable()) {
      try {
        const verification = await this.resendDomain.verifyDomain(
          domain,
          providerDomainId,
          records,
        );
        return {
          status: verification.status,
          dnsRecords: verification.dnsRecords,
          failureReason: verification.failureReason,
          providerDomainId: verification.providerDomainId ?? providerDomainId,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Domain verification failed';
        return {
          status: OrgEmailDomainStatus.PENDING_DNS,
          dnsRecords: records,
          failureReason: message,
          providerDomainId,
        };
      }
    }

    return {
      status: OrgEmailDomainStatus.PENDING_DNS,
      dnsRecords: records,
      failureReason: `${provider} domain verification adapter not implemented yet`,
    };
  }
}
