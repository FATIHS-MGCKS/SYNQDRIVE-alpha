import { registerAs } from '@nestjs/config';

export type EmailProviderId = 'dev' | 'resend' | 'postmark';
export type EmailDomainVerificationProviderId = 'dev' | 'resend' | 'postmark';

function parseProvider(value: string | undefined, fallback: EmailProviderId): EmailProviderId {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'resend' || normalized === 'postmark' || normalized === 'dev') {
    return normalized;
  }
  return fallback;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default registerAs('email', () => {
  const provider = parseProvider(process.env.EMAIL_PROVIDER, 'dev');
  const domainVerificationProvider = parseProvider(
    process.env.EMAIL_DOMAIN_VERIFICATION_PROVIDER,
    provider === 'resend' || provider === 'postmark' ? provider : 'dev',
  ) as EmailDomainVerificationProviderId;

  return {
    provider,
    domainVerificationProvider,
    defaultFromEmail:
      process.env.EMAIL_DEFAULT_FROM_EMAIL?.trim() || 'noreply@synqdrive.eu',
    defaultFromName: process.env.EMAIL_DEFAULT_FROM_NAME?.trim() || 'SynqDrive',
    defaultReplyTo:
      process.env.EMAIL_DEFAULT_REPLY_TO?.trim() || 'support@synqdrive.eu',
    /** Dev-only: first domain check immediately verifies DNS. */
    devAutoVerifyDomains:
      process.env.EMAIL_DEV_AUTO_VERIFY_DOMAINS?.trim() === 'true',
    resendApiKey: process.env.RESEND_API_KEY?.trim() || '',
    resendApiBaseUrl:
      process.env.RESEND_API_BASE_URL?.trim() || 'https://api.resend.com',
    resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET?.trim() || '',
    maxSendsPerOrgPerHour: parsePositiveInt(
      process.env.EMAIL_MAX_SENDS_PER_ORG_PER_HOUR,
      120,
    ),
    maxAttachments: parsePositiveInt(process.env.EMAIL_MAX_ATTACHMENTS, 10),
    maxAttachmentBytes: parsePositiveInt(
      process.env.EMAIL_MAX_ATTACHMENT_BYTES,
      10 * 1024 * 1024,
    ),
    maxTotalAttachmentBytes: parsePositiveInt(
      process.env.EMAIL_MAX_TOTAL_ATTACHMENT_BYTES,
      25 * 1024 * 1024,
    ),
    maxRecipients: parsePositiveInt(process.env.EMAIL_MAX_RECIPIENTS, 20),
  };
});
