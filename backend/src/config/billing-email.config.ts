import { registerAs } from '@nestjs/config';

export default registerAs('billingEmail', () => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const explicit = process.env.BILLING_EMAIL_ENABLED?.trim().toLowerCase();
  const enabled =
    explicit === 'true' || (explicit !== 'false' && nodeEnv === 'production');

  return {
    enabled,
    supportEmail: process.env.BILLING_EMAIL_SUPPORT?.trim() || 'support@synqdrive.eu',
    settingsPath:
      process.env.BILLING_EMAIL_SETTINGS_PATH?.trim() || '/rental/settings?settingsTab=billing',
    maxPdfBytes: parseInt(process.env.BILLING_EMAIL_MAX_PDF_BYTES ?? String(5 * 1024 * 1024), 10),
    pdfFetchTimeoutMs: parseInt(process.env.BILLING_EMAIL_PDF_TIMEOUT_MS ?? '10000', 10),
    maxAttempts: parseInt(process.env.BILLING_EMAIL_MAX_ATTEMPTS ?? '5', 10),
  };
});
