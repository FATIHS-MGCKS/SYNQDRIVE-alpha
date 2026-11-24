import { Injectable, NotFoundException } from '@nestjs/common';
import type { RegisterHmOnlyVehicleDto } from '@modules/high-mobility/dto/high-mobility.dto';
import { PrismaService } from '@shared/database/prisma.service';
import { OrganizationStatus, type ProductSlug } from '@prisma/client';
import { resolveMasterDimoReadinessProduct } from '../master-dimo/master-dimo-readiness-product';
import { isOrganizationProductEntitled } from '../readiness/product-entitlement.authority';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import {
  assertHmOnlyBatteryInputContract,
  resolveHmOnlyHvBatteryReference,
} from './hm-only-canonical-battery-document-substantiation';
import { classifyHmOnlyLegacyAdmission } from './hm-only-legacy-admission.classifier';
import {
  buildProjectedHmOnlyOnboardingCase,
  evaluateProjectedHmOnlyCanonicalReadiness,
} from './hm-only-canonical-readiness-projection';
import {
  type HmOnlyReadinessObservationResult,
  type HmExpectedBillingClassification,
} from './hm-only-canonical-readiness-observation.types';
import { recordHmReadinessObservation } from './hm-only-canonical-readiness-observability';
import { parseHmOnlyOperatorIdentityCapture } from './hm-only-operator-identity.validation';

const MIRROR_STALE_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class HmOnlyCanonicalReadinessObservationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pure readiness evaluation — read-only DB access, no onboarding mutation, no billing, no activation.
   */
  async observeHmOnlyRegistrationAttempt(input: {
    dto: RegisterHmOnlyVehicleDto;
    access: {
      tenantOrganizationId: string;
      isMasterAdmin: boolean;
      actorUserId: string | null;
    };
  }): Promise<HmOnlyReadinessObservationResult> {
    const started = Date.now();
    let errorMessage: string | undefined;
    try {
      const result = await this.evaluateInternal(input);
      recordHmReadinessObservation(result);
      return result;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      const fallback: HmOnlyReadinessObservationResult = {
        legacyAdmission: 'LEGACY_BLOCKED',
        legacyBlockerReasonCodes: ['OBSERVATION_INTERNAL_ERROR'],
        canonicalReadiness: 'CANONICAL_READINESS_NOT_EVALUABLE',
        canonicalBlockerReasonCodes: ['OBSERVATION_INTERNAL_ERROR'],
        requiredInputFields: [],
        evidenceAvailability: {},
        expectedBillingClassification: 'UNKNOWN',
        evaluationCompleteness: 'NOT_EVALUABLE',
        powertrainClass: 'UNKNOWN',
        providerMirrorFreshness: 'UNKNOWN',
        divergenceLegacyOnly: false,
        metadata: {
          organizationId: input.dto.organizationId,
          hmVehicleId: input.dto.hmVehicleId,
          selectedProduct: null,
          evaluationDurationMs: Date.now() - started,
        },
      };
      recordHmReadinessObservation(fallback, errorMessage);
      return fallback;
    }
  }

  private async evaluateInternal(input: {
    dto: RegisterHmOnlyVehicleDto;
    access: {
      tenantOrganizationId: string;
      isMasterAdmin: boolean;
      actorUserId: string | null;
    };
  }): Promise<HmOnlyReadinessObservationResult> {
    const started = Date.now();
    const hmRecord = await this.prisma.highMobilityVehicle.findUnique({
      where: { id: input.dto.hmVehicleId },
    });
    if (!hmRecord) {
      throw new NotFoundException(`HM vehicle ${input.dto.hmVehicleId} not found`);
    }

    const legacy = await classifyHmOnlyLegacyAdmission(this.prisma, {
      dto: input.dto,
      access: input.access,
      hmRecord,
    });

    const requiredInputFields: string[] = [];
    const evidenceAvailability: Record<string, 'PRESENT' | 'MISSING' | 'NOT_APPLICABLE'> = {};
    let canonicalReadiness: HmOnlyReadinessObservationResult['canonicalReadiness'] =
      'CANONICAL_READINESS_NOT_EVALUABLE';
    let canonicalBlockers: string[] = [];
    let completeness: HmOnlyReadinessObservationResult['evaluationCompleteness'] = 'NOT_EVALUABLE';
    let powertrainClass: HmOnlyReadinessObservationResult['powertrainClass'] = 'UNKNOWN';
    let selectedProduct: ProductSlug | null = null;

    try {
      parseHmOnlyOperatorIdentityCapture(input.dto);
      evidenceAvailability.operatorModelYear = 'PRESENT';
    } catch (error) {
      requiredInputFields.push('model', 'year');
      evidenceAvailability.operatorModelYear = 'MISSING';
      canonicalBlockers.push(
        error instanceof VehicleOnboardingError ? error.code : 'INVALID_OPERATOR_IDENTITY',
      );
    }

    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: input.dto.organizationId },
    });
    if (org.status !== OrganizationStatus.ACTIVE) {
      canonicalBlockers.push('ORG_STATUS_NOT_ACTIVE');
    }

    try {
      selectedProduct = await resolveMasterDimoReadinessProduct(this.prisma, input.dto.organizationId);
      const entitled = await isOrganizationProductEntitled(
        this.prisma,
        input.dto.organizationId,
        selectedProduct,
      );
      if (!entitled) {
        canonicalBlockers.push('PRODUCT_ENTITLEMENT_NOT_ACTIVE');
      }
    } catch {
      canonicalBlockers.push('PRODUCT_RESOLUTION_FAILED');
    }

    let hvBattery = null;
    try {
      assertHmOnlyBatteryInputContract(input.dto);
      hvBattery = await resolveHmOnlyHvBatteryReference(
        this.prisma,
        input.dto.organizationId,
        input.dto,
      );
      evidenceAvailability.hvBatteryReference = hvBattery ? 'PRESENT' : 'MISSING';
    } catch (error) {
      evidenceAvailability.hvBatteryReference = 'MISSING';
      canonicalBlockers.push(
        error instanceof VehicleOnboardingError ? error.code : 'HV_BATTERY_RESOLUTION_FAILED',
      );
    }

    if (selectedProduct && canonicalBlockers.length === 0) {
      const projected = buildProjectedHmOnlyOnboardingCase({
        organizationId: input.dto.organizationId,
        hmRecord,
        dto: input.dto,
        hvBattery: hvBattery ?? null,
      });
      const evaluation = evaluateProjectedHmOnlyCanonicalReadiness({
        organization: org,
        caseRow: projected.caseRow,
        sourceRefs: projected.sourceRefs,
        selectedProduct,
      });
      canonicalBlockers = evaluation.evaluated.ruleResults
        .filter((r) => r.blocking && r.status === 'FAIL')
        .map((r) => r.reasonCode);
      powertrainClass =
        evaluation.powertrain === 'BEV'
          ? 'BEV'
          : evaluation.powertrain === 'ICE'
            ? 'ICE'
            : evaluation.powertrain === 'PLUGIN_HYBRID' || evaluation.powertrain === 'HYBRID'
              ? 'HV'
              : 'UNKNOWN';
      if (evaluation.evaluated.blockingFailureCount === 0 && evaluation.evaluated.decision === 'READY') {
        canonicalReadiness = 'CANONICAL_READINESS_PASS';
        completeness = 'COMPLETE';
      } else {
        canonicalReadiness = 'CANONICAL_READINESS_BLOCKED';
        completeness = 'COMPLETE';
      }
    } else if (canonicalBlockers.length > 0) {
      canonicalReadiness = 'CANONICAL_READINESS_BLOCKED';
      completeness = 'PARTIAL';
    }

    const mirrorAgeMs = Date.now() - hmRecord.updatedAt.getTime();
    const providerMirrorFreshness =
      mirrorAgeMs <= MIRROR_STALE_MS ? 'FRESH' : ('STALE' as const);

    const expectedBilling = await this.predictBillingClassification(
      input.dto.organizationId,
      org.status === OrganizationStatus.ACTIVE,
      selectedProduct,
      canonicalReadiness,
    );

    const divergenceLegacyOnly =
      legacy.verdict === 'LEGACY_ADMISSIBLE' && canonicalReadiness !== 'CANONICAL_READINESS_PASS';

    return {
      legacyAdmission: legacy.verdict,
      legacyBlockerReasonCodes: legacy.blockerReasonCodes,
      canonicalReadiness,
      canonicalBlockerReasonCodes: canonicalBlockers,
      requiredInputFields,
      evidenceAvailability,
      expectedBillingClassification: expectedBilling,
      evaluationCompleteness: completeness,
      powertrainClass,
      providerMirrorFreshness,
      divergenceLegacyOnly,
      metadata: {
        organizationId: input.dto.organizationId,
        hmVehicleId: input.dto.hmVehicleId,
        selectedProduct,
        evaluationDurationMs: Date.now() - started,
      },
    };
  }

  private async predictBillingClassification(
    organizationId: string,
    orgActive: boolean,
    selectedProduct: ProductSlug | null,
    canonicalReadiness: HmOnlyReadinessObservationResult['canonicalReadiness'],
  ): Promise<HmExpectedBillingClassification> {
    if (!orgActive || canonicalReadiness !== 'CANONICAL_READINESS_PASS') {
      return 'NON_BILLABLE_IF_ACTIVATED';
    }
    if (!selectedProduct) {
      return 'UNKNOWN';
    }
    const baseItem = await this.prisma.billingSubscriptionItem.findFirst({
      where: {
        organizationId,
        itemRole: 'BASE_PLAN',
        status: { in: ['ACTIVE', 'TRIALING'] },
      },
      select: { id: true },
    });
    if (!baseItem) {
      return 'NON_BILLABLE_IF_ACTIVATED';
    }
    return 'BILLABLE_IF_ACTIVATED';
  }
}