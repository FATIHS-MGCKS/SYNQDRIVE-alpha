import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { Prisma, ProductSlug, type VehicleOnboardingCase } from '@prisma/client';
import { acquirePgAdvisoryXactLock64 } from '@shared/database/pg-advisory-lock.util';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { assertCaseTransitionAllowed, isTerminalCaseStatus } from '../policy/onboarding-case-transition.policy';
import { READINESS_SNAPSHOT_VERSION_V2 } from '../contracts/vo-document-versions';
import type { VehicleOnboardingReadinessSnapshotV2 } from '../contracts/readiness-snapshot.v2';
import { resolveReadinessProfileForSelectedProduct } from '../readiness/profiles/profile-registry';
import { resolveJurisdictionContext } from '../readiness/jurisdiction-authority';
import { evaluateReadinessRules } from '../readiness/readiness-rule-engine';
import {
  computeReadinessInputFingerprint,
  computeSourceSetFingerprint,
} from '../readiness/readiness-input-fingerprint.v1';
import { classifyPowertrainFromFuelType } from '../readiness/powertrain-classification';
import { parseValidatedIdentityDraft } from '../policy/persisted-contract.validation';
import { readinessMutationLockKey } from '../readiness/readiness-mutation-lock';
// readinessMutationLockKey aliases shared mutation lock with evaluation
import { assertOrganizationProductEntitled } from '../readiness/product-entitlement.authority';

export interface EvaluateReadinessInput {
  organizationId: string;
  onboardingCaseId: string;
  selectedProduct: ProductSlug;
  actorUserId: string | null;
  seal?: boolean;
}

export interface ReadinessFingerprintContext {
  selectedProduct: ProductSlug;
  sealedSnapshot?: VehicleOnboardingReadinessSnapshotV2 | null;
}

@Injectable()
export class VehicleOnboardingReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluateReadiness(input: EvaluateReadinessInput): Promise<VehicleOnboardingReadinessSnapshotV2> {
    const seal = input.seal ?? false;
    return this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock64(tx, readinessMutationLockKey(input.onboardingCaseId));
      const loaded = await this.loadCase(tx, input.organizationId, input.onboardingCaseId);
      if (isTerminalCaseStatus(loaded.caseRow.status)) {
        throw new VehicleOnboardingError(
          'TERMINAL_CASE_IDEMPOTENCY',
          'Cannot evaluate readiness for terminal case',
        );
      }
      const entitlement = await assertOrganizationProductEntitled(
        tx,
        input.organizationId,
        input.selectedProduct,
      );
      const snapshot = this.buildSnapshot(
        loaded,
        input.actorUserId,
        input.selectedProduct,
        entitlement.status,
      );
      if (seal) {
        const nextStatus =
          snapshot.decision === 'READY' ? 'READY_FOR_ACTIVATION' : 'IN_PROGRESS';
        if (loaded.caseRow.status !== nextStatus) {
          assertCaseTransitionAllowed(loaded.caseRow.status, nextStatus);
        }
        await tx.vehicleOnboardingCase.update({
          where: { id: loaded.caseRow.id },
          data: {
            status: nextStatus,
            readinessSnapshotJson: snapshot as unknown as Prisma.InputJsonValue,
            readinessSnapshotVersion: READINESS_SNAPSHOT_VERSION_V2,
            readinessProfileVersion: snapshot.profileVersion,
            lastActorUserId: input.actorUserId,
          },
        });
      }
      return snapshot;
    });
  }

  async evaluateAndSealReadiness(
    input: Omit<EvaluateReadinessInput, 'seal'>,
  ): Promise<VehicleOnboardingReadinessSnapshotV2> {
    return this.evaluateReadiness({ ...input, seal: true });
  }

  computeCurrentInputFingerprint(
    caseRow: VehicleOnboardingCase,
    sourceRefs: Awaited<ReturnType<typeof this.loadCase>>['sourceRefs'],
    organization: Awaited<ReturnType<typeof this.loadCase>>['organization'],
    ctx: ReadinessFingerprintContext & {
      productEntitlementStatus: import('@prisma/client').OrgProductStatus;
    },
  ): string {
    const profile = resolveReadinessProfileForSelectedProduct(ctx.selectedProduct);
    const jurisdiction = resolveJurisdictionContext(organization);
    return computeReadinessInputFingerprint({
      caseRow,
      sourceRefs,
      profile,
      jurisdictionCode: jurisdiction.code,
      selectedProductSlug: ctx.selectedProduct,
      productEntitlementStatus: ctx.productEntitlementStatus,
      organizationBusinessType: organization.businessType,
    });
  }

  private async loadCase(
    tx: Prisma.TransactionClient,
    organizationId: string,
    caseId: string,
  ) {
    const caseRow = await tx.vehicleOnboardingCase.findFirst({
      where: { id: caseId, organizationId },
      include: { sourceRefs: true },
    });
    if (!caseRow) {
      throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Onboarding case not found');
    }
    const organization = await tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    return { caseRow, sourceRefs: caseRow.sourceRefs, organization };
  }

  private buildSnapshot(
    loaded: Awaited<ReturnType<typeof this.loadCase>>,
    actorUserId: string | null,
    selectedProduct: ProductSlug,
    productEntitlementStatus: import('@prisma/client').OrgProductStatus,
  ): VehicleOnboardingReadinessSnapshotV2 {
    const profile = resolveReadinessProfileForSelectedProduct(selectedProduct);
    const jurisdiction = resolveJurisdictionContext(loaded.organization);
    const evaluated = evaluateReadinessRules({
      caseRow: loaded.caseRow,
      sourceRefs: loaded.sourceRefs,
      organization: loaded.organization,
      profile,
    });
    const identity = parseValidatedIdentityDraft(loaded.caseRow);
    const powertrain = classifyPowertrainFromFuelType(identity.fuelType);
    const inputFingerprint = computeReadinessInputFingerprint({
      caseRow: loaded.caseRow,
      sourceRefs: loaded.sourceRefs,
      profile,
      jurisdictionCode: jurisdiction.code,
      selectedProductSlug: selectedProduct,
      productEntitlementStatus,
      organizationBusinessType: loaded.organization.businessType,
    });
    const sourceSetFingerprint = computeSourceSetFingerprint(loaded.sourceRefs);
    const now = new Date().toISOString();
    return {
      version: READINESS_SNAPSHOT_VERSION_V2,
      profileId: profile.profileId,
      profileVersion: profile.profileVersion,
      evaluatedAt: now,
      sealedAt: now,
      sealedByUserId: actorUserId,
      decision: evaluated.decision,
      attestationSource: 'VO4_READINESS_ENGINE',
      schemaRequiredFieldsMet: evaluated.schemaRequiredFieldsMet,
      readinessInputFingerprint: inputFingerprint,
      sourceSetFingerprint,
      productContext: {
        selectedProductSlug: selectedProduct,
        productEntitlementStatus,
        organizationBusinessType: loaded.organization.businessType,
        profileId: profile.profileId,
        profileVersion: profile.profileVersion,
      },
      jurisdictionContext: jurisdiction,
      powertrainContext: { classification: powertrain },
      ruleResults: evaluated.ruleResults,
      blockingFailureCount: evaluated.blockingFailureCount,
      reviewRequiredCount: evaluated.reviewRequiredCount,
      deferredCount: evaluated.deferredCount,
      unknownAllowedCount: evaluated.unknownAllowedCount,
    };
  }
}
