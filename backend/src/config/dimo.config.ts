import { registerAs } from '@nestjs/config';

export default registerAs('dimo', () => {
  const clientId = process.env.DIMO_CLIENT_ID ?? '';
  const privateKey = process.env.DIMO_PRIVATE_KEY ?? '';
  const dimoEnv = (process.env.DIMO_ENV || 'production').toLowerCase();

  const DIMO_VEHICLE_NFT_CONTRACT: Record<string, string> = {
    production: '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF',
    dev: '0x45fbCD3ef7361d156e8b16F5538AE36DEdf61Da8',
  };

  return {
    apiUrl: process.env.DIMO_API_URL || 'https://identity-api.dimo.zone',
    authUrl: 'https://auth.dimo.zone',
    telemetryApiUrl:
      process.env.DIMO_TELEMETRY_API_URL || 'https://telemetry-api.dimo.zone/query',
    clientId,
    privateKey,
    redirectUri: process.env.DIMO_REDIRECT_URI,
    tokenExchangeUrl:
      process.env.DIMO_TOKEN_EXCHANGE_URL || 'https://token-exchange-api.dimo.zone',
    vehicleNftContractAddress:
      process.env.DIMO_VEHICLE_NFT_CONTRACT ||
      DIMO_VEHICLE_NFT_CONTRACT[dimoEnv] ||
      DIMO_VEHICLE_NFT_CONTRACT.production,
    vehicleJwtTtlSeconds: parseInt(process.env.DIMO_VEHICLE_JWT_TTL_SECONDS || '300', 10),
    vehicleJwtRefreshMarginSeconds: parseInt(
      process.env.DIMO_VEHICLE_JWT_REFRESH_MARGIN_SECONDS || '60',
      10,
    ),
    requestTimeoutMs: parseInt(process.env.DIMO_REQUEST_TIMEOUT_MS || '10000', 10),
    webhookBaseUrl:
      process.env.DIMO_WEBHOOK_BASE_URL ||
      process.env.BASE_URL ||
      'http://localhost:3001',
    webhookVerificationToken: process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN ?? '',
    dimoEnv,
    triggerBootstrapEnabled:
      (process.env.DIMO_TRIGGER_BOOTSTRAP_ENABLED ?? '').trim().toLowerCase() === 'true',
    /** When false (default), plug-in events come from snapshot polling — not DIMO plug-in webhooks. */
    obdPlugInWebhookEnabled:
      (process.env.DIMO_OBD_PLUG_IN_WEBHOOK_ENABLED ?? '').trim().toLowerCase() === 'true',
  };
});
