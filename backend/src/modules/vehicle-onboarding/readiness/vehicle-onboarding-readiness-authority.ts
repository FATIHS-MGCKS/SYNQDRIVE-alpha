import type { VehicleOnboardingCase, VehicleOnboardingCaseSourceRef, Organization } from '@prisma/client';
import type { VehicleOnboardingReadinessSnapshotV2 } from '../contracts/readiness-snapshot.v2';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { parseValidatedReadinessSnapshotV2 } from '../policy/persisted-contract.validation';
import { READINESS_SNAPSHOT_VERSION_V2 } from '../contracts/vo-document-versions';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { VehicleOnboardingReadinessService } from '../services/vehicle-onboarding-readiness.service';
import { resolveReadinessProfileForSelectedProduct } from './profiles/profile-registry';
import { assertOrganizationProductEntitled } from './product-entitlement.authority';

export interface ReadinessActivationContext {
  sourceRefs: VehicleOnboardingCaseSourceRef[];
  organization: Organization;
}

export interface VehicleOnboardingReadinessAuthority {
  assertReadyForActivation(
    caseRow: VehicleOnboardingCase,
    ctx: ReadinessActivationContext,
  ): Promise<VehicleOnboardingReadinessSnapshotV2>;
}

@Injectable()
export class ProductionFailClosedReadinessAuthority implements VehicleOnboardingReadinessAuthority {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readinessService: VehicleOnboardingReadinessService,
  ) {}

  async assertReadyForActivation(
    caseRow: VehicleOnboardingCase,
    ctx: ReadinessActivationContext,
  ): Promise<VehicleOnboardingReadinessSnapshotV2> {
    if (caseRow.status !== 'READY_FOR_ACTIVATION') {
      throw new VehicleOnboardingError(
        'READINESS_NOT_SEALED',
        'Case is not READY_FOR_ACTIVATION',
        { status: caseRow.status },
      );
    }
    if (caseRow.readinessSnapshotVersion !== READINESS_SNAPSHOT_VERSION_V2) {
      throw new VehicleOnboardingError(
        'READINESS_NOT_SEALED',
        'Production activation requires VO-4 readiness snapshot v2',
      );
    }
    const snap = parseValidatedReadinessSnapshotV2(caseRow);
    if (snap.decision !== 'READY') {
      throw new VehicleOnboardingError('READINESS_NOT_SEALED', 'Readiness decision is not READY', {
        decision: snap.decision,
      });
    }
    if (snap.blockingFailureCount !== 0) {
      throw new VehicleOnboardingError('READINESS_NOT_SEALED', 'Blocking readiness failures remain');
    }
    if (!snap.schemaRequiredFieldsMet) {
      throw new VehicleOnboardingError('READINESS_NOT_SEALED', 'Schema-required fields not met');
    }

    const selectedProduct = snap.productContext.selectedProductSlug;
    const profile = resolveReadinessProfileForSelectedProduct(selectedProduct);
    if (
      profile.profileId !== snap.productContext.profileId ||
      profile.profileVersion !== snap.productContext.profileVersion
    ) {
      throw new VehicleOnboardingError(
        'READINESS_SEAL_STALE',
        'Governed profile no longer matches sealed readiness snapshot',
      );
    }

    const entitlement = await assertOrganizationProductEntitled(
      this.prisma,
      ctx.organization.id,
      selectedProduct,
    );

    const currentFingerprint = this.readinessService.computeCurrentInputFingerprint(
      caseRow,
      ctx.sourceRefs,
      ctx.organization,
      {
        selectedProduct,
        sealedSnapshot: snap,
        productEntitlementStatus: entitlement.status,
      },
    );
    if (currentFingerprint !== snap.readinessInputFingerprint) {
      throw new VehicleOnboardingError(
        'READINESS_SEAL_STALE',
        'Readiness seal no longer matches case inputs',
      );
    }
    return snap;
  }
}
