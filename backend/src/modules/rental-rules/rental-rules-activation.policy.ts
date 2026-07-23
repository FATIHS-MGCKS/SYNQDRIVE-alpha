import type { OrganizationRentalRules, RentalVehicleCategory } from '@prisma/client';
import type { RentalRuleFieldSet } from './rental-rules.types';
import { hasActiveRuleOverrides } from './rental-rules.mapper';
import { isCategoryRulesEnforced, resolveCategoryStatusDisplayName } from './rental-rules-category-lifecycle.util';

export const RENTAL_RULES_ACTIVATION_WARNING = {
  ORGANIZATION_INACTIVE:
    'Rental rules are inactive for this organization — no rental-rule enforcement applied.',
  ORGANIZATION_NOT_CONFIGURED:
    'Organization rental rules are not configured — permissive system defaults apply at organization level.',
  CATEGORY_INACTIVE:
    'Vehicle category is not active — category rules are not applied; inheritance falls back to organization defaults and vehicle overrides.',
  CATEGORY_ARCHIVED:
    'Vehicle category is archived — category rules are not applied; vehicles may remain assigned for history.',
  CATEGORY_DRAFT:
    'Vehicle category is still a draft — category rules are not enforced until the category is activated.',
  VEHICLE_OVERRIDE_INACTIVE:
    'Vehicle override has no active fields — inheritance falls back to category and organization defaults.',
} as const;

/**
 * Documented permissive system default when the organization layer has no configured revision.
 * Null field values mean “no constraint from this layer”.
 */
export const RENTAL_RULES_SYSTEM_PERMISSIVE_DEFAULT: Partial<RentalRuleFieldSet> = {
  minimumAgeYears: null,
  minimumLicenseHoldingMonths: null,
  depositAmountCents: null,
  depositCurrency: null,
  creditCardRequired: null,
  foreignTravelPolicy: null,
  additionalDriverPolicy: null,
  youngDriverPolicy: null,
  insuranceRequirement: null,
  manualApprovalRequired: null,
  notes: null,
};

export type RentalRulesActivationSnapshot = {
  organizationDefaultsConfigured: boolean;
  organizationRulesActive: boolean;
  categoryAssigned: boolean;
  categoryActive: boolean | null;
  vehicleOverrideActive: boolean;
  /** When false, rental-rule evaluation must not produce blocking decisions. */
  enforcementActive: boolean;
  informationalWarnings: string[];
};

export function buildRentalRulesActivationSnapshot(input: {
  orgRules: Pick<OrganizationRentalRules, 'isActive'> | null;
  category: Pick<RentalVehicleCategory, 'id' | 'name' | 'isActive' | 'status'> | null;
  overrideFields: Partial<RentalRuleFieldSet> | null;
}): RentalRulesActivationSnapshot {
  const organizationDefaultsConfigured = input.orgRules != null;
  const organizationRulesActive = input.orgRules?.isActive !== false;
  const categoryAssigned = input.category != null;
  const categoryActive = categoryAssigned ? isCategoryRulesEnforced(input.category!.status) : null;
  const vehicleOverrideActive = Boolean(
    input.overrideFields && hasActiveRuleOverrides(input.overrideFields),
  );

  const informationalWarnings: string[] = [];
  if (!organizationDefaultsConfigured) {
    informationalWarnings.push(RENTAL_RULES_ACTIVATION_WARNING.ORGANIZATION_NOT_CONFIGURED);
  }
  if (categoryAssigned && categoryActive === false) {
    if (input.category!.status === 'ARCHIVED') {
      informationalWarnings.push(RENTAL_RULES_ACTIVATION_WARNING.CATEGORY_ARCHIVED);
    } else if (input.category!.status === 'DRAFT') {
      informationalWarnings.push(RENTAL_RULES_ACTIVATION_WARNING.CATEGORY_DRAFT);
    } else {
      informationalWarnings.push(RENTAL_RULES_ACTIVATION_WARNING.CATEGORY_INACTIVE);
    }
  }
  if (input.overrideFields && !vehicleOverrideActive) {
    informationalWarnings.push(RENTAL_RULES_ACTIVATION_WARNING.VEHICLE_OVERRIDE_INACTIVE);
  }

  return {
    organizationDefaultsConfigured,
    organizationRulesActive,
    categoryAssigned,
    categoryActive,
    vehicleOverrideActive,
    enforcementActive: organizationRulesActive,
    informationalWarnings,
  };
}

export function isRentalRulesEnforcementActive(
  activation: RentalRulesActivationSnapshot | undefined,
  rulesActive: boolean,
): boolean {
  if (!rulesActive) return false;
  if (activation && !activation.enforcementActive) return false;
  return true;
}

export function resolveInactiveCategoryDisplayName(
  category: Pick<RentalVehicleCategory, 'name' | 'isActive' | 'status'> | null,
): string | null {
  if (!category) return null;
  return resolveCategoryStatusDisplayName(category.name, category.status);
}

export function createActiveRentalRulesActivationSnapshot(
  overrides: Partial<RentalRulesActivationSnapshot> = {},
): RentalRulesActivationSnapshot {
  return {
    organizationDefaultsConfigured: true,
    organizationRulesActive: true,
    categoryAssigned: false,
    categoryActive: null,
    vehicleOverrideActive: false,
    enforcementActive: true,
    informationalWarnings: [],
    ...overrides,
  };
}
