import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrgEmailDomainStatus, OrgEmailMode } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { EmailProviderRegistry } from './providers/email-provider.registry';
import { PlatformEmailSettingsService } from './platform-email-settings.service';

export interface OrgEmailSettingsDto {
  mode: OrgEmailMode;
  defaultFromName: string | null;
  replyToEmail: string | null;
  signatureHtml: string | null;
  platformSender: {
    fromEmail: string;
    fromName: string;
    replyToEmail: string | null;
  };
}

export interface OrgEmailDomainDto {
  id: string;
  domain: string;
  status: OrgEmailDomainStatus;
  fromLocalPart: string;
  dnsRecords: unknown;
  failureReason: string | null;
  isActive: boolean;
  lastCheckedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

@Injectable()
export class OutboundEmailDomainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: EmailProviderRegistry,
    private readonly platformEmail: PlatformEmailSettingsService,
  ) {}

  async getSettings(orgId: string): Promise<OrgEmailSettingsDto> {
    const [settings, platformDefaults] = await Promise.all([
      this.ensureSettings(orgId),
      this.platformEmail.getResolvedDefaults(),
    ]);
    return this.toSettingsDto(settings, platformDefaults);
  }

  async updateSettings(
    orgId: string,
    input: Partial<OrgEmailSettingsDto>,
  ): Promise<OrgEmailSettingsDto> {
    if (input.mode === OrgEmailMode.CUSTOM_DOMAIN) {
      const verified = await this.prisma.orgEmailDomain.count({
        where: { organizationId: orgId, status: OrgEmailDomainStatus.VERIFIED },
      });
      if (verified === 0) {
        throw new BadRequestException(
          'Custom domain mode requires at least one verified domain',
        );
      }
    }

    const settings = await this.prisma.orgEmailSettings.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        mode: input.mode ?? OrgEmailMode.SYNQDRIVE_DEFAULT,
        defaultFromName: input.defaultFromName ?? null,
        replyToEmail: input.replyToEmail ?? null,
        signatureHtml: input.signatureHtml ?? null,
      },
      update: {
        ...(input.mode !== undefined ? { mode: input.mode } : {}),
        ...(input.defaultFromName !== undefined
          ? { defaultFromName: input.defaultFromName }
          : {}),
        ...(input.replyToEmail !== undefined ? { replyToEmail: input.replyToEmail } : {}),
        ...(input.signatureHtml !== undefined ? { signatureHtml: input.signatureHtml } : {}),
      },
    });

    const platformDefaults = await this.platformEmail.getResolvedDefaults();
    return this.toSettingsDto(settings, platformDefaults);
  }

  async listDomains(orgId: string): Promise<OrgEmailDomainDto[]> {
    const rows = await this.prisma.orgEmailDomain.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDomainDto(r));
  }

  async addDomain(
    orgId: string,
    domain: string,
    fromLocalPart = 'noreply',
  ): Promise<OrgEmailDomainDto> {
    const normalized = domain.trim().toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalized)) {
      throw new BadRequestException('Invalid domain name');
    }

    const provider = this.providers.resolveForDomains();
    const registered = await provider.registerDomain?.({ domain: normalized });
    if (!registered) {
      throw new BadRequestException('Domain registration is not available for the current provider');
    }

    const row = await this.prisma.orgEmailDomain.create({
      data: {
        organizationId: orgId,
        domain: normalized,
        status: this.mapProviderStatus(registered.status),
        providerDomainId: registered.providerDomainId,
        fromLocalPart: fromLocalPart.trim() || 'noreply',
        dnsRecords: registered.dnsRecords as object,
      },
    });

    return this.toDomainDto(row);
  }

  async verifyDomain(orgId: string, domainId: string): Promise<OrgEmailDomainDto> {
    const row = await this.getDomainOrThrow(orgId, domainId);
    if (!row.providerDomainId) {
      throw new BadRequestException('Domain has no provider registration');
    }

    const provider = this.providers.resolveForDomains();
    const result = await provider.verifyDomain?.(row.providerDomainId);
    if (!result) {
      throw new BadRequestException('Domain verification is not available');
    }

    const refreshed = await provider.getDomain?.(row.providerDomainId);
    const status = this.mapProviderStatus(refreshed?.status || result.status);
    const verifiedAt =
      status === OrgEmailDomainStatus.VERIFIED ? new Date() : row.verifiedAt;

    const updated = await this.prisma.orgEmailDomain.update({
      where: { id: domainId },
      data: {
        status,
        dnsRecords: (refreshed?.dnsRecords ?? result.dnsRecords ?? row.dnsRecords) as object,
        failureReason: refreshed?.failureReason ?? result.failureReason ?? null,
        lastCheckedAt: new Date(),
        verifiedAt,
        isActive: status === OrgEmailDomainStatus.VERIFIED ? row.isActive : false,
      },
    });

    return this.toDomainDto(updated);
  }

  async activateDomain(orgId: string, domainId: string): Promise<OrgEmailDomainDto> {
    const row = await this.getDomainOrThrow(orgId, domainId);
    if (row.status !== OrgEmailDomainStatus.VERIFIED) {
      throw new BadRequestException('Only verified domains can be activated');
    }

    await this.prisma.$transaction([
      this.prisma.orgEmailDomain.updateMany({
        where: { organizationId: orgId, id: { not: domainId } },
        data: { isActive: false },
      }),
      this.prisma.orgEmailDomain.update({
        where: { id: domainId },
        data: { isActive: true },
      }),
      this.prisma.orgEmailSettings.upsert({
        where: { organizationId: orgId },
        create: { organizationId: orgId, mode: OrgEmailMode.CUSTOM_DOMAIN },
        update: { mode: OrgEmailMode.CUSTOM_DOMAIN },
      }),
    ]);

    const updated = await this.getDomainOrThrow(orgId, domainId);
    return this.toDomainDto(updated);
  }

  async deleteDomain(orgId: string, domainId: string): Promise<void> {
    await this.getDomainOrThrow(orgId, domainId);
    await this.prisma.orgEmailDomain.delete({ where: { id: domainId } });
  }

  private async ensureSettings(orgId: string) {
    return this.prisma.orgEmailSettings.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId },
      update: {},
    });
  }

  private async getDomainOrThrow(orgId: string, domainId: string) {
    const row = await this.prisma.orgEmailDomain.findFirst({
      where: { id: domainId, organizationId: orgId },
    });
    if (!row) throw new NotFoundException('Email domain not found');
    return row;
  }

  private mapProviderStatus(status: string): OrgEmailDomainStatus {
    const normalized = status.toUpperCase();
    if (normalized.includes('VERIFIED')) return OrgEmailDomainStatus.VERIFIED;
    if (normalized.includes('FAIL')) return OrgEmailDomainStatus.FAILED;
    if (normalized.includes('VERIFY')) return OrgEmailDomainStatus.VERIFYING;
    if (normalized.includes('NOT')) return OrgEmailDomainStatus.NOT_CONFIGURED;
    return OrgEmailDomainStatus.PENDING_DNS;
  }

  private toSettingsDto(
    row: {
      mode: OrgEmailMode;
      defaultFromName: string | null;
      replyToEmail: string | null;
      signatureHtml: string | null;
    },
    platformDefaults: {
      defaultFromEmail: string;
      defaultFromName: string;
      defaultReplyToEmail: string | null;
    },
  ): OrgEmailSettingsDto {
    return {
      mode: row.mode,
      defaultFromName: row.defaultFromName,
      replyToEmail: row.replyToEmail,
      signatureHtml: row.signatureHtml,
      platformSender: {
        fromEmail: platformDefaults.defaultFromEmail,
        fromName: platformDefaults.defaultFromName,
        replyToEmail: platformDefaults.defaultReplyToEmail,
      },
    };
  }

  private toDomainDto(row: {
    id: string;
    domain: string;
    status: OrgEmailDomainStatus;
    fromLocalPart: string;
    dnsRecords: unknown;
    failureReason: string | null;
    isActive: boolean;
    lastCheckedAt: Date | null;
    verifiedAt: Date | null;
    createdAt: Date;
  }): OrgEmailDomainDto {
    return {
      id: row.id,
      domain: row.domain,
      status: row.status,
      fromLocalPart: row.fromLocalPart,
      dnsRecords: row.dnsRecords,
      failureReason: row.failureReason,
      isActive: row.isActive,
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
