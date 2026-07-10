import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OrgEmailDomainStatus, OrgEmailMode } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { PlatformEmailSettingsService } from './platform-email-settings.service';

export interface ResolvedEmailIdentity {
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
  mode: OrgEmailMode;
  domainId: string | null;
}

@Injectable()
export class OutboundEmailPolicyService {
  private readonly logger = new Logger(OutboundEmailPolicyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformEmail: PlatformEmailSettingsService,
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
    const platformDefaults = await this.platformEmail.getResolvedDefaults();
    const fromName =
      settings?.defaultFromName?.trim() ||
      platformDefaults.defaultFromName ||
      org.companyName;

    const defaultFrom = platformDefaults.defaultFromEmail;
    const activeDomain = org.orgEmailDomains[0] ?? null;

    let fromEmail = defaultFrom;
    let domainId: string | null = null;

    if (mode === OrgEmailMode.CUSTOM_DOMAIN) {
      if (!activeDomain) {
        this.logger.warn(
          `Org ${orgId} is in CUSTOM_DOMAIN mode but has no active verified domain — falling back to platform sender`,
        );
      } else {
        const local = activeDomain.fromLocalPart?.trim() || 'noreply';
        fromEmail = `${local}@${activeDomain.domain}`;
        domainId = activeDomain.id;
      }
    }

    const replyToEmail = this.resolveReplyTo({
      settingsReplyTo: settings?.replyToEmail,
      invoiceEmail: org.invoiceEmail,
      orgEmail: org.email,
      managerEmail: org.managerEmail,
      defaultReplyTo: platformDefaults.defaultReplyToEmail,
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

  validateRecipientEmails(emails: string[] | undefined, label: string) {
    for (const email of emails ?? []) {
      const trimmed = email?.trim();
      if (!trimmed) continue;
      if (!this.isValidEmail(trimmed)) {
        throw new BadRequestException(`Invalid ${label} email: ${trimmed}`);
      }
    }
  }
}
