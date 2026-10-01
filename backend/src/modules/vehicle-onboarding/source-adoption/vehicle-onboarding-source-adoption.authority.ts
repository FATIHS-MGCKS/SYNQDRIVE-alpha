import type { DimoVehicle, HighMobilityVehicle, HmClearanceStatus } from '@prisma/client';
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
    if (ctx.mode !== 'PLATFORM_TRUSTED_ADOPTION') {
      throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'DIMO adoption requires platform trusted context');
    }
    if (!dimo.id?.trim()) {
      throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'DIMO source not available');
    }
    if (!organizationId?.trim()) {
      throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'DIMO source not available');
    }
  }

  assertHighMobilityMirrorAdoptable(
    hm: Pick<
      HighMobilityVehicle,
      | 'id'
      | 'organizationId'
      | 'isActive'
      | 'clearanceStatus'
      | 'synqdriveVehicleId'
      | 'registrationState'
    >,
    organizationId: string,
    ctx: SourceAdoptionContext,
  ): void {
    if (!hm.id?.trim()) {
      throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'High Mobility source not available');
    }

    if (!hm.isActive) {
      throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'High Mobility source is not active');
    }

    if (hm.clearanceStatus !== ('APPROVED' as HmClearanceStatus)) {
      throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'High Mobility clearance is not approved');
    }

    if (hm.synqdriveVehicleId != null) {
      throw new VehicleOnboardingError(
        'SOURCE_ALREADY_REGISTERED',
        'High Mobility source is already associated with a canonical vehicle',
      );
    }

    if (hm.registrationState === 'REGISTERED') {
      throw new VehicleOnboardingError(
        'SOURCE_ALREADY_REGISTERED',
        'High Mobility source is already registered',
      );
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
        'High Mobility global source requires platform trusted adoption',
      );
    }
  }

  /** Evidence refresh on an already-attached HM ref — does not re-prove clearance approval. */
  assertHighMobilityMirrorEvidenceRefreshable(
    hm: Pick<
      HighMobilityVehicle,
      'id' | 'organizationId' | 'synqdriveVehicleId' | 'registrationState'
    >,
    organizationId: string,
    ctx: SourceAdoptionContext,
  ): void {
    if (!hm.id?.trim()) {
      throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'High Mobility source not available');
    }
    if (hm.synqdriveVehicleId != null) {
      throw new VehicleOnboardingError(
        'SOURCE_ALREADY_REGISTERED',
        'High Mobility source is already associated with a canonical vehicle',
      );
    }
    if (hm.registrationState === 'REGISTERED') {
      throw new VehicleOnboardingError(
        'SOURCE_ALREADY_REGISTERED',
        'High Mobility source is already registered',
      );
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
        'High Mobility global source requires platform trusted adoption',
      );
    }
  }
}
