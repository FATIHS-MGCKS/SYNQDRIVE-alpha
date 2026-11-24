import {
  OnboardingCaseSourceMode,
  OnboardingCaseStatus,
  type FuelType,
  type HighMobilityVehicle,
  type Organization,
  type ProductSlug,
  type VehicleOnboardingCase,
  type VehicleOnboardingCaseSourceRef,
} from '@prisma/client';
import type { RegisterHmOnlyVehicleDto } from '@modules/high-mobility/dto/high-mobility.dto';
import {
  ONBOARDING_SOURCE_SNAPSHOT_VERSION,
  VEHICLE_IDENTITY_DRAFT_VERSION,
} from '../contracts/vo-document-versions';
import { buildHmOnboardingSourceSnapshot } from '../adapters/high-mobility-onboarding-source.adapter';
import { evaluateReadinessRules } from '../readiness/readiness-rule-engine';
import { resolveReadinessProfileForSelectedProduct } from '../readiness/profiles/profile-registry';
import { resolveJurisdictionContext } from '../readiness/jurisdiction-authority';
import { classifyPowertrainFromFuelType } from '../readiness/powertrain-classification';
import { parseHmOnlyOperatorIdentityCapture } from './hm-only-operator-identity.validation';
import {
  buildHmOnlyAdminBaselineDraft,
  buildHmOnlyTechnicalBaselineDraft,
  normalizeHmOnlyFuelType,
} from './hm-only-canonical-registration.mapper';
import type { VehicleOnboardingHvBatteryReferenceDraft } from '../contracts/vehicle-technical-baseline-draft.v2';

const PROJECTION_CASE_ID = '00000000-0000-4000-8000-000000000001';

export function buildProjectedHmOnlyOnboardingCase(input: {
  organizationId: string;
  hmRecord: HighMobilityVehicle;
  dto: RegisterHmOnlyVehicleDto;
  hvBattery: VehicleOnboardingHvBatteryReferenceDraft | null;
}): { caseRow: VehicleOnboardingCase; sourceRefs: VehicleOnboardingCaseSourceRef[] } {
  const operatorIdentity = parseHmOnlyOperatorIdentityCapture(input.dto);
  const operatorFuel = normalizeHmOnlyFuelType(input.dto.fuelType);
  const adminDraft = buildHmOnlyAdminBaselineDraft(input.dto, input.hmRecord);
  const technicalDraft = buildHmOnlyTechnicalBaselineDraft(input.hvBattery);
  const now = new Date();

  const identityDraft = {
    version: VEHICLE_IDENTITY_DRAFT_VERSION,
    vin: input.hmRecord.vin,
    make: input.hmRecord.brand,
    model: operatorIdentity.model,
    year: operatorIdentity.year,
    fuelType: (operatorFuel ?? undefined) as FuelType | undefined,
  };

  const caseRow = {
    id: PROJECTION_CASE_ID,
    organizationId: input.organizationId,
    sourceMode: OnboardingCaseSourceMode.HIGH_MOBILITY,
    status: OnboardingCaseStatus.IN_PROGRESS,
    primarySourceProvider: 'HIGH_MOBILITY',
    primarySourceScopeKey: '',
    primarySourceExternalId: input.hmRecord.hmVehicleReference,
    draftIdentityJson: identityDraft,
    draftIdentityVersion: VEHICLE_IDENTITY_DRAFT_VERSION,
    draftAdminBaselineJson: adminDraft as unknown,
    draftAdminBaselineVersion: 1,
    draftTechnicalBaselineJson: technicalDraft as unknown,
    draftTechnicalBaselineVersion: 2,
    readinessSnapshotJson: null,
    readinessSnapshotVersion: 0,
    readinessProfileVersion: null,
    validationFindingsJson: null,
    validationFindingsVersion: 0,
    idempotencyKey: null,
    concurrencyToken: null,
    vehicleId: null,
    initiatedByUserId: null,
    lastActorUserId: null,
    completedAt: null,
    cancelledAt: null,
    expiredAt: null,
    createdAt: now,
    updatedAt: now,
  } as unknown as VehicleOnboardingCase;

  const hmSnapshot = buildHmOnboardingSourceSnapshot(
    input.hmRecord,
    input.organizationId,
    input.hmRecord.updatedAt,
  );
  const sourceRefs: VehicleOnboardingCaseSourceRef[] = [
    {
      id: '00000000-0000-4000-8000-000000000002',
      onboardingCaseId: PROJECTION_CASE_ID,
      provider: 'HIGH_MOBILITY',
      connectionScope: hmSnapshot.connectionScope as unknown as string | null,
      connectionScopeKey: `org:${input.organizationId}`,
      externalVehicleIdentity: hmSnapshot.externalVehicleIdentity,
      sourceMirrorTable: hmSnapshot.sourceMirrorTable,
      sourceMirrorId: hmSnapshot.sourceMirrorId,
      provenanceAt: input.hmRecord.updatedAt,
      firstSeenAt: input.hmRecord.createdAt,
      lastSeenAt: input.hmRecord.updatedAt,
      isPrimary: true,
      createdAt: now,
      snapshotMetadataJson: hmSnapshot,
      snapshotMetadataVersion: ONBOARDING_SOURCE_SNAPSHOT_VERSION,
    } as unknown as VehicleOnboardingCaseSourceRef,
  ];

  return { caseRow, sourceRefs };
}

export function evaluateProjectedHmOnlyCanonicalReadiness(input: {
  organization: Organization;
  caseRow: VehicleOnboardingCase;
  sourceRefs: VehicleOnboardingCaseSourceRef[];
  selectedProduct: ProductSlug;
}) {
  const profile = resolveReadinessProfileForSelectedProduct(input.selectedProduct);
  const jurisdiction = resolveJurisdictionContext(input.organization);
  const evaluated = evaluateReadinessRules({
    caseRow: input.caseRow,
    sourceRefs: input.sourceRefs,
    organization: input.organization,
    profile,
  });
  const powertrain = classifyPowertrainFromFuelType(
    (input.caseRow.draftIdentityJson as { fuelType?: FuelType | null })?.fuelType ?? null,
  );
  return {
    evaluated,
    profile,
    jurisdiction,
    powertrain,
  };
}