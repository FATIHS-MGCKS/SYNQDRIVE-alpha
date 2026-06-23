import { registerAs } from '@nestjs/config';

export default registerAs('whatsapp', () => ({
  /** Global fallback access token — per-org tokens use WHATSAPP_TOKEN_<ORG_ID> */
  cloudAccessToken: process.env.WHATSAPP_CLOUD_ACCESS_TOKEN ?? '',
  cloudAppSecret: process.env.WHATSAPP_CLOUD_APP_SECRET ?? '',
  simulateEnabled:
    process.env.WHATSAPP_SIMULATE_ENABLED === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.WHATSAPP_SIMULATE_ENABLED !== 'false'),
}));
