import { registerAs } from '@nestjs/config';

/** Ireland regional processing — must be paired with edge `dublin`. */
export const TWILIO_DEFAULT_REGION = 'ie1';
/** Dublin edge — required companion to region `ie1` for EU Twilio routing. */
export const TWILIO_DEFAULT_EDGE = 'dublin';

export default registerAs('twilio', () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() || '';
  const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim() || '';
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim() || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || '';
  const region = process.env.TWILIO_REGION?.trim() || TWILIO_DEFAULT_REGION;
  const edge = process.env.TWILIO_EDGE?.trim() || TWILIO_DEFAULT_EDGE;
  const voiceWebhookBaseUrl =
    process.env.TWILIO_VOICE_WEBHOOK_BASE_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    '';

  return {
    accountSid,
    apiKeySid,
    apiKeySecret,
    authToken,
    region,
    edge,
    voiceWebhookBaseUrl,
    configured: Boolean(accountSid && apiKeySid && apiKeySecret),
    webhookSigningConfigured: Boolean(authToken),
  };
});
