import { registerAs } from '@nestjs/config';

export const TIRE_WEAR_V3_CUSTOMER_READ_ENABLED_ENV =
  'TIRE_WEAR_V3_CUSTOMER_READ_ENABLED';
export const TIRE_WEAR_V3_CUSTOMER_READ_AUTHORITATIVE_ENV =
  'TIRE_WEAR_V3_CUSTOMER_READ_AUTHORITATIVE';

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

/**
 * P2 cutover flags — safe defaults OFF.
 * - customerReadEnabled: attach `wearV3` read model on tire health APIs
 * - customerReadAuthoritative: V3 drives primary summary/presentation (no dual customer wear)
 * Shadow writer remains controlled by TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED (default OFF).
 */
export interface TireWearV3CutoverConfig {
  customerReadEnabled: boolean;
  customerReadAuthoritative: boolean;
}

export default registerAs('tireWearV3Cutover', () => ({
  customerReadEnabled: parseBooleanEnv(
    process.env[TIRE_WEAR_V3_CUSTOMER_READ_ENABLED_ENV],
    false,
  ),
  customerReadAuthoritative: parseBooleanEnv(
    process.env[TIRE_WEAR_V3_CUSTOMER_READ_AUTHORITATIVE_ENV],
    false,
  ),
}));
