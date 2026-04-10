import { registerAs } from '@nestjs/config';

export default registerAs('euromaster', () => ({
  enabled: process.env.EUROMASTER_ENABLED === 'true',
  liveApiEnabled: process.env.EUROMASTER_LIVE_API_ENABLED === 'true',
  manualMode: process.env.EUROMASTER_MANUAL_MODE !== 'false',

  baseUrl: process.env.EUROMASTER_API_BASE_URL || 'https://fleet-api.euromaster.com/v1',
  environment: (process.env.EUROMASTER_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',

  apiKey: process.env.EUROMASTER_API_KEY || '',
  clientId: process.env.EUROMASTER_CLIENT_ID || '',
  clientSecret: process.env.EUROMASTER_CLIENT_SECRET || '',

  requestTimeoutMs: parseInt(process.env.EUROMASTER_REQUEST_TIMEOUT_MS || '15000', 10),
  maxRetries: parseInt(process.env.EUROMASTER_MAX_RETRIES || '2', 10),
  retryDelayMs: parseInt(process.env.EUROMASTER_RETRY_DELAY_MS || '1000', 10),
}));
