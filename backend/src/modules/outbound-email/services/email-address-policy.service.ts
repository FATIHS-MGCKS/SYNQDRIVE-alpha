import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrgEmailDomainStatus,
  OrgEmailMode,
  type OrgEmailDomain,
  type OrgEmailSettings,
  type Organization,
} from '@prisma/client';
import { emailBelongsToDomain } from '../utils/email-domain.util';

export interface ResolvedEmailAddresses {
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  usedVerifiedDomain: boolean;
  usedFallback: boolean;
  fallbackReason?: string;
}

export interface EmailPolicyContext {
  organization: Pick<
    Organization,
    'companyName' | 'invoiceEmail' | 'email' | 'managerEmail'
  >;
  settings: OrgEmailSettings;
  verifiedDomain: OrgEmailDomain | null;
  requestedFromEmail?: string | null;
}

@Injectable()
export class EmailAddressPolicyService {
  constructor(private readonly config: ConfigService) {}

  resolve(context: EmailPolicyContext): ResolvedEmailAddresses {
    const defaultFromEmail = this.config.get<string>(
      'email.defaultFromEmail',
      'noreply@synqdrive.eu',
    );
    const defaultFromName = this.config.get<string>(
      'email.defaultFromName',
      'SynqDrive',
    );
    const platformReplyTo = this.config.get<string>(
      'email.defaultReplyTo',
      'support@synqdrive.eu',
    );

    const replyToEmail = this.resolveReplyTo(context, platformReplyTo);

    const verifiedDomain = context.verifiedDomain;
    const canUseVerifiedDomain =
      context.settings.mode === OrgEmailMode.VERIFIED_DOMAIN &&
      verifiedDomain?.status === OrgEmailDomainStatus.VERIFIED &&
      emailBelongsToDomain(verifiedDomain.fromEmail, verifiedDomain.domain);

    if (canUseVerifiedDomain) {
      const requested = context.requestedFromEmail?.trim();
      if (requested && !emailBelongsToDomain(requested, verifiedDomain.domain)) {
        return {
          fromEmail: defaultFromEmail,
          fromName:
            context.settings.defaultFromName?.trim() ||
            verifiedDomain.fromName?.trim() ||
            context.organization.companyName ||
            defaultFromName,
          replyToEmail,
          usedVerifiedDomain: false,
          usedFallback: true,
          fallbackReason: 'REQUESTED_FROM_NOT_ON_VERIFIED_DOMAIN',
        };
      }

      return {
        fromEmail: verifiedDomain.fromEmail,
        fromName:
          verifiedDomain.fromName?.trim() ||
          context.settings.defaultFromName?.trim() ||
          context.organization.companyName ||
          defaultFromName,
        replyToEmail,
        usedVerifiedDomain: true,
        usedFallback: false,
      };
    }

    let fallbackReason: string | undefined;
    if (context.settings.mode === OrgEmailMode.VERIFIED_DOMAIN) {
      fallbackReason = verifiedDomain
        ? `DOMAIN_STATUS_${verifiedDomain.status}`
        : 'NO_VERIFIED_DOMAIN';
    }
    if (context.requestedFromEmail?.trim()) {
      fallbackReason = fallbackReason ?? 'UNVERIFIED_FROM_REQUEST';
    }

    return {
      fromEmail: defaultFromEmail,
      fromName:
        context.settings.defaultFromName?.trim() ||
        context.organization.companyName ||
        defaultFromName,
      replyToEmail,
      usedVerifiedDomain: false,
      usedFallback: Boolean(fallbackReason),
      fallbackReason,
    };
  }

  private resolveReplyTo(
    context: EmailPolicyContext,
    platformReplyTo: string,
  ): string {
    const verified = context.verifiedDomain;
    if (verified?.status === OrgEmailDomainStatus.VERIFIED && verified.replyToEmail?.trim()) {
      return verified.replyToEmail.trim();
    }
    if (context.settings.defaultReplyToEmail?.trim()) {
      return context.settings.defaultReplyToEmail.trim();
    }
    const org = context.organization;
    return (
      org.invoiceEmail?.trim() ||
      org.email?.trim() ||
      org.managerEmail?.trim() ||
      platformReplyTo
    );
  }
}
