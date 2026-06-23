import type {
  RentalAdditionalDriverPolicy,
  RentalForeignTravelPolicy,
  RentalYoungDriverPolicy,
  RentalVehicleCategoryType,
} from '@prisma/client';

export type RentalRuleSource = 'ORGANIZATION_DEFAULT' | 'CATEGORY' | 'VEHICLE_OVERRIDE';

export interface EffectiveRuleField<T> {
  value: T | null;
  source: RentalRuleSource | null;
  sourceName: string | null;
}

export interface RentalRuleFieldSet {
  minimumAgeYears: number | null;
  minimumLicenseHoldingMonths: number | null;
  depositAmountCents: number | null;
  depositCurrency: string | null;
  creditCardRequired: boolean | null;
  foreignTravelPolicy: RentalForeignTravelPolicy | null;
  additionalDriverPolicy: RentalAdditionalDriverPolicy | null;
  youngDriverPolicy: RentalYoungDriverPolicy | null;
  insuranceRequirement: string | null;
  manualApprovalRequired: boolean | null;
  notes: string | null;
}

export type EffectiveRentalRules = {
  [K in keyof RentalRuleFieldSet]: EffectiveRuleField<RentalRuleFieldSet[K]>;
} & {
  organizationId: string;
  vehicleId: string;
  rentalCategoryId: string | null;
  rentalCategoryName: string | null;
  rentalCategoryType: RentalVehicleCategoryType | null;
  rulesActive: boolean;
};

/** Public API shape for GET .../rental-requirements/effective */
export type EffectiveRentalRequirement = Omit<EffectiveRentalRules, 'depositAmountCents'> & {
  depositAmount: EffectiveRuleField<number | null>;
  depositAmountCents: EffectiveRuleField<number | null>;
  minimumLicenseHoldingYears: EffectiveRuleField<number | null>;
};

export const RENTAL_RULE_FIELD_KEYS = [
  'minimumAgeYears',
  'minimumLicenseHoldingMonths',
  'depositAmountCents',
  'depositCurrency',
  'creditCardRequired',
  'foreignTravelPolicy',
  'additionalDriverPolicy',
  'youngDriverPolicy',
  'insuranceRequirement',
  'manualApprovalRequired',
  'notes',
] as const satisfies ReadonlyArray<keyof RentalRuleFieldSet>;

export type RentalRuleFieldKey = (typeof RENTAL_RULE_FIELD_KEYS)[number];
