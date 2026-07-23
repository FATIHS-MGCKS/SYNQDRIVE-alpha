export type RentalForeignTravelPolicy = 'ALLOWED' | 'APPROVAL_REQUIRED' | 'NOT_ALLOWED';
export type RentalAdditionalDriverPolicy = 'ALLOWED' | 'APPROVAL_REQUIRED' | 'NOT_ALLOWED';
export type RentalYoungDriverPolicy = 'ALLOWED' | 'FEE_REQUIRED' | 'NOT_ALLOWED';
export type RentalVehicleCategoryType =
  | 'ECONOMY'
  | 'COMPACT'
  | 'TRANSPORTER'
  | 'PREMIUM'
  | 'PERFORMANCE'
  | 'LUXURY'
  | 'EV_PERFORMANCE'
  | 'CUSTOM';

export type RentalRuleSource = 'ORGANIZATION_DEFAULT' | 'CATEGORY' | 'VEHICLE_OVERRIDE';

export interface RentalRuleFields {
  minimumAgeYears: number | null;
  minimumLicenseHoldingMonths: number | null;
  minimumLicenseHoldingYears?: number | null;
  minimumLicenseHoldingRemainderMonths?: number | null;
  depositAmountCents: number | null;
  depositAmount?: number | null;
  depositCurrency: string | null;
  creditCardRequired: boolean | null;
  foreignTravelPolicy: RentalForeignTravelPolicy | null;
  additionalDriverPolicy: RentalAdditionalDriverPolicy | null;
  youngDriverPolicy: RentalYoungDriverPolicy | null;
  insuranceRequirement: string | null;
  manualApprovalRequired: boolean | null;
  notes: string | null;
}

export interface RentalRuleDraftRevisionRef {
  id: string;
  lockVersion: number;
  rulesHash: string;
  version: number;
}

export interface RentalRuleDraftEnvelope {
  hasUnpublishedDraft?: boolean;
  draftRevision?: RentalRuleDraftRevisionRef;
}

export interface OrganizationRentalRulesDto extends RentalRuleFields, RentalRuleDraftEnvelope {
  id?: string;
  organizationId: string;
  isActive: boolean;
  configured: boolean;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type RentalVehicleCategoryStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export type RentalRuleRevisionChangeKind = 'added' | 'changed' | 'removed';

export interface RentalRuleRevisionFieldChange {
  field: string;
  kind: RentalRuleRevisionChangeKind;
  previousValue: unknown;
  newValue: unknown;
  previousSource: RentalRuleSource;
  newSource: RentalRuleSource;
}

export interface RentalRuleRevisionDiffResult {
  scopeType: 'ORGANIZATION' | 'CATEGORY' | 'VEHICLE';
  scopeId: string;
  scopeSource: RentalRuleSource;
  addedRules: RentalRuleRevisionFieldChange[];
  changedRules: RentalRuleRevisionFieldChange[];
  removedRules: RentalRuleRevisionFieldChange[];
  scopeMetaChanges: Array<{
    key: string;
    kind: RentalRuleRevisionChangeKind;
    previousValue: unknown;
    newValue: unknown;
  }>;
  hasChanges: boolean;
}

export interface RentalRulePublishImpactAnalysis {
  scope: {
    organizationId: string;
    scopeType: 'ORGANIZATION' | 'CATEGORY' | 'VEHICLE';
    scopeId: string;
  };
  draftRevisionId: string;
  diff: RentalRuleRevisionDiffResult;
  affectedScopes: {
    categories: Array<{ id: string; name: string; vehicleCount: number }>;
    vehicles: Array<{
      id: string;
      displayName: string;
      licensePlate: string | null;
      rentalCategoryId: string | null;
      rentalCategoryName: string | null;
    }>;
    vehicleOverrides: Array<{
      vehicleId: string;
      displayName: string;
      licensePlate: string | null;
    }>;
    vehiclesWithoutCategory: Array<{
      id: string;
      displayName: string;
      licensePlate: string | null;
    }>;
  };
  bookingImpact: {
    wizardDraft: { count: number; bookingIds: string[] };
    pending: { count: number; bookingIds: string[] };
    confirmed: { count: number; bookingIds: string[] };
    confirmedBookingsUnchanged: true;
  };
  manualApprovalImpact: {
    pendingApprovalCount: number;
    approvalIds: string[];
    bookingIds: string[];
  };
  criticalImpact: {
    isCritical: boolean;
    requiresAcknowledgement: boolean;
    codes: string[];
    messages: string[];
  };
  effectiveImpacts: Array<{
    vehicleId: string;
    displayName: string;
    licensePlate: string | null;
    rentalCategoryId: string | null;
    rentalCategoryName: string | null;
    hasOverride: boolean;
    fieldChanges: Array<{
      field: string;
      kind: RentalRuleRevisionChangeKind;
      previousValue: unknown;
      newValue: unknown;
      previousSource: RentalRuleSource | null;
      newSource: RentalRuleSource | null;
      previousSourceName: string | null;
      newSourceName: string | null;
    }>;
  }>;
  effectiveImpactTotalVehicles: number;
  effectiveImpactTruncated: boolean;
}

export interface RentalVehicleCategoryDto extends RentalRuleFields, RentalRuleDraftEnvelope {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  type: RentalVehicleCategoryType | null;
  color: string | null;
  icon: string | null;
  isActive: boolean;
  status: RentalVehicleCategoryStatus;
  statusChangedAt: string | null;
  vehicleCount?: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RentalCategoryVehicleDto {
  id: string;
  displayName: string;
  licensePlate: string | null;
  status: string;
}

export interface CategoryAssignmentVehicleRef {
  vehicleId: string;
  displayName: string;
  licensePlate: string | null;
}

export interface CategoryAssignmentMoveRef extends CategoryAssignmentVehicleRef {
  fromCategoryId: string;
  fromCategoryName: string | null;
}

export interface CategoryAssignmentDiff {
  added: CategoryAssignmentVehicleRef[];
  removed: CategoryAssignmentVehicleRef[];
  moved: CategoryAssignmentMoveRef[];
  alreadyAssigned: CategoryAssignmentVehicleRef[];
  invalidVehicleIds: string[];
  rejected: Array<{ vehicleId: string; reason: string; code: string }>;
}

export interface CategoryAssignmentResultDto {
  categoryId: string;
  version: number;
  vehicles: RentalCategoryVehicleDto[];
  diff: CategoryAssignmentDiff;
}

export interface CategoryAssignmentDeltaPayload {
  expectedVersion: number;
  vehiclesToAdd?: string[];
  vehiclesToRemove?: string[];
  vehiclesToMove?: Array<{ vehicleId: string; fromCategoryId: string }>;
}

export interface RentalFleetVehicleDto {
  id: string;
  displayName: string;
  licensePlate: string | null;
  status: string;
  rentalCategoryId: string | null;
  rentalCategoryName: string | null;
  hasOverride: boolean;
}

export interface RentalRulesOverrideVehicleDto {
  vehicleId: string;
  displayName: string;
  licensePlate: string | null;
  status: string;
  categoryId: string | null;
  categoryName: string | null;
  overrideCount: number;
  overrideFields?: string[];
  topOverrideField: string | null;
  topOverrideValue: unknown;
  changeReason?: string | null;
  createdByName?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  revisionId?: string | null;
  rulesHash?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RentalRuleRevisionListItemDto {
  id: string;
  organizationId: string;
  scopeType: 'ORGANIZATION' | 'CATEGORY' | 'VEHICLE';
  scopeId: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  rulesHash: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  lockVersion: number;
  changeReason: string | null;
  createdAt: string;
  publishedAt: string | null;
  supersedesRevisionId: string | null;
  createdBy: string | null;
  publishedBy: string | null;
  createdByName?: string | null;
  publishedByName?: string | null;
}

export interface RentalRuleRevisionPreviewResponse {
  scope: {
    organizationId: string;
    scopeType: 'ORGANIZATION' | 'CATEGORY' | 'VEHICLE';
    scopeId: string;
  };
  activeRevision: RentalRuleDraftRevisionRef | null;
  draftRevision: RentalRuleDraftRevisionRef | null;
  preview: {
    mode: 'active' | 'draft' | 'diff';
    hasChanges: boolean;
    ruleDiffs: Array<{
      field: string;
      active: unknown;
      draft: unknown;
      changed: boolean;
    }>;
  };
}

export interface RentalRulesOverviewDto {
  defaultsConfigured: boolean;
  defaultsActive: boolean;
  activeCategoryCount: number;
  draftCategoryCount?: number;
  inactiveCategoryCount?: number;
  archivedCategoryCount?: number;
  totalVehicles: number;
  vehiclesWithCategory: number;
  vehiclesMissingCategory: number;
  vehiclesWithOverrides: number;
  categoriesRequiringManualApproval: number;
  overrideVehicles: RentalRulesOverrideVehicleDto[];
}

export interface RentalRulesActivationDto {
  organizationDefaultsConfigured: boolean;
  organizationRulesActive: boolean;
  categoryAssigned: boolean;
  categoryActive: boolean | null;
  vehicleOverrideActive: boolean;
  enforcementActive: boolean;
  informationalWarnings: string[];
}

export interface EffectiveRuleField<T = unknown> {
  value: T | null;
  source: RentalRuleSource | null;
  sourceName: string | null;
}

export interface EffectiveRentalRulesDto {
  organizationId: string;
  vehicleId: string;
  rentalCategoryId: string | null;
  rentalCategoryName: string | null;
  rentalCategoryType: RentalVehicleCategoryType | null;
  rulesActive: boolean;
  activation?: RentalRulesActivationDto;
  minimumAgeYears: EffectiveRuleField<number | null>;
  minimumLicenseHoldingMonths: EffectiveRuleField<number | null>;
  minimumLicenseHoldingYears: EffectiveRuleField<number | null>;
  minimumLicenseHoldingRemainderMonths: EffectiveRuleField<number | null>;
  depositAmount: EffectiveRuleField<number | null>;
  depositAmountCents: EffectiveRuleField<number | null>;
  depositCurrency: EffectiveRuleField<string | null>;
  creditCardRequired: EffectiveRuleField<boolean | null>;
  foreignTravelPolicy: EffectiveRuleField<RentalForeignTravelPolicy | null>;
  additionalDriverPolicy: EffectiveRuleField<RentalAdditionalDriverPolicy | null>;
  youngDriverPolicy: EffectiveRuleField<RentalYoungDriverPolicy | null>;
  insuranceRequirement: EffectiveRuleField<string | null>;
  manualApprovalRequired: EffectiveRuleField<boolean | null>;
  notes: EffectiveRuleField<string | null>;
}

export interface VehicleRentalRequirementsDto extends RentalRuleDraftEnvelope {
  vehicleId: string;
  organizationId: string;
  rentalCategoryId: string | null;
  rentalCategory: {
    id: string;
    name: string;
    type: RentalVehicleCategoryType | null;
    isActive: boolean;
  } | null;
  overrides: (RentalRuleFields & { id: string; vehicleId: string; version?: number }) | null;
}

export type RentalRuleFormValues = {
  minimumAgeYears: string;
  licenseHoldingWholeYears: string;
  licenseHoldingExtraMonths: string;
  depositAmount: string;
  depositCurrency: string;
  creditCardRequired: '' | 'true' | 'false';
  foreignTravelPolicy: RentalForeignTravelPolicy | '';
  additionalDriverPolicy: RentalAdditionalDriverPolicy | '';
  youngDriverPolicy: RentalYoungDriverPolicy | '';
  insuranceRequirement: string;
  manualApprovalRequired: '' | 'true' | 'false';
  notes: string;
};
