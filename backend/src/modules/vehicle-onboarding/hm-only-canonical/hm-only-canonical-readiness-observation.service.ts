import { Injectable } from '@nestjs/common';
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
import { type HmOnlyReadinessObservationResult } from './hm-only-canonical-readiness-observation.types';
import {
  recordHmReadinessObservation,
  sanitizeObservationErrorCode,
} from './hm-only-canonical-readiness-observability';
import { parseHmOnlyOperatorIdentityCapture } from './hm-only-operator-identity.validation';
import {
  assertHmObservationAuthenticatedOrgScope,
  assertHmObservationRecordTenantScope,
} from './hm-only-canonical-tenant-access.guard';
import { classifyHmOnlyCanonicalAdmission } from './hm-only-canonical-admission.classifier';
import { predictHmOnlyActivationBilling } from './hm-only-canonical-activation-billing-prediction';
import {
  assertHmPreRegistrationSnapshotUnchanged,
  buildHmObservationEvaluationSnapshot,
  type HmPreRegistrationObservationSnapshot,
} from './hm-only-canonical-observation-snapshot';
import { runHmObservationEvaluation } from './hm-only-canonical-observation-concurrency';
import { runHmObservationInReadOnlyTransaction, type HmObservationReadDb } from './hm-only-canonical-observation-readonly-tx';
import { classifyHmObservationDivergence } from './hm-only-canonical-observation-divergence';

const MIRROR_STALE_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class HmOnlyCanonicalReadinessObservationService {
  constructor(private readonly prisma: PrismaService) {}

  async observeHmOnlyRegistrationAttempt(input: {
    dto: RegisterHmOnlyVehicleDto;
    access: {
      tenantOrganizationId: string;
      isMasterAdmin: boolean;
      actorUserId: string | null;
    };
    preRegistrationSnapshot?: HmPreRegistrationObservationSnapshot;
    /** Integration tests may skip READ ONLY transaction (mock prisma). */
    skipReadOnlyTransaction?: boolean;
  }): Promise<HmOnlyReadinessObservationResult> {
    const started = Date.now();

    let run: Awaited<ReturnType<typeof runHmObservationEvaluation<HmOnlyReadinessObservationResult>>>;
    try {
      run = await runHmObservationEvaluation(async () => {
      const txResult = input.skipReadOnlyTransaction
        ? await this.evaluateInternal(this.prisma, input, started)
        : await runHmObservationInReadOnlyTransaction(this.prisma, async (tx) =>
            this.evaluateInternal(tx, input, started),
          );

      if (txResult === 'OBSERVATION_DB_CONSISTENCY_UNAVAILABLE') {
        return this.buildNotEvaluableResult(input, started, 'OBSERVATION_DB_CONSISTENCY_UNAVAILABLE');
      }

      return txResult;
      });
    } catch (error) {
      const code = sanitizeObservationErrorCode(error);
      const fallback = this.buildNotEvaluableResult(input, started, code);
      this.safeRecord(fallback, code);
      return fallback;
    }

    if (run.status === 'OVERLOAD') {
      const overload = this.buildNotEvaluableResult(input, started, 'OBSERVATION_OVERLOAD');
      this.safeRecord(overload, 'OBSERVATION_OVERLOAD');
      return overload;
    }

    if (run.status === 'TIMEOUT') {
      const timeout = this.buildNotEvaluableResult(input, started, 'OBSERVATION_TIMEOUT');
      this.safeRecord(timeout, 'OBSERVATION_TIMEOUT');
      return timeout;
    }

    try {
      this.safeRecord(run.value);
      return run.value;
    } catch (error) {
      const code = sanitizeObservationErrorCode(error);
      const fallback = this.buildNotEvaluableResult(input, started, code);
      this.safeRecord(fallback, code);
      return fallback;
    }
  }

  private safeRecord(result: HmOnlyReadinessObservationResult, errorCode?: string): void {
    try {
      recordHmReadinessObservation(result, errorCode);
    } catch {
      /* metrics/logger isolation */
    }
  }

  private buildNotEvaluableResult(
    input: { dto: RegisterHmOnlyVehicleDto; access: { tenantOrganizationId: string } },
    started: number,
    reasonCode: string,
    opts?: { tenantScopeMismatch?: boolean },
  ): HmOnlyReadinessObservationResult {
    const div = classifyHmObservationDivergence({
      legacyAdmission: 'LEGACY_NOT_EVALUABLE',
      canonicalAdmission: 'CANONICAL_ADMISSION_NOT_EVALUABLE',
      canonicalReadiness: 'CANONICAL_READINESS_NOT_EVALUABLE',
      evaluationCompleteness: 'NOT_EVALUABLE',
    });
    return {
      legacyAdmission: 'LEGACY_NOT_EVALUABLE',
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
      divergenceLegacyOnly: div.divergenceLegacyOnly,
      divergenceClassification: div.classification,
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
    db: HmObservationReadDb,
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
    try {
      return await this.evaluateInternalCore(db, input, started);
    } catch (error) {
      const code = sanitizeObservationErrorCode(error);
      return this.buildNotEvaluableResult(input, started, code, {
        tenantScopeMismatch: input.dto.organizationId !== input.access.tenantOrganizationId,
      });
    }
  }

  private async evaluateInternalCore(
    db: HmObservationReadDb,
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
      (await db.highMobilityVehicle.findUnique({
        where: { id: input.dto.hmVehicleId },
      }));
    if (!hmRecord) {
      return this.buildNotEvaluableResult(input, started, 'NOT_FOUND');
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
      input.preRegistrationSnapshot ??
      (await buildHmObservationEvaluationSnapshot(db, hmRecord, input.dto.organizationId));

    const legacy = await classifyHmOnlyLegacyAdmission(db as PrismaService, {
      dto: input.dto,
      access: input.access,
      hmRecord,
    });

    const admission = await classifyHmOnlyCanonicalAdmission(db as PrismaService, {
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

      if (input.dto.fuelType?.trim() && !normalizeHmOnlyFuelType(input.dto.fuelType)) {
        canonicalBlockers.push('INVALID_CAPTURE_PAYLOAD');
      }

      const org = await db.organization.findUniqueOrThrow({
        where: { id: input.dto.organizationId },
      });
      if (org.status !== OrganizationStatus.ACTIVE) {
        canonicalBlockers.push('ORG_STATUS_NOT_ACTIVE');
      }

      try {
        selectedProduct = await resolveMasterDimoReadinessProduct(
          db as PrismaService,
          input.dto.organizationId,
        );
        const entitled = await isOrganizationProductEntitled(
          db as PrismaService,
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
          db as PrismaService,
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
      db,
      snapshot,
      input.dto.organizationId,
    );
    if (!snapshotOk.ok) {
      return this.buildNotEvaluableResult(input, started, snapshotOk.reasonCode);
    }

    const mirrorAgeMs = Date.now() - hmRecord.updatedAt.getTime();
    const providerMirrorFreshness =
      mirrorAgeMs <= MIRROR_STALE_MS ? 'FRESH' : ('STALE' as const);

    const billing = await predictHmOnlyActivationBilling(db as PrismaService, {
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

    const div = classifyHmObservationDivergence({
      legacyAdmission: legacy.verdict,
      canonicalAdmission: admission.verdict,
      canonicalReadiness,
      evaluationCompleteness: completeness,
    });

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
      divergenceLegacyOnly: div.divergenceLegacyOnly,
      divergenceClassification: div.classification,
      metadata: {
        organizationId: input.access.tenantOrganizationId,
        hmVehicleId: input.dto.hmVehicleId,
        selectedProduct,
        evaluationDurationMs: Date.now() - started,
      },
    };
  }

  private tenantDeniedResult(
    input: { dto: RegisterHmOnlyVehicleDto; access: { tenantOrganizationId: string } },
    started: number,
    reasonCode: 'ORG_SCOPE_MISMATCH' | 'HM_TENANT_ACCESS_DENIED',
  ): HmOnlyReadinessObservationResult {
    const div = classifyHmObservationDivergence({
      legacyAdmission: 'LEGACY_BLOCKED',
      canonicalAdmission: 'CANONICAL_ADMISSION_NOT_EVALUABLE',
      canonicalReadiness: 'CANONICAL_READINESS_NOT_EVALUABLE',
      evaluationCompleteness: 'NOT_EVALUABLE',
    });
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
      divergenceLegacyOnly: div.divergenceLegacyOnly,
      divergenceClassification: div.classification,
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