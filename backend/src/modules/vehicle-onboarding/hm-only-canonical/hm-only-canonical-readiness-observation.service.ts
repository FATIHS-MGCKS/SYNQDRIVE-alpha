import { Injectable, NotFoundException } from '@nestjs/common';
import type { HighMobilityVehicle } from '@prisma/client';
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
import { normalizeHmOnlyFuelType } from './hm-only-canonical-registration.mapper';
import {
  type HmOnlyReadinessObservationResult,
} from './hm-only-canonical-readiness-observation.types';
import { recordHmReadinessObservation, sanitizeObservationErrorCode } from './hm-only-canonical-readiness-observability';
import { parseHmOnlyOperatorIdentityCapture } from './hm-only-operator-identity.validation';
import {
  assertHmObservationAuthenticatedOrgScope,
  assertHmObservationRecordTenantScope,
} from './hm-only-canonical-tenant-access.guard';
import { classifyHmOnlyCanonicalAdmission } from './hm-only-canonical-admission.classifier';
import { predictHmOnlyActivationBilling } from './hm-only-canonical-activation-billing-prediction';
import {
  assertHmPreRegistrationSnapshotUnchanged,
  type HmPreRegistrationObservationSnapshot,
  freezeHmPreRegistrationSnapshot,
} from './hm-only-canonical-observation-snapshot';
import {
  withHmObservationConcurrency,
  withHmObservationTimeout,
} from './hm-only-canonical-observation-concurrency';

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
    preRegistrationSnapshot?: HmPreRegistrationObservationSnapshot;
  }): Promise<HmOnlyReadinessObservationResult> {
    const started = Date.now();
    const concurrency = await withHmObservationConcurrency(() =>
      withHmObservationTimeout(() => this.evaluateInternal(input, started)),
    );
    if (concurrency === 'OBSERVATION_OVERLOAD') {
      const overload = this.buildNotEvaluableResult(input, started, 'OBSERVATION_OVERLOAD', {
        tenantScopeMismatch: input.dto.organizationId !== input.access.tenantOrganizationId,
      });
      recordHmReadinessObservation(overload, 'OBSERVATION_OVERLOAD');
      return overload;
    }
    if (concurrency === 'OBSERVATION_TIMEOUT') {
      const timeout = this.buildNotEvaluableResult(input, started, 'OBSERVATION_TIMEOUT', {
        tenantScopeMismatch: input.dto.organizationId !== input.access.tenantOrganizationId,
      });
      recordHmReadinessObservation(timeout, 'OBSERVATION_TIMEOUT');
      return timeout;
    }

    try {
      recordHmReadinessObservation(concurrency);
      return concurrency;
    } catch (error) {
      const code = sanitizeObservationErrorCode(error);
      const fallback = this.buildNotEvaluableResult(input, started, code, {
        tenantScopeMismatch: input.dto.organizationId !== input.access.tenantOrganizationId,
      });
      recordHmReadinessObservation(fallback, code);
      return fallback;
    }
  }

  private buildNotEvaluableResult(
    input: { dto: RegisterHmOnlyVehicleDto; access: { tenantOrganizationId: string } },
    started: number,
    reasonCode: string,
    opts?: { tenantScopeMismatch?: boolean },
  ): HmOnlyReadinessObservationResult {
    return {
      legacyAdmission: 'LEGACY_BLOCKED',
      legacyBlockerReasonCodes: [reasonCode],
      canonicalAdmission: 'CANONICAL_ADMISSION_NOT_EVALUABLE',
      canonicalAdmissionBlockerReasonCodes: [reasonCode],
      canonicalReadiness: 'CANONICAL_READINESS_NOT_EVALUABLE',
      canonicalBlockerReasonCodes: [reasonCode],
      requiredInputFields: [],
      evidenceAvailability: {},
      expectedBillingClassification: 'UNKNOWN',
      billingPredictionReasonCode: reasonCode,
      evaluationCompleteness: 'NOT_EVALUABLE',
      powertrainClass: 'UNKNOWN',
      providerMirrorFreshness: 'UNKNOWN',
      divergenceLegacyOnly: false,
      metadata: {
        organizationId: input.access.tenantOrganizationId,
        hmVehicleId: input.dto.hmVehicleId,
        selectedProduct: null,
        evaluationDurationMs: Date.now() - started,
        tenantScopeMismatch: opts?.tenantScopeMismatch,
      },
    };
  }

  private async evaluateInternal(
    input: {
      dto: RegisterHmOnlyVehicleDto;
      access: {
        tenantOrganizationId: string;
        isMasterAdmin: boolean;
        actorUserId: string | null;
      };
      preRegistrationSnapshot?: HmPreRegistrationObservationSnapshot;
    },
    started: number,
  ): Promise<HmOnlyReadinessObservationResult> {
    const tenantScope = assertHmObservationAuthenticatedOrgScope(input);
    if (!tenantScope.allowed) {
      return this.tenantDeniedResult(input, started, tenantScope.reasonCode);
    }

    let hmRecord: HighMobilityVehicle | null =
      input.preRegistrationSnapshot?.hmRecord ??
      (await this.prisma.highMobilityVehicle.findUnique({
        where: { id: input.dto.hmVehicleId },
      }));
    if (!hmRecord) {
      throw new NotFoundException(`HM vehicle ${input.dto.hmVehicleId} not found`);
    }
    if (input.preRegistrationSnapshot && input.preRegistrationSnapshot.hmVehicleId !== hmRecord.id) {
      throw new NotFoundException('Observation snapshot hm id mismatch');
    }

    const recordScope = assertHmObservationRecordTenantScope({
      hmRecord,
      organizationId: input.dto.organizationId,
      isMasterAdmin: input.access.isMasterAdmin,
    });
    if (!recordScope.allowed) {
      return this.tenantDeniedResult(input, started, recordScope.reasonCode);
    }

    const snapshot =
      input.preRegistrationSnapshot ?? freezeHmPreRegistrationSnapshot(hmRecord);

    const legacy = await classifyHmOnlyLegacyAdmission(this.prisma, {
      dto: input.dto,
      access: input.access,
      hmRecord,
    });

    const admission = await classifyHmOnlyCanonicalAdmission(this.prisma, {
      dto: input.dto,
      access: input.access,
      hmRecord,
    });

    let canonicalReadiness: HmOnlyReadinessObservationResult['canonicalReadiness'] =
      'CANONICAL_READINESS_NOT_EVALUABLE';
    let canonicalBlockers: string[] = [];
    let completeness: HmOnlyReadinessObservationResult['evaluationCompleteness'] = 'NOT_EVALUABLE';
    let powertrainClass: HmOnlyReadinessObservationResult['powertrainClass'] = 'UNKNOWN';
    let selectedProduct: ProductSlug | null = null;
    const requiredInputFields: string[] = [];
    const evidenceAvailability: Record<string, 'PRESENT' | 'MISSING' | 'NOT_APPLICABLE'> = {};

    const skipTechnical =
      admission.verdict === 'CANONICAL_IDEMPOTENT_REPLAY' ||
      admission.verdict === 'CANONICAL_LEGACY_RECONCILIATION_REQUIRED' ||
      admission.verdict === 'CANONICAL_ADMISSION_BLOCKED' ||
      admission.verdict === 'CANONICAL_ADMISSION_NOT_EVALUABLE';

    if (!skipTechnical && admission.verdict === 'CANONICAL_ADMISSION_ELIGIBLE') {
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

      const operatorFuel = normalizeHmOnlyFuelType(input.dto.fuelType);
      if (input.dto.fuelType?.trim() && !operatorFuel) {
        canonicalBlockers.push('INVALID_CAPTURE_PAYLOAD');
      }

      const org = await this.prisma.organization.findUniqueOrThrow({
        where: { id: input.dto.organizationId },
      });
      if (org.status !== OrganizationStatus.ACTIVE) {
        canonicalBlockers.push('ORG_STATUS_NOT_ACTIVE');
      }

      try {
        selectedProduct = await resolveMasterDimoReadinessProduct(
          this.prisma,
          input.dto.organizationId,
        );
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
          .filter((r) => r.blocking && (r.status === 'FAIL' || r.status === 'REVIEW_REQUIRED'))
          .map((r) => r.reasonCode);
        powertrainClass =
          evaluation.powertrain === 'BEV'
            ? 'BEV'
            : evaluation.powertrain === 'ICE'
              ? 'ICE'
              : evaluation.powertrain === 'PLUGIN_HYBRID' || evaluation.powertrain === 'HYBRID'
                ? 'HV'
                : 'UNKNOWN';
        if (
          evaluation.evaluated.blockingFailureCount === 0 &&
          evaluation.evaluated.decision === 'READY' &&
          !evaluation.evaluated.ruleResults.some((r) => r.status === 'REVIEW_REQUIRED')
        ) {
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
    } else if (admission.verdict === 'CANONICAL_ADMISSION_BLOCKED') {
      canonicalReadiness = 'CANONICAL_READINESS_NOT_EVALUABLE';
      completeness = 'PARTIAL';
      canonicalBlockers = [...admission.blockerReasonCodes];
    } else if (
      admission.verdict === 'CANONICAL_IDEMPOTENT_REPLAY' ||
      admission.verdict === 'CANONICAL_LEGACY_RECONCILIATION_REQUIRED'
    ) {
      canonicalReadiness = 'CANONICAL_READINESS_NOT_EVALUABLE';
      completeness = 'NOT_EVALUABLE';
      canonicalBlockers = [...admission.blockerReasonCodes];
    }

    const snapshotOk = await assertHmPreRegistrationSnapshotUnchanged(
      this.prisma,
      snapshot,
      input.dto.organizationId,
    );
    if (!snapshotOk.ok) {
      return this.buildNotEvaluableResult(input, started, snapshotOk.reasonCode);
    }

    const mirrorAgeMs = Date.now() - hmRecord.updatedAt.getTime();
    const providerMirrorFreshness =
      mirrorAgeMs <= MIRROR_STALE_MS ? 'FRESH' : ('STALE' as const);

    const billing = await predictHmOnlyActivationBilling(this.prisma, {
      organizationId: input.dto.organizationId,
      admissionVerdict: admission.verdict,
      canonicalReadiness,
      hypotheticalVehicle: {
        vin: hmRecord.vin,
        make: hmRecord.brand,
        model: input.dto.model?.trim() || 'UNKNOWN',
        licensePlate: input.dto.licensePlate ?? null,
      },
    });

    const divergenceLegacyOnly =
      legacy.verdict === 'LEGACY_ADMISSIBLE' &&
      admission.verdict === 'CANONICAL_ADMISSION_ELIGIBLE' &&
      canonicalReadiness !== 'CANONICAL_READINESS_PASS';

    return {
      legacyAdmission: legacy.verdict,
      legacyBlockerReasonCodes: legacy.blockerReasonCodes,
      canonicalAdmission: admission.verdict,
      canonicalAdmissionBlockerReasonCodes: admission.blockerReasonCodes,
      canonicalReadiness,
      canonicalBlockerReasonCodes: canonicalBlockers,
      requiredInputFields,
      evidenceAvailability,
      expectedBillingClassification: billing.classification,
      billingPredictionReasonCode: billing.reasonCode,
      evaluationCompleteness: completeness,
      powertrainClass,
      providerMirrorFreshness,
      divergenceLegacyOnly,
      metadata: {
        organizationId: input.access.tenantOrganizationId,
        hmVehicleId: input.dto.hmVehicleId,
        selectedProduct,
        evaluationDurationMs: Date.now() - started,
      },
    };
  }

  private tenantDeniedResult(
    input: { dto: RegisterHmOnlyVehicleDto; access: { tenantOrganizationId: string; hmVehicleId?: never } },
    started: number,
    reasonCode: 'ORG_SCOPE_MISMATCH' | 'HM_TENANT_ACCESS_DENIED',
  ): HmOnlyReadinessObservationResult {
    return {
      legacyAdmission: 'LEGACY_BLOCKED',
      legacyBlockerReasonCodes: [reasonCode],
      canonicalAdmission: 'CANONICAL_ADMISSION_NOT_EVALUABLE',
      canonicalAdmissionBlockerReasonCodes: [reasonCode],
      canonicalReadiness: 'CANONICAL_READINESS_NOT_EVALUABLE',
      canonicalBlockerReasonCodes: [reasonCode],
      requiredInputFields: [],
      evidenceAvailability: {},
      expectedBillingClassification: 'UNKNOWN',
      billingPredictionReasonCode: reasonCode,
      evaluationCompleteness: 'NOT_EVALUABLE',
      powertrainClass: 'UNKNOWN',
      providerMirrorFreshness: 'UNKNOWN',
      divergenceLegacyOnly: false,
      metadata: {
        organizationId: input.access.tenantOrganizationId,
        hmVehicleId: input.dto.hmVehicleId,
        selectedProduct: null,
        evaluationDurationMs: Date.now() - started,
        tenantScopeMismatch: reasonCode === 'ORG_SCOPE_MISMATCH',
      },
    };
  }
}