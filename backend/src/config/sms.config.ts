import { registerAs } from '@nestjs/config';

export const COMMUNICATION_CENTER_SMS_ENABLED_FLAG = 'COMMUNICATION_CENTER_SMS_ENABLED';
export const COMMUNICATION_CENTER_SMS_PROJECTION_FLAG =
  'COMMUNICATION_CENTER_SMS_PROJECTION_ENABLED';

export default registerAs('sms', () => ({
  /** Gates billable outbound SMS provider calls. Default off. */
  sendEnabled: process.env[COMMUNICATION_CENTER_SMS_ENABLED_FLAG] === 'true',
  /** Gates canonical SMS projection only — never enables provider send. */
  projectionEnabled:
    process.env[COMMUNICATION_CENTER_SMS_PROJECTION_FLAG] === 'true' ||
    process.env.COMMUNICATION_CENTER_PROJECTION_ENABLED === 'true',
  apiBaseUrl: process.env.SENT_DM_API_BASE_URL ?? 'https://api.sent.dm',
  globalApiKey: process.env.SENT_DM_API_KEY ?? '',
  globalWebhookSigningSecret: process.env.SENT_DM_WEBHOOK_SIGNING_SECRET ?? '',
  simulateEnabled:
    process.env.SMS_SIMULATE_ENABLED === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.SMS_SIMULATE_ENABLED !== 'false'),
}));
