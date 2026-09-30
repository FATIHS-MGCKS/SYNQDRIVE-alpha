import { BATTERY_HV_H1_ALLOW_PRODUCTION_READONLY_ENV_KEY } from './m3-3-hv-h1.constants';

const PRODUCTION_DATABASE_HOST_PATTERNS = [
  'srv1374778',
  'app.synqdrive.eu',
  'hstgr.cloud',
  'mein-vps',
] as const;

export function isRecognizedProductionDatabaseUrl(databaseUrl: string): boolean {
  const lower = databaseUrl.toLowerCase();
  return PRODUCTION_DATABASE_HOST_PATTERNS.some((host) => lower.includes(host));
}

export function assertM3_3HvH1ReportDatabaseAllowed(databaseUrl?: string): void {
  const url = databaseUrl ?? process.env.DATABASE_URL ?? '';
  if (!url) return;
  if (!isRecognizedProductionDatabaseUrl(url)) return;
  if (process.env[BATTERY_HV_H1_ALLOW_PRODUCTION_READONLY_ENV_KEY] !== 'true') {
    throw new Error(
      'Refusing M3.3-HV-H1 evidence readiness report against recognized production DATABASE_URL host. ' +
        `Set ${BATTERY_HV_H1_ALLOW_PRODUCTION_READONLY_ENV_KEY}=true for explicit read-only production analysis.`,
    );
  }
}
