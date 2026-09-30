import type { DimoVehicle, HighMobilityVehicle } from '@prisma/client';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import type { SourceAdoptionContext } from './source-adoption.context';

/**
 * Fail-closed adoption of provider mirrors into tenant-scoped onboarding cases.
 */
export class VehicleOnboardingSourceAdoptionAuthority {
  /**
   * DIMO mirrors are platform/developer-license scoped — not tenant-owned rows.
   *
   * DIMO_MIRROR_SCOPE=PLATFORM_DEVELOPER_LICENSE
   * DIMO_TENANT_ADOPTION_AUTHORIZATION=NOT_PROVEN_BY_DIMO_ROW
   *
   * Accepting TENANT_ONBOARDING here only means the mirror exists and the call
   * uses a governed adoption context — it does NOT prove the actor may assign
   * that platform mirror to the target organization. Public cutover must enforce
   * controller/IAM authorization separately.
   */
  assertDimoPlatformMirrorAdoptable(
    dimo: Pick<DimoVehicle, 'id'>,
    organizationId: string,
    ctx: SourceAdoptionContext,
  ): void {
    if (ctx.mode !== 'TENANT_ONBOARDING' && ctx.mode !== 'PLATFORM_TRUSTED_ADOPTION') {
      throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'Invalid source adoption context');
    }
    if (!dimo.id?.trim()) {
      throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'DIMO source not available');
    }
    if (!organizationId?.trim()) {
      throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'DIMO source not available');
    }
  }

  assertHighMobilityMirrorAdoptable(
    hm: Pick<HighMobilityVehicle, 'id' | 'organizationId'>,
    organizationId: string,
    ctx: SourceAdoptionContext,
  ): void {
    if (!hm.id?.trim()) {
      throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'High Mobility source not available');
    }

    if (hm.organizationId != null && hm.organizationId !== organizationId) {
      throw new VehicleOnboardingError(
        'SOURCE_NOT_AVAILABLE',
        'High Mobility source not available for this organization',
      );
    }

    if (hm.organizationId == null && ctx.mode !== 'PLATFORM_TRUSTED_ADOPTION') {
      throw new VehicleOnboardingError(
        'SOURCE_NOT_AVAILABLE',
        'High Mobility source not available for this organization',
      );
    }
  }
}
