const PRODUCTION_DATABASE_HOST_PATTERNS = [
  'srv1374778',
  'app.synqdrive.eu',
  'hstgr.cloud',
  'mein-vps',
] as const;

export const BATTERY_LONGITUDINAL_PROFILE_REVISION_INSPECT_ALLOW_PRODUCTION_READONLY_ENV =
  'BATTERY_LONGITUDINAL_PROFILE_REVISION_INSPECT_ALLOW_PRODUCTION_READONLY';

export function isRecognizedProductionDatabaseUrl(databaseUrl: string): boolean {
  const lower = databaseUrl.toLowerCase();
  return PRODUCTION_DATABASE_HOST_PATTERNS.some((host) => lower.includes(host));
}

export function assertLongitudinalProfileRevisionInspectDatabaseAllowed(
  databaseUrl?: string,
): void {
  const url = databaseUrl ?? process.env.DATABASE_URL ?? '';
  if (!url) return;
  if (
    isRecognizedProductionDatabaseUrl(url) &&
    process.env[BATTERY_LONGITUDINAL_PROFILE_REVISION_INSPECT_ALLOW_PRODUCTION_READONLY_ENV] !==
      'true'
  ) {
    throw new Error(
      'Refusing longitudinal profile revision inspect against recognized production DATABASE_URL host. ' +
        `Set ${BATTERY_LONGITUDINAL_PROFILE_REVISION_INSPECT_ALLOW_PRODUCTION_READONLY_ENV}=true for explicit read-only production inspection.`,
    );
  }
}
