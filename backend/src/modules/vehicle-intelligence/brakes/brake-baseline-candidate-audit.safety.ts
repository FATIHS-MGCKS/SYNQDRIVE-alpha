/**
 * Safety guard for read-only brake baseline backfill audit.
 * Blocks accidental production runs unless explicitly overridden.
 */
export function assertSafeBrakeBaselineAuditTarget(opts?: {
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
  const isProdLike = prodPatterns.some((p) => lower.includes(p));
  if (isProdLike && !opts?.allowProd && process.env.BRAKE_HEALTH_AUDIT_ALLOW_PROD !== '1') {
    throw new Error(
      'Refusing to run brake baseline audit against production-like DATABASE_URL. ' +
        'Set BRAKE_HEALTH_AUDIT_ALLOW_PROD=1 only for supervised read-only audits.',
    );
  }

  const localPatterns = ['localhost', '127.0.0.1', '0.0.0.0', 'test', 'dev'];
  const isLocal = localPatterns.some((p) => lower.includes(p));
  if (!isLocal && !opts?.allowRemote && process.env.BRAKE_HEALTH_AUDIT_ALLOW_REMOTE !== '1') {
    throw new Error(
      'Remote DATABASE_URL blocked. Pass --allow-remote-db or set BRAKE_HEALTH_AUDIT_ALLOW_REMOTE=1.',
    );
  }
}
