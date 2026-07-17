import { registerAs } from '@nestjs/config';

/** Ireland regional processing — must be paired with edge `dublin`. */
export const TWILIO_DEFAULT_REGION = 'ie1';
/** Dublin edge — required companion to region `ie1` for EU Twilio routing. */
export const TWILIO_DEFAULT_EDGE = 'dublin';

export default registerAs('twilio', () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() || '';
  const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim() || '';
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim() || '';
  const region = process.env.TWILIO_REGION?.trim() || TWILIO_DEFAULT_REGION;
  const edge = process.env.TWILIO_EDGE?.trim() || TWILIO_DEFAULT_EDGE;

  return {
    accountSid,
    apiKeySid,
    apiKeySecret,
    region,
    edge,
    configured: Boolean(accountSid && apiKeySid && apiKeySecret),
  };
});
