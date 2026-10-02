const PRODUCTION_DATABASE_HOST_PATTERNS = [
  'srv1374778',
  'app.synqdrive.eu',
  'hstgr.cloud',
  'mein-vps',
] as const;

export const BATTERY_REST_FEATURE_INSPECT_ALLOW_PRODUCTION_READONLY_ENV =
  'BATTERY_REST_FEATURE_INSPECT_ALLOW_PRODUCTION_READONLY';

export function isRecognizedProductionDatabaseUrl(databaseUrl: string): boolean {
  const lower = databaseUrl.toLowerCase();
  return PRODUCTION_DATABASE_HOST_PATTERNS.some((host) => lower.includes(host));
}

export function assertRestFeatureInspectDatabaseAllowed(databaseUrl?: string): void {
  const url = databaseUrl ?? process.env.DATABASE_URL ?? '';
  if (!url) return;
  if (
    isRecognizedProductionDatabaseUrl(url) &&
    process.env[BATTERY_REST_FEATURE_INSPECT_ALLOW_PRODUCTION_READONLY_ENV] !== 'true'
  ) {
    throw new Error(
      'Refusing rest-session feature inspect against recognized production DATABASE_URL host. ' +
        `Set ${BATTERY_REST_FEATURE_INSPECT_ALLOW_PRODUCTION_READONLY_ENV}=true for explicit read-only production inspection.`,
    );
  }
}
