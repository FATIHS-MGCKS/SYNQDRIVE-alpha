import { registerAs } from '@nestjs/config';

export const COMMUNICATION_CENTER_SMS_PROJECTION_FLAG =
  'COMMUNICATION_CENTER_SMS_PROJECTION_ENABLED';

/** C5.2 runtime flag — not used in C5.1 persistence foundation. */
export const COMMUNICATION_CENTER_SMS_ENABLED_FLAG = 'COMMUNICATION_CENTER_SMS_ENABLED';

export default registerAs('sms', () => ({
  globalWebhookSigningSecret: process.env.SENT_DM_WEBHOOK_SIGNING_SECRET ?? '',
}));
