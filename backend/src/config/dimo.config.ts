import { registerAs } from '@nestjs/config';

const DIMO_VEHICLE_NFT_CONTRACT: Record<string, string> = {
  production: '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF',
  dev: '0x45fbCD3ef7361d156e8b16F5538AE36DEdf61Da8',
};

export default registerAs('dimo', () => {
  const clientId = process.env.DIMO_CLIENT_ID ?? '';
  const privateKey = process.env.DIMO_PRIVATE_KEY ?? '';
  const dimoEnv = (process.env.DIMO_ENV || 'production').toLowerCase();

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
    /** Base URL for DIMO webhook callbacks (e.g. https://api.synqdrive.io or http://localhost:3001). */
    webhookBaseUrl:
      process.env.DIMO_WEBHOOK_BASE_URL ||
      process.env.BASE_URL ||
      'http://localhost:3001',
    /** Token echoed as plain/text during DIMO Vehicle Triggers URL verification. */
    webhookVerificationToken: process.env.DIMO_WEBHOOK_VERIFICATION_TOKEN ?? '',
    /** DIMO Agents API — Bearer Developer JWT in headers + DIMO_API_KEY in create-agent body secrets. */
    agentsBaseUrl:
      process.env.DIMO_AGENTS_BASE_URL?.trim() || 'https://agents.dimo.zone',
    /** API key sent in create-agent body secrets.DIMO_API_KEY (do not use for Bearer auth). */
    dimoApiKey: process.env.DIMO_API_KEY ?? '',
    /** User wallet sent in create-agent body variables.USER_WALLET. */
    agentUserWallet: process.env.DIMO_AGENT_USER_WALLET ?? '',
    /** Environment: 'production' or 'dev'. Affects triggers API URL. */
    dimoEnv,
    /**
     * When true, DimoTriggersBootstrapService registers webhooks and vehicle
     * subscriptions on startup. Default false — configure webhooks in DIMO Developer Console.
     */
    triggerBootstrapEnabled:
      (process.env.DIMO_TRIGGER_BOOTSTRAP_ENABLED ?? '').trim().toLowerCase() === 'true',
    /** Per-use-case DIMO agent personalities (validated in DimoAgentsService). */
    agentPersonalityVehicleSpecs: process.env.DIMO_AGENT_PERSONALITY_VEHICLE_SPECS?.trim() || undefined,
    agentPersonalityTireSpecs: process.env.DIMO_AGENT_PERSONALITY_TIRE_SPECS?.trim() || undefined,
    /** Prefer DIMO_AGENT_PERSONALITY_DOCUMENT; DIMO_DOCUMENT_AGENT_PERSONALITY is legacy fallback. */
    agentPersonalityDocument:
      process.env.DIMO_AGENT_PERSONALITY_DOCUMENT?.trim() ||
      process.env.DIMO_DOCUMENT_AGENT_PERSONALITY?.trim() ||
      undefined,
    agentPersonalityChat: process.env.DIMO_AGENT_PERSONALITY_CHAT?.trim() || undefined,
  };
});
