import { registerAs } from '@nestjs/config';

export default registerAs('email', () => ({
  provider: (process.env.EMAIL_PROVIDER?.trim() || 'auto') as 'auto' | 'resend' | 'dev',
  resendApiKey: process.env.RESEND_API_KEY?.trim() || '',
  defaultFrom: process.env.EMAIL_DEFAULT_FROM?.trim() || 'noreply@synqdrive.eu',
  defaultFromName: process.env.EMAIL_DEFAULT_FROM_NAME?.trim() || 'SynqDrive',
  defaultReplyTo: process.env.EMAIL_DEFAULT_REPLY_TO?.trim() || '',
  webhookSecret: process.env.RESEND_WEBHOOK_SECRET?.trim() || '',
  simulateEnabled:
    process.env.EMAIL_SIMULATE_ENABLED === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.EMAIL_SIMULATE_ENABLED !== 'false'),
  maxAttachmentsBytes: parseInt(process.env.EMAIL_MAX_ATTACHMENTS_BYTES || String(20 * 1024 * 1024), 10),
  maxSendsPerHourPerOrg: parseInt(process.env.EMAIL_MAX_SENDS_PER_HOUR_PER_ORG || '60', 10),
}));
