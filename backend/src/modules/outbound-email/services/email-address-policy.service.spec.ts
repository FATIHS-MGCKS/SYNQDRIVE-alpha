import { ConfigService } from '@nestjs/config';
import {
  OrgEmailDomainStatus,
  OrgEmailMode,
  type OrgEmailDomain,
  type OrgEmailSettings,
} from '@prisma/client';
import { EmailAddressPolicyService } from './email-address-policy.service';

describe('EmailAddressPolicyService', () => {
  const organization = {
    companyName: 'Acme Rental',
    invoiceEmail: 'billing@acme.test',
    email: 'office@acme.test',
    managerEmail: 'manager@acme.test',
  };

  const settingsBase: OrgEmailSettings = {
    id: 'settings-1',
    organizationId: 'org-1',
    mode: OrgEmailMode.SYNQDRIVE_DEFAULT,
    defaultFromName: 'Acme Team',
    defaultReplyToEmail: null,
    signatureHtml: null,
    signatureText: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const verifiedDomain: OrgEmailDomain = {
    id: 'domain-1',
    organizationId: 'org-1',
    domain: 'acme.test',
    fromEmail: 'noreply@acme.test',
    fromName: 'Acme',
    replyToEmail: 'support@acme.test',
    provider: 'dev',
    providerDomainId: 'dev-1',
    status: OrgEmailDomainStatus.VERIFIED,
    dnsRecords: [],
    lastCheckedAt: new Date(),
    verifiedAt: new Date(),
    failureReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let service: EmailAddressPolicyService;

  beforeEach(() => {
    const config = {
      get: (key: string, fallback?: string) => {
        const map: Record<string, string> = {
          'email.defaultFromEmail': 'noreply@synqdrive.eu',
          'email.defaultFromName': 'SynqDrive',
          'email.defaultReplyTo': 'platform@synqdrive.eu',
        };
        return map[key] ?? fallback;
      },
    } as unknown as ConfigService;
    service = new EmailAddressPolicyService(config);
  });

  it('uses SynqDrive default From when domain is not verified', () => {
    const result = service.resolve({
      organization,
      settings: { ...settingsBase, mode: OrgEmailMode.VERIFIED_DOMAIN },
      verifiedDomain: { ...verifiedDomain, status: OrgEmailDomainStatus.PENDING_DNS },
    });

    expect(result.fromEmail).toBe('noreply@synqdrive.eu');
    expect(result.usedVerifiedDomain).toBe(false);
    expect(result.usedFallback).toBe(true);
  });

  it('uses verified domain From when mode and status allow it', () => {
    const result = service.resolve({
      organization,
      settings: { ...settingsBase, mode: OrgEmailMode.VERIFIED_DOMAIN },
      verifiedDomain,
    });

    expect(result.fromEmail).toBe('noreply@acme.test');
    expect(result.fromName).toBe('Acme');
    expect(result.usedVerifiedDomain).toBe(true);
    expect(result.usedFallback).toBe(false);
  });

  it('blocks foreign domain in requested fromEmail and falls back', () => {
    const result = service.resolve({
      organization,
      settings: { ...settingsBase, mode: OrgEmailMode.VERIFIED_DOMAIN },
      verifiedDomain,
      requestedFromEmail: 'spoof@evil.test',
    });

    expect(result.fromEmail).toBe('noreply@synqdrive.eu');
    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe('REQUESTED_FROM_NOT_ON_VERIFIED_DOMAIN');
  });

  it('resolves Reply-To with org and platform fallbacks', () => {
    const withDomainReply = service.resolve({
      organization,
      settings: settingsBase,
      verifiedDomain,
    });
    expect(withDomainReply.replyToEmail).toBe('support@acme.test');

    const withSettingsReply = service.resolve({
      organization,
      settings: { ...settingsBase, defaultReplyToEmail: 'hello@acme.test' },
      verifiedDomain: null,
    });
    expect(withSettingsReply.replyToEmail).toBe('hello@acme.test');

    const orgFallback = service.resolve({
      organization,
      settings: settingsBase,
      verifiedDomain: null,
    });
    expect(orgFallback.replyToEmail).toBe('billing@acme.test');
  });
});
