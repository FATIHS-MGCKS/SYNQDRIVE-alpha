export const ELEVENLABS_PROVIDER_DEFAULTS = {
  baseUrl: 'https://api.elevenlabs.io/v1',
  requestTimeoutMs: 30_000,
  healthTimeoutMs: 5_000,
  healthPath: '/user',
  maxRetries: 2,
  retryDelayMs: 250,
} as const;

export const ELEVENLABS_API_KEY_ENV = 'ELEVENLABS_API_KEY';
export const ELEVENLABS_BASE_URL_ENV = 'ELEVENLABS_BASE_URL';
export const ELEVENLABS_REGION_ENV = 'ELEVENLABS_REGION';
