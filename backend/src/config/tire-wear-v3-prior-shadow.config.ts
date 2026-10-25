import { registerAs } from '@nestjs/config';

export const TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED_ENV =
  'TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED';

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

/** Default OFF — P3A shadow rows are never written unless explicitly enabled. */
export default registerAs('tireWearV3PriorShadow', () => ({
  writeEnabled: parseBooleanEnv(
    process.env[TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED_ENV],
    false,
  ),
}));
