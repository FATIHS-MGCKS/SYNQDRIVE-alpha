import type {
  EmailDnsRecordDto,
  OrgEmailDomainDto,
  OrgEmailMode,
  OrgEmailSettingsDto,
} from '../../../../lib/api';
import {
  PLATFORM_DEFAULT_FROM_EMAIL,
  PLATFORM_DEFAULT_FROM_NAME,
} from './email-delivery.constants';

export function parseDnsRecords(raw: unknown): EmailDnsRecordDto[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (row): row is EmailDnsRecordDto =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as EmailDnsRecordDto).type === 'string' &&
      typeof (row as EmailDnsRecordDto).host === 'string' &&
      typeof (row as EmailDnsRecordDto).value === 'string',
  );
}

export function pickPrimaryDomain(domains: OrgEmailDomainDto[]): OrgEmailDomainDto | null {
  if (!domains.length) return null;
  const verified = domains.find((d) => d.status === 'VERIFIED');
  return verified ?? domains[0];
}

export function hasVerifiedDomain(domains: OrgEmailDomainDto[]): boolean {
  return domains.some((d) => d.status === 'VERIFIED');
}

export interface EmailPreview {
  fromLine: string;
  replyTo: string;
}

export function buildEmailPreview(params: {
  orgName: string;
  settings: OrgEmailSettingsDto | null;
  primaryDomain: OrgEmailDomainDto | null;
}): EmailPreview {
  const { orgName, settings, primaryDomain } = params;
  const mode = settings?.mode ?? 'SYNQDRIVE_DEFAULT';
  const useVerified =
    mode === 'VERIFIED_DOMAIN' && primaryDomain?.status === 'VERIFIED';

  if (useVerified && primaryDomain) {
    const fromName =
      primaryDomain.fromName?.trim() ||
      settings?.defaultFromName?.trim() ||
      orgName ||
      PLATFORM_DEFAULT_FROM_NAME;
    const replyTo =
      primaryDomain.replyToEmail?.trim() ||
      settings?.defaultReplyToEmail?.trim() ||
      '—';
    return {
      fromLine: `${fromName} <${primaryDomain.fromEmail}>`,
      replyTo,
    };
  }

  const fromName =
    settings?.defaultFromName?.trim() || orgName || PLATFORM_DEFAULT_FROM_NAME;
  const replyTo = settings?.defaultReplyToEmail?.trim() || '—';
  return {
    fromLine: `${fromName} via SynqDrive <${PLATFORM_DEFAULT_FROM_EMAIL}>`,
    replyTo,
  };
}

export type DeliveryModeLabel =
  | 'synqdrive_default'
  | 'verified_domain'
  | 'setup_pending';

export function resolveDeliveryModeLabel(params: {
  settings: OrgEmailSettingsDto | null;
  domains: OrgEmailDomainDto[];
}): DeliveryModeLabel {
  const mode = params.settings?.mode ?? 'SYNQDRIVE_DEFAULT';
  if (mode === 'SYNQDRIVE_DEFAULT') return 'synqdrive_default';
  if (hasVerifiedDomain(params.domains)) return 'verified_domain';
  return 'setup_pending';
}

export function mapApiErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid domain')) {
    return 'Die eingegebene Domain ist ungültig. Bitte ohne http:// oder www eingeben.';
  }
  if (lower.includes('fromemail must belong') || lower.includes('spoofing')) {
    return 'Die Absenderadresse muss zur eingegebenen Domain gehören (z. B. info@ihredomain.de).';
  }
  if (lower.includes('invalid reply-to') || lower.includes('invalid from email')) {
    return 'Bitte prüfen Sie die E-Mail-Adressen — mindestens eine ist ungültig.';
  }
  if (lower.includes('only organization admins')) {
    return 'Nur Administratoren können den E-Mail-Versand konfigurieren.';
  }
  if (lower.includes('email send failed') || lower.includes('send failed')) {
    return 'Die Test-E-Mail konnte nicht gesendet werden. Bitte später erneut versuchen.';
  }
  if (lower.includes('domain not verified') || lower.includes('not verified')) {
    return 'Die Domain ist noch nicht verifiziert. Bitte zuerst die DNS-Einträge prüfen.';
  }
  return message;
}

export function effectiveDomainStatus(
  domains: OrgEmailDomainDto[],
  primary: OrgEmailDomainDto | null,
): OrgEmailDomainDto['status'] {
  if (!primary) return 'NOT_CONFIGURED';
  return primary.status;
}

export function canSelectVerifiedMode(domains: OrgEmailDomainDto[]): boolean {
  return hasVerifiedDomain(domains);
}

export function isVerifiedMode(mode: OrgEmailMode | undefined): boolean {
  return mode === 'VERIFIED_DOMAIN';
}
