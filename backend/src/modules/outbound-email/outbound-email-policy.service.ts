import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrgEmailDomainStatus, OrgEmailMode } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export interface ResolvedEmailIdentity {
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
  mode: OrgEmailMode;
  domainId: string | null;
}

@Injectable()
export class OutboundEmailPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async resolveIdentity(orgId: string): Promise<ResolvedEmailIdentity> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      include: {
        orgEmailSettings: true,
        orgEmailDomains: {
          where: { isActive: true, status: OrgEmailDomainStatus.VERIFIED },
          orderBy: { verifiedAt: 'desc' },
          take: 1,
        },
      },
    });

    const settings = org.orgEmailSettings;
    const mode = settings?.mode ?? OrgEmailMode.SYNQDRIVE_DEFAULT;
    const fromName =
      settings?.defaultFromName?.trim() ||
      this.config.get<string>('email.defaultFromName', 'SynqDrive') ||
      org.companyName;

    const defaultFrom = this.config.get<string>('email.defaultFrom', 'noreply@synqdrive.eu');
    const activeDomain = org.orgEmailDomains[0] ?? null;

    let fromEmail = defaultFrom;
    let domainId: string | null = null;

    if (mode === OrgEmailMode.CUSTOM_DOMAIN && activeDomain) {
      const local = activeDomain.fromLocalPart?.trim() || 'noreply';
      fromEmail = `${local}@${activeDomain.domain}`;
      domainId = activeDomain.id;
    }

    const replyToEmail = this.resolveReplyTo({
      settingsReplyTo: settings?.replyToEmail,
      invoiceEmail: org.invoiceEmail,
      orgEmail: org.email,
      managerEmail: org.managerEmail,
      defaultReplyTo: this.config.get<string>('email.defaultReplyTo', '') || null,
    });

    return { fromEmail, fromName, replyToEmail, mode, domainId };
  }

  resolveReplyTo(input: {
    settingsReplyTo?: string | null;
    invoiceEmail?: string | null;
    orgEmail?: string | null;
    managerEmail?: string | null;
    defaultReplyTo?: string | null;
  }): string | null {
    const candidates = [
      input.settingsReplyTo,
      input.invoiceEmail,
      input.orgEmail,
      input.managerEmail,
      input.defaultReplyTo,
    ];
    for (const value of candidates) {
      const trimmed = value?.trim();
      if (trimmed && this.isValidEmail(trimmed)) return trimmed;
    }
    return null;
  }

  isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  emailMatchesDomain(email: string, domain: string): boolean {
    const parts = email.toLowerCase().split('@');
    return parts.length === 2 && parts[1] === domain.toLowerCase();
  }
}
