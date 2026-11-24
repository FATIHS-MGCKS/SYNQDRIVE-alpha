import type { PrismaClient } from '@prisma/client';
import { BillableVehiclesService } from '@modules/billing/billable-vehicles.service';
import {
  BillableVehicleExclusionReason,
  evaluateBillableVehiclePolicy,
} from '@modules/billing/domain/billable-vehicle-policy';
import type {
  HmCanonicalAdmissionVerdict,
  HmCanonicalReadinessVerdict,
  HmExpectedBillingClassification,
} from './hm-only-canonical-readiness-observation.types';

export const HM_OBSERVATION_HYPOTHETICAL_VEHICLE_ID =
  '00000000-0000-4000-8000-00000b5eab1e';

export type HmBillingPredictionResult = {
  classification: HmExpectedBillingClassification;
  reasonCode: string;
};

export async function predictHmOnlyActivationBilling(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    admissionVerdict: HmCanonicalAdmissionVerdict;
    canonicalReadiness: HmCanonicalReadinessVerdict;
    hypotheticalVehicle: {
      vin: string | null;
      make: string;
      model: string;
      licensePlate?: string | null;
    };
    effectiveAt?: Date;
  },
): Promise<HmBillingPredictionResult> {
  if (input.admissionVerdict === 'CANONICAL_IDEMPOTENT_REPLAY') {
    return { classification: 'NO_NEW_EFFECT_IDEMPOTENT_REPLAY', reasonCode: 'IDEMPOTENT_REPLAY' };
  }
  if (
    input.admissionVerdict === 'CANONICAL_LEGACY_RECONCILIATION_REQUIRED' ||
    input.admissionVerdict === 'CANONICAL_ADMISSION_NOT_EVALUABLE'
  ) {
    return { classification: 'UNKNOWN', reasonCode: 'ADMISSION_NOT_BILLABLE_CONTEXT' };
  }
  if (
    input.admissionVerdict === 'CANONICAL_ADMISSION_BLOCKED' ||
    input.canonicalReadiness !== 'CANONICAL_READINESS_PASS'
  ) {
    return {
      classification: 'NOT_APPLICABLE_ACTIVATION_BLOCKED',
      reasonCode: 'ACTIVATION_NOT_READY',
    };
  }

  try {
    const billable = new BillableVehiclesService(prisma as never);
    const asOf = input.effectiveAt ?? new Date();
    const context = await billable.buildPolicyContext(input.organizationId, asOf);
    const hypothetical = {
      id: HM_OBSERVATION_HYPOTHETICAL_VEHICLE_ID,
      organizationId: input.organizationId,
      licensePlate: input.hypotheticalVehicle.licensePlate ?? null,
      vin: input.hypotheticalVehicle.vin,
      make: input.hypotheticalVehicle.make,
      model: input.hypotheticalVehicle.model,
      registryLifecycle: 'ACTIVE' as const,
    };

    const augmented = {
      ...context,
      vehicles: [...context.vehicles, hypothetical],
      connectivityByVehicleId: {
        ...context.connectivityByVehicleId,
        [HM_OBSERVATION_HYPOTHETICAL_VEHICLE_ID]: true,
      },
    };

    const policy = evaluateBillableVehiclePolicy(augmented);
    const row =
      policy.billableVehicles.find((v) => v.id === HM_OBSERVATION_HYPOTHETICAL_VEHICLE_ID) ??
      policy.excludedVehicles.find((v) => v.id === HM_OBSERVATION_HYPOTHETICAL_VEHICLE_ID);

    if (!row) {
      return { classification: 'UNKNOWN', reasonCode: 'POLICY_ROW_MISSING' };
    }

    if (row.billingStatus === 'BILLABLE') {
      return { classification: 'BILLABLE_IF_ACTIVATED', reasonCode: 'POLICY_BILLABLE' };
    }

    const reason = (row as { reason?: BillableVehicleExclusionReason }).reason;
    if (reason === BillableVehicleExclusionReason.NO_BASE_PLAN) {
      return { classification: 'NON_BILLABLE_IF_ACTIVATED', reasonCode: 'NO_BASE_PLAN' };
    }
    if (reason === BillableVehicleExclusionReason.ORG_INACTIVE) {
      return { classification: 'NON_BILLABLE_IF_ACTIVATED', reasonCode: 'ORG_INACTIVE' };
    }

    return {
      classification: 'NON_BILLABLE_IF_ACTIVATED',
      reasonCode: reason ?? 'POLICY_EXCLUDED',
    };
  } catch {
    return { classification: 'UNKNOWN', reasonCode: 'BILLING_POLICY_EVALUATION_FAILED' };
  }
}