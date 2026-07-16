/**
 * Safety guard for read-only tire trip usage backfill audit.
 */
export function assertSafeTireTripUsageBackfillAuditTarget(opts?: {
  allowRemote?: boolean;
  allowProd?: boolean;
}): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) return;

  const lower = url.toLowerCase();
  const prodPatterns = [
    'synqdrive-prod',
    'production',
    'prod.db',
    '/prod',
    'vps.synq',
  ];
  if (isProdLike(lower, prodPatterns) && !opts?.allowProd && process.env.TIRE_TRIP_USAGE_BACKFILL_AUDIT_ALLOW_PROD !== '1') {
    throw new Error(
      'Refusing to run tire trip usage backfill audit against production-like DATABASE_URL. ' +
        'Set TIRE_TRIP_USAGE_BACKFILL_AUDIT_ALLOW_PROD=1 only for supervised read-only audits.',
    );
  }

  const localPatterns = ['localhost', '127.0.0.1', '0.0.0.0', 'test', 'dev'];
  const isLocal = localPatterns.some((p) => lower.includes(p));
  if (!isLocal && !opts?.allowRemote && process.env.TIRE_TRIP_USAGE_BACKFILL_AUDIT_ALLOW_REMOTE !== '1') {
    throw new Error(
      'Remote DATABASE_URL blocked. Pass --allow-remote-db or set TIRE_TRIP_USAGE_BACKFILL_AUDIT_ALLOW_REMOTE=1.',
    );
  }
}

function isProdLike(lower: string, prodPatterns: string[]): boolean {
  return prodPatterns.some((p) => lower.includes(p));
}
