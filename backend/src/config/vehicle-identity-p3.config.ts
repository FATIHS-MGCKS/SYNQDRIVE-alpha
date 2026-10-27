import { registerAs } from '@nestjs/config';

/**
 * P3: Vehicle identity → Vehicle AI V2 bridge + provenance persistence.
 * Default OFF — requires P2 and explicit owner enablement.
 */
export default registerAs('vehicleIdentityP3', () => ({
  enabled: (process.env.ZB1_VEHICLE_IDENTITY_P3_ENABLED ?? 'false') === 'true',
  /** When false, AI V2 preview uses deterministic merge only (no Mistral HTTP). */
  aiLiveEnabled: (process.env.ZB1_VEHICLE_IDENTITY_P3_AI_LIVE_ENABLED ?? 'false') === 'true',
}));
