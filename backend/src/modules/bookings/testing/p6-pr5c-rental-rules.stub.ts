import { buildEffectiveRentalRules } from '@modules/rental-rules/rental-effective-rules.util';
import { RentalEffectiveRulesService } from '@modules/rental-rules/rental-effective-rules.service';
import { createActiveRentalRulesActivationSnapshot } from '@modules/rental-rules/rental-rules-activation.policy';
import type { EffectiveRentalRules } from '@modules/rental-rules/rental-rules.types';

/**
 * P6-PR5C certification boundary: wizard/pricing HTTP paths use deterministic rental rules
 * without loading `vehicle_rental_requirement_overrides` (avoids disposable-Postgres schema
 * drift on deep rental-rules columns while still exercising deposit resolution + eligibility).
 */
const P6_PR5C_ORG_RULE_LAYER = {
  source: 'ORGANIZATION_DEFAULT' as const,
  sourceName: 'P6-PR5C disposable fixture',
  values: {
    minimumAgeYears: 18,
    minimumLicenseHoldingMonths: 0,
    depositAmountCents: 50_000,
    depositCurrency: 'EUR',
    creditCardRequired: false,
    foreignTravelPolicy: 'ALLOWED' as const,
    additionalDriverPolicy: 'ALLOWED' as const,
    youngDriverPolicy: 'ALLOWED' as const,
    insuranceRequirement: null,
    manualApprovalRequired: false,
    notes: null,
  },
};

export function buildP6Pr5cEffectiveRentalRules(orgId: string, vehicleId: string): EffectiveRentalRules {
  return buildEffectiveRentalRules({
    organizationId: orgId,
    vehicleId,
    orgLayer: P6_PR5C_ORG_RULE_LAYER,
    categoryLayer: null,
    vehicleLayer: null,
    rentalCategoryId: null,
    rentalCategoryName: null,
    rentalCategoryType: null,
    rulesActive: true,
    activation: createActiveRentalRulesActivationSnapshot(),
  });
}

export function createP6Pr5cRentalEffectiveRulesStub(): Pick<
  RentalEffectiveRulesService,
  | 'computeForVehicle'
  | 'computeWithSimulatedOverrideFields'
  | 'computeWithSimulatedDraftScope'
  | 'formatEffectiveRules'
> {
  const formatter = new RentalEffectiveRulesService({} as never);
  return {
    async computeForVehicle(orgId, vehicleId) {
      return buildP6Pr5cEffectiveRentalRules(orgId, vehicleId);
    },
    async computeWithSimulatedOverrideFields(orgId, vehicleId) {
      return buildP6Pr5cEffectiveRentalRules(orgId, vehicleId);
    },
    async computeWithSimulatedDraftScope(orgId, vehicleId) {
      return buildP6Pr5cEffectiveRentalRules(orgId, vehicleId);
    },
    formatEffectiveRules(rules) {
      return formatter.formatEffectiveRules(rules);
    },
  };
}