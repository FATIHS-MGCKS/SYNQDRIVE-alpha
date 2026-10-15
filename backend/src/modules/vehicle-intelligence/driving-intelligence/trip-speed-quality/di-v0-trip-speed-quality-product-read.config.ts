export const DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_READ_ENV = {
  enabled: 'DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_READ_ENABLED',
} as const;

export function isDiV0TripSpeedQualityV2ProductReadEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const raw = env[DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_READ_ENV.enabled];
  if (raw === undefined || raw === '') return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
