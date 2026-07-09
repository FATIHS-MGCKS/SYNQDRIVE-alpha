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
  };
});
