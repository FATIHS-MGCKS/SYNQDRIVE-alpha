import { registerAs } from '@nestjs/config';

export const COMMUNICATION_CENTER_SMS_PROJECTION_FLAG =
  'COMMUNICATION_CENTER_SMS_PROJECTION_ENABLED';

/** C5.2 runtime flag — gates billable send + webhook processing. */
export const COMMUNICATION_CENTER_SMS_ENABLED_FLAG = 'COMMUNICATION_CENTER_SMS_ENABLED';

export default registerAs('sms', () => ({
  globalWebhookSigningSecret: process.env.SENT_DM_WEBHOOK_SIGNING_SECRET ?? '',
  globalApiKey: process.env.SENT_DM_API_KEY ?? '',
  apiBaseUrl: (process.env.SENT_DM_API_BASE_URL ?? 'https://api.sent.dm').replace(/\/$/, ''),
  requestTimeoutMs: Number(process.env.SENT_DM_REQUEST_TIMEOUT_MS ?? 30_000),
  sandboxMode: process.env.SENT_DM_SANDBOX === 'true',
}));
