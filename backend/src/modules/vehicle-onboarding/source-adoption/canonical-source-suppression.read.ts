import type { Prisma } from '@prisma/client';
import type { SourceClaimProvider } from './source-claim-lock';
import { assertSourceNotCanonicallyRegistered } from './canonical-source-suppression.authority';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

/** Read-only: true when canonical/historical suppression would block adoption. */
export async function isSourceCanonicallySuppressed(
  db: Prisma.TransactionClient | Prisma.DefaultPrismaClient,
  provider: SourceClaimProvider,
  sourceMirrorId: string,
): Promise<boolean> {
  try {
    await assertSourceNotCanonicallyRegistered(db, provider, sourceMirrorId);
    return false;
  } catch (error) {
    if (error instanceof VehicleOnboardingError && error.code === 'SOURCE_ALREADY_REGISTERED') {
      return true;
    }
    throw error;
  }
}
