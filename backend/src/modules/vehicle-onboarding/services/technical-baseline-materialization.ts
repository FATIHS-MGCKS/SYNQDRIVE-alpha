import { randomUUID } from 'node:crypto';
import type { Prisma, VehicleOnboardingCase } from '@prisma/client';
import { ReferenceCapacityVerificationStatus } from '@prisma/client';
import { normalizeReferenceSpecWriteInput } from '@modules/vehicle-intelligence/brakes/brake-reference-spec.domain';
import type { SpecVehicleFitContext } from '@modules/vehicle-intelligence/brakes/brake-reference-spec.types';
import { validateOnboardingBrakeReference } from '../policy/technical-baseline-brake.validation';
import { buildBrakeSpecVehicleFitContextFromCase } from '../policy/technical-baseline-vehicle-context';
import {
  evaluateReferenceCapacityCreate,
  REFERENCE_CAPACITY_CHANGE_ACTIONS,
  resolveInitialVerificationStatus,
} from '@modules/vehicle-intelligence/battery-health/reference-capacity/vehicle-battery-reference-capacity.policy';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import type { VehicleTechnicalBaselineDraftV2 } from '../contracts/vehicle-technical-baseline-draft.v2';
import {
  assessHvBatteryBaselineState,
  isHvBatteryReferenceMaterializable,
  parseTechnicalBaselineDraft,
} from '../policy/technical-baseline-draft.validation';
import { buildTechnicalBaselineDraftV2FromRaw } from '../policy/technical-baseline-draft.v2.runtime';
import { isOnboardingBrakeReferenceMaterializable } from '../policy/technical-baseline-brake.validation';
import { classifyPowertrainFromFuelType } from '../readiness/powertrain-classification';
import {
  parseValidatedIdentityDraft,
  parseValidatedReadinessSnapshotV2,
} from '../policy/persisted-contract.validation';
import { resolveReadinessProfileForSelectedProduct } from '../readiness/profiles/profile-registry';
import type { VehicleOnboardingReadinessProfileV1 } from '../readiness/profiles/vehicle-onboarding-readiness-profile.v1';
import { READINESS_SNAPSHOT_VERSION_V2 } from '../contracts/vo-document-versions';

/** Integration-test fault injection — forces rollback after vehicle create. */
export type TechnicalBaselineMaterializationTestHooks = {
  forceMaterializationFailure?: boolean;
};

export async function materializeTechnicalBaselineInActivationTx(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    vehicleId: string;
    caseRow: VehicleOnboardingCase;
    actorUserId: string | null;
    testHooks?: TechnicalBaselineMaterializationTestHooks;
  },
): Promise<void> {
  if (input.testHooks?.forceMaterializationFailure) {
    throw new VehicleOnboardingError(
      'TECHNICAL_BASELINE_MATERIALIZATION_FAILED',
      'VO45 fault injection',
    );
  }

  const parsed = parseTechnicalBaselineDraft(input.caseRow);
  if (parsed.version !== 2) {
    assertNoRequiredBaselineMaterializationObligation(input.caseRow, parsed);
    return;
  }

  const rawJson = input.caseRow.draftTechnicalBaselineJson as unknown;
  if (rawJson && typeof rawJson === 'object' && !Array.isArray(rawJson)) {
    const { hasInvalidSection } = buildTechnicalBaselineDraftV2FromRaw(
      rawJson as Record<string, unknown>,
    );
    if (hasInvalidSection) {
      throw new VehicleOnboardingError(
        'TECHNICAL_BASELINE_MATERIALIZATION_FAILED',
        'Invalid technical baseline v2 section',
      );
    }
  }

  const draft = parsed.draft;
  const identity = parseValidatedIdentityDraft(input.caseRow);
  const vehicleContext = buildBrakeSpecVehicleFitContextFromCase(input.caseRow);

  await materializeBrakeIfPresent(tx, input.vehicleId, draft, vehicleContext);
  await materializeHvBatteryIfPresent(tx, {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    actorUserId: input.actorUserId,
    caseId: input.caseRow.id,
    draft,
  });

  if (input.caseRow.readinessSnapshotVersion === READINESS_SNAPSHOT_VERSION_V2) {
    const snap = parseValidatedReadinessSnapshotV2(input.caseRow);
    const profile = resolveReadinessProfileForSelectedProduct(
      snap.productContext.selectedProductSlug,
    );
    const powertrain = classifyPowertrainFromFuelType(identity.fuelType);
    await assertRequiredBaselinesMaterialized(
      profile,
      powertrain,
      draft,
      input.vehicleId,
      tx,
      vehicleContext,
    );
  }

}

function assertNoRequiredBaselineMaterializationObligation(
  caseRow: VehicleOnboardingCase,
  parsed: ReturnType<typeof parseTechnicalBaselineDraft>,
): void {
  if (caseRow.readinessSnapshotVersion !== READINESS_SNAPSHOT_VERSION_V2) {
    return;
  }
  const snap = parseValidatedReadinessSnapshotV2(caseRow);
  const profile = resolveReadinessProfileForSelectedProduct(
    snap.productContext.selectedProductSlug,
  );
  const identity = parseValidatedIdentityDraft(caseRow);
  const powertrain = classifyPowertrainFromFuelType(identity.fuelType);
  const hvPolicy = profile.hvBatteryByPowertrain[powertrain];
  const hvState = assessHvBatteryBaselineState(parsed);
  if (hvPolicy === 'REQUIRED' && hvState === 'v1_opaque_only') {
    throw new VehicleOnboardingError(
      'TECHNICAL_BASELINE_MATERIALIZATION_FAILED',
      'V1 opaque HV reference cannot be materialized',
    );
  }
  if (hvPolicy === 'REQUIRED' && hvState === 'materializable') {
    throw new VehicleOnboardingError(
      'TECHNICAL_BASELINE_MATERIALIZATION_FAILED',
      'Required HV baseline requires technical draft v2',
    );
  }
}

async function materializeBrakeIfPresent(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  draft: VehicleTechnicalBaselineDraftV2,
  vehicleContext: SpecVehicleFitContext,
): Promise<void> {
  const brake = draft.brakeReference;
  if (!brake || !isOnboardingBrakeReferenceMaterializable(brake, vehicleContext)) return;

  const existing = await tx.vehicleBrakeReferenceSpec.findFirst({
    where: { vehicleId },
    select: { id: true },
  });
  if (existing) return;

  const validated = validateOnboardingBrakeReference(brake, vehicleContext);
  if (!validated.ok) {
    throw new VehicleOnboardingError(
      'TECHNICAL_BASELINE_MATERIALIZATION_FAILED',
      validated.reason,
    );
  }
  let normalized: { data: Record<string, unknown>; warnings: string[] };
  try {
    normalized = normalizeReferenceSpecWriteInput(brake);
  } catch (error) {
    throw new VehicleOnboardingError(
      'TECHNICAL_BASELINE_MATERIALIZATION_FAILED',
      error instanceof Error ? error.message : 'Invalid brake reference',
    );
  }

  await tx.vehicleBrakeReferenceSpec.create({
    data: {
      vehicle: { connect: { id: vehicleId } },
      frontRotorDiameter: brake.frontRotorDiameter ?? undefined,
      rearRotorDiameter: brake.rearRotorDiameter ?? undefined,
      ...normalized.data,
    } as Prisma.VehicleBrakeReferenceSpecCreateInput,
  });
}

async function materializeHvBatteryIfPresent(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    vehicleId: string;
    actorUserId: string | null;
    caseId: string;
    draft: VehicleTechnicalBaselineDraftV2;
  },
): Promise<void> {
  const hv = input.draft.hvBatteryReference;
  if (!hv || !isHvBatteryReferenceMaterializable(hv)) return;

  if (hv.documentId) {
    await assertBatteryDocumentScope(tx, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      documentId: hv.documentId,
    });
  }
  if (hv.serviceEventId != null) {
    throw new VehicleOnboardingError(
      'TECHNICAL_BASELINE_MATERIALIZATION_FAILED',
      'Onboarding HV reference does not support serviceEventId',
    );
  }

  const policy = evaluateReferenceCapacityCreate(hv);
  if (!policy.ok) {
    throw new VehicleOnboardingError(
      'TECHNICAL_BASELINE_MATERIALIZATION_FAILED',
      policy.reasonCodes.join(','),
    );
  }

  const existing = await tx.vehicleBatteryReferenceCapacity.findFirst({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      isActive: true,
      supersededById: null,
    },
  });
  if (existing) return;

  const verificationStatus = resolveInitialVerificationStatus();

  const active = await tx.vehicleBatteryReferenceCapacity.findFirst({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      isActive: true,
    },
  });
  if (active) {
    await tx.vehicleBatteryReferenceCapacity.update({
      where: { id: active.id },
      data: { isActive: false, effectiveTo: new Date() },
    });
  }

  const created = await tx.vehicleBatteryReferenceCapacity.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      capacityKwh: hv.capacityKwh,
      capacityType: hv.capacityType,
      source: hv.source,
      verificationStatus: verificationStatus as ReferenceCapacityVerificationStatus,
      documentId: hv.documentId ?? null,
      serviceEventId: hv.serviceEventId ?? null,
      notes: hv.notes ?? null,
      isActive: true,
    },
  });

  if (active) {
    await tx.vehicleBatteryReferenceCapacity.update({
      where: { id: active.id },
      data: { supersededById: created.id },
    });
    await tx.vehicleBatteryReferenceCapacityChange.create({
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        referenceCapacityId: active.id,
        action: REFERENCE_CAPACITY_CHANGE_ACTIONS.SUPERSEDED,
        previousStatus: active.verificationStatus,
        newStatus: active.verificationStatus,
        actorUserId: input.actorUserId,
        metadata: {
          supersededById: created.id,
          provenance: 'VEHICLE_ONBOARDING_ACTIVATION',
          onboardingCaseId: input.caseId,
        },
      },
    });
  }

  await tx.vehicleBatteryReferenceCapacityChange.create({
    data: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      referenceCapacityId: created.id,
      action: REFERENCE_CAPACITY_CHANGE_ACTIONS.CREATED,
      newStatus: verificationStatus as ReferenceCapacityVerificationStatus,
      actorUserId: input.actorUserId,
      metadata: {
        capacityKwh: created.capacityKwh,
        capacityType: created.capacityType,
        source: created.source,
        provenance: 'VEHICLE_ONBOARDING_ACTIVATION',
        onboardingCaseId: input.caseId,
      },
    },
  });
}

async function assertBatteryDocumentScope(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; vehicleId: string; documentId: string },
): Promise<void> {
  const doc = await tx.vehicleDocumentExtraction.findUnique({
    where: { id: input.documentId },
    select: { organizationId: true, vehicleId: true },
  });
  if (!doc) {
    throw new VehicleOnboardingError(
      'TECHNICAL_BASELINE_EVIDENCE_SCOPE_MISMATCH',
      'Document evidence not found',
    );
  }
  if (doc.organizationId !== input.organizationId) {
    throw new VehicleOnboardingError(
      'TECHNICAL_BASELINE_EVIDENCE_SCOPE_MISMATCH',
      'Document evidence organization scope mismatch',
    );
  }
  if (doc.vehicleId != null && doc.vehicleId !== input.vehicleId) {
    throw new VehicleOnboardingError(
      'TECHNICAL_BASELINE_EVIDENCE_SCOPE_MISMATCH',
      'Document evidence vehicle scope mismatch',
    );
  }
}

async function assertRequiredBaselinesMaterialized(
  profile: VehicleOnboardingReadinessProfileV1,
  powertrain: ReturnType<typeof classifyPowertrainFromFuelType>,
  draft: VehicleTechnicalBaselineDraftV2,
  vehicleId: string,
  tx: Prisma.TransactionClient,
  vehicleContext: SpecVehicleFitContext,
): Promise<void> {
  const hvPolicy = profile.hvBatteryByPowertrain[powertrain];
  if (hvPolicy === 'REQUIRED') {
    if (!isHvBatteryReferenceMaterializable(draft.hvBatteryReference ?? null)) {
      throw new VehicleOnboardingError(
        'TECHNICAL_BASELINE_MATERIALIZATION_FAILED',
        'Required HV battery baseline missing at activation',
      );
    }
    const row = await tx.vehicleBatteryReferenceCapacity.findFirst({
      where: { vehicleId, isActive: true, supersededById: null },
    });
    if (!row) {
      throw new VehicleOnboardingError(
        'TECHNICAL_BASELINE_MATERIALIZATION_FAILED',
        'VO-INV-BASELINE-MATERIALIZATION-001 HV row missing',
      );
    }
  }

  const brakePolicy = profile.brakeBaseline;
  if (brakePolicy === 'REQUIRED') {
    if (!isOnboardingBrakeReferenceMaterializable(draft.brakeReference ?? null, vehicleContext)) {
      throw new VehicleOnboardingError(
        'TECHNICAL_BASELINE_MATERIALIZATION_FAILED',
        'Required brake baseline missing at activation',
      );
    }
    const row = await tx.vehicleBrakeReferenceSpec.findFirst({ where: { vehicleId } });
    if (!row) {
      throw new VehicleOnboardingError(
        'TECHNICAL_BASELINE_MATERIALIZATION_FAILED',
        'VO-INV-BASELINE-MATERIALIZATION-001 brake row missing',
      );
    }
  }

  const tirePolicy = profile.tireBaseline;
  if (tirePolicy === 'REQUIRED') {
    throw new VehicleOnboardingError(
      'TECHNICAL_BASELINE_MATERIALIZATION_FAILED',
      'Required tire baseline has no safe reference authority',
    );
  }
}
