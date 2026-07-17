/**
 * Safety guard for controlled brake component baseline backfill apply (Prompt 12).
 */
export function assertSafeBrakeBaselineBackfillApplyTarget(opts?: {
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
    'synqdrive.eu',
  ];
  const isProdLike = prodPatterns.some((p) => lower.includes(p));
  if (
    isProdLike &&
    !opts?.allowProd &&
    process.env.BRAKE_BASELINE_BACKFILL_APPLY_ALLOW_PROD !== '1'
  ) {
    throw new Error(
      'Refusing to apply brake baseline backfill against production-like DATABASE_URL. ' +
        'Set BRAKE_BASELINE_BACKFILL_APPLY_ALLOW_PROD=1 only for supervised apply runs.',
    );
  }

  const localPatterns = ['localhost', '127.0.0.1', '0.0.0.0', 'test', 'dev'];
  const isLocal = localPatterns.some((p) => lower.includes(p));
  if (
    !isLocal &&
    !opts?.allowRemote &&
    process.env.BRAKE_BASELINE_BACKFILL_APPLY_ALLOW_REMOTE !== '1'
  ) {
    throw new Error(
      'Remote DATABASE_URL blocked for apply. Pass --allow-remote-db or set BRAKE_BASELINE_BACKFILL_APPLY_ALLOW_REMOTE=1.',
    );
  }
}
