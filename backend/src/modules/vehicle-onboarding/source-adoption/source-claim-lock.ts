export const SOURCE_CLAIM_LOCK_PREFIX = 'vehicle-onboarding-source-claim';

export type SourceClaimProvider = 'DIMO' | 'HIGH_MOBILITY';

export function sourceClaimLockKey(
  provider: SourceClaimProvider,
  sourceMirrorId: string,
): string {
  return `${SOURCE_CLAIM_LOCK_PREFIX}:${provider}:${sourceMirrorId}`;
}
