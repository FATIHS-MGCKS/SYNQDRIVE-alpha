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

export interface OrganizationRentalRulesDto extends RentalRuleFields {
  id?: string;
  organizationId: string;
  isActive: boolean;
  configured: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface RentalVehicleCategoryDto extends RentalRuleFields {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  type: RentalVehicleCategoryType | null;
  color: string | null;
  icon: string | null;
  isActive: boolean;
  vehicleCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RentalCategoryVehicleDto {
  id: string;
  displayName: string;
  licensePlate: string | null;
  status: string;
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
  topOverrideField: string | null;
  topOverrideValue: unknown;
}

export interface RentalRulesOverviewDto {
  defaultsConfigured: boolean;
  defaultsActive: boolean;
  activeCategoryCount: number;
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

export interface VehicleRentalRequirementsDto {
  vehicleId: string;
  organizationId: string;
  rentalCategoryId: string | null;
  rentalCategory: {
    id: string;
    name: string;
    type: RentalVehicleCategoryType | null;
    isActive: boolean;
  } | null;
  overrides: (RentalRuleFields & { id: string; vehicleId: string }) | null;
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
