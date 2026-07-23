import { DEPOSIT_SOURCE } from './deposit-resolver.types';
import {
  DepositBelowMinimumError,
  DepositCurrencyMismatchError,
  extractDepositFloorFromEffectiveRules,
  mapRentalRuleSourceToDepositSource,
  resolveDeposit,
  resolveDepositEntityId,
} from './deposit-resolver.util';
import type { EffectiveRentalRules } from '@modules/rental-rules/rental-rules.types';
import { createActiveRentalRulesActivationSnapshot } from '@modules/rental-rules/rental-rules-activation.policy';

function effectiveRulesStub(overrides: {
  amountCents: number | null;
  currency?: string | null;
  source?: 'ORGANIZATION_DEFAULT' | 'CATEGORY' | 'VEHICLE_OVERRIDE' | null;
  sourceName?: string | null;
}): EffectiveRentalRules {
  return {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    rentalCategoryId: 'cat-1',
    rentalCategoryName: 'Sedan',
    rentalCategoryType: null,
    rulesActive: true,
    activation: createActiveRentalRulesActivationSnapshot(),
    minimumAgeYears: { value: null, source: null, sourceName: null },
    minimumLicenseHoldingMonths: { value: null, source: null, sourceName: null },
    depositAmountCents: {
      value: overrides.amountCents,
      source: overrides.source ?? null,
      sourceName: overrides.sourceName ?? null,
    },
    depositCurrency: {
      value: overrides.currency ?? 'EUR',
      source: overrides.source ?? null,
      sourceName: overrides.sourceName ?? null,
    },
    creditCardRequired: { value: null, source: null, sourceName: null },
    foreignTravelPolicy: { value: null, source: null, sourceName: null },
    additionalDriverPolicy: { value: null, source: null, sourceName: null },
    youngDriverPolicy: { value: null, source: null, sourceName: null },
    insuranceRequirement: { value: null, source: null, sourceName: null },
    manualApprovalRequired: { value: null, source: null, sourceName: null },
    notes: { value: null, source: null, sourceName: null },
  };
}

const tariffLayer = (amountCents: number, currency = 'EUR') => ({
  amountCents,
  currency,
  tariffRateId: 'rate-1',
  tariffVersionId: 'tv-1',
});

const entityIds = {
  organizationRulesId: 'org-rules-1',
  categoryId: 'cat-1',
  vehicleOverrideId: 'veh-override-1',
};

describe('deposit-resolver.util', () => {
  describe('mapRentalRuleSourceToDepositSource', () => {
    it('maps rental rule sources to deposit sources', () => {
      expect(mapRentalRuleSourceToDepositSource('ORGANIZATION_DEFAULT')).toBe(
        DEPOSIT_SOURCE.ORGANIZATION_MINIMUM,
      );
      expect(mapRentalRuleSourceToDepositSource('CATEGORY')).toBe(
        DEPOSIT_SOURCE.CATEGORY_MINIMUM,
      );
      expect(mapRentalRuleSourceToDepositSource('VEHICLE_OVERRIDE')).toBe(
        DEPOSIT_SOURCE.VEHICLE_OVERRIDE_MINIMUM,
      );
    });
  });

  describe('resolveDepositEntityId', () => {
    it('resolves entity ids per rental rule layer', () => {
      expect(resolveDepositEntityId('ORGANIZATION_DEFAULT', entityIds)).toBe('org-rules-1');
      expect(resolveDepositEntityId('CATEGORY', entityIds)).toBe('cat-1');
      expect(resolveDepositEntityId('VEHICLE_OVERRIDE', entityIds)).toBe('veh-override-1');
    });
  });

  describe('extractDepositFloorFromEffectiveRules', () => {
    it('extracts organization minimum floor', () => {
      const floor = extractDepositFloorFromEffectiveRules(
        effectiveRulesStub({
          amountCents: 50000,
          source: 'ORGANIZATION_DEFAULT',
          sourceName: 'Acme GmbH',
        }),
        entityIds,
        'EUR',
      );
      expect(floor).toMatchObject({
        amountCents: 50000,
        source: 'ORGANIZATION_DEFAULT',
        sourceEntityId: 'org-rules-1',
      });
    });

    it('extracts category minimum floor', () => {
      const floor = extractDepositFloorFromEffectiveRules(
        effectiveRulesStub({
          amountCents: 60000,
          source: 'CATEGORY',
          sourceName: 'SUV',
        }),
        entityIds,
        'EUR',
      );
      expect(floor?.source).toBe('CATEGORY');
      expect(floor?.sourceEntityId).toBe('cat-1');
    });

    it('extracts vehicle override minimum floor', () => {
      const floor = extractDepositFloorFromEffectiveRules(
        effectiveRulesStub({
          amountCents: 80000,
          source: 'VEHICLE_OVERRIDE',
          sourceName: 'BMW X5',
        }),
        entityIds,
        'EUR',
      );
      expect(floor?.source).toBe('VEHICLE_OVERRIDE');
      expect(floor?.sourceEntityId).toBe('veh-override-1');
    });

    it('returns null when no deposit configured', () => {
      expect(
        extractDepositFloorFromEffectiveRules(
          effectiveRulesStub({ amountCents: null }),
          entityIds,
          'EUR',
        ),
      ).toBeNull();
    });

    it('blocks currency mismatch between rental rules and pricing', () => {
      expect(() =>
        extractDepositFloorFromEffectiveRules(
          effectiveRulesStub({ amountCents: 50000, currency: 'USD', source: 'ORGANIZATION_DEFAULT' }),
          entityIds,
          'EUR',
        ),
      ).toThrow(DepositCurrencyMismatchError);
    });
  });

  describe('resolveDeposit priority combinations', () => {
    const orgFloor = {
      source: 'ORGANIZATION_DEFAULT' as const,
      sourceName: 'Org',
      sourceEntityId: 'org-rules-1',
      amountCents: 50000,
      currency: 'EUR',
    };
    const categoryFloor = {
      source: 'CATEGORY' as const,
      sourceName: 'SUV',
      sourceEntityId: 'cat-1',
      amountCents: 60000,
      currency: 'EUR',
    };
    const vehicleFloor = {
      source: 'VEHICLE_OVERRIDE' as const,
      sourceName: 'BMW',
      sourceEntityId: 'veh-override-1',
      amountCents: 80000,
      currency: 'EUR',
    };

    it('uses tariff deposit when it exceeds organization minimum', () => {
      const result = resolveDeposit({
        pricingCurrency: 'EUR',
        rentalRulesFloor: orgFloor,
        tariffDeposit: tariffLayer(70000),
      });
      expect(result.amount).toBe(70000);
      expect(result.source).toBe(DEPOSIT_SOURCE.TARIFF_RATE);
      expect(result.ruleRevisionId).toBe('rate-1');
      expect(result.manualOverride).toBe(false);
      expect(result.components.raisedToMinimum).toBe(false);
    });

    it('raises tariff deposit to category minimum when tariff is lower', () => {
      const result = resolveDeposit({
        pricingCurrency: 'EUR',
        rentalRulesFloor: categoryFloor,
        tariffDeposit: tariffLayer(30000),
      });
      expect(result.amount).toBe(60000);
      expect(result.source).toBe(DEPOSIT_SOURCE.CATEGORY_MINIMUM);
      expect(result.ruleRevisionId).toBe('cat-1');
      expect(result.components.raisedToMinimum).toBe(true);
      expect(result.reason).toContain('Raised from tariff deposit');
    });

    it('raises zero tariff to vehicle override minimum', () => {
      const result = resolveDeposit({
        pricingCurrency: 'EUR',
        rentalRulesFloor: vehicleFloor,
        tariffDeposit: tariffLayer(0),
      });
      expect(result.amount).toBe(80000);
      expect(result.source).toBe(DEPOSIT_SOURCE.VEHICLE_OVERRIDE_MINIMUM);
      expect(result.components.raisedToMinimum).toBe(true);
    });

    it('uses tariff alone when no rental rules floor exists', () => {
      const result = resolveDeposit({
        pricingCurrency: 'EUR',
        rentalRulesFloor: null,
        tariffDeposit: tariffLayer(45000),
      });
      expect(result.amount).toBe(45000);
      expect(result.source).toBe(DEPOSIT_SOURCE.TARIFF_RATE);
    });

    it('returns zero when neither rules nor tariff define a deposit', () => {
      const result = resolveDeposit({
        pricingCurrency: 'EUR',
        rentalRulesFloor: null,
        tariffDeposit: tariffLayer(0),
      });
      expect(result.amount).toBe(0);
    });

    it('applies approved manual override above minimum', () => {
      const result = resolveDeposit({
        pricingCurrency: 'EUR',
        rentalRulesFloor: orgFloor,
        tariffDeposit: tariffLayer(50000),
        manualOverride: {
          amountCents: 100000,
          currency: 'EUR',
          approvedByUserId: 'user-1',
          approvalReferenceId: 'approval-1',
          reason: 'VIP customer approved lower friction deposit increase',
        },
      });
      expect(result.amount).toBe(100000);
      expect(result.source).toBe(DEPOSIT_SOURCE.MANUAL_OVERRIDE_APPROVED);
      expect(result.manualOverride).toBe(true);
      expect(result.ruleRevisionId).toBe('approval-1');
    });

    it('allows approved manual override below minimum when reference is present', () => {
      const result = resolveDeposit({
        pricingCurrency: 'EUR',
        rentalRulesFloor: orgFloor,
        tariffDeposit: tariffLayer(50000),
        manualOverride: {
          amountCents: 30000,
          currency: 'EUR',
          approvedByUserId: 'user-1',
          approvalReferenceId: 'approval-lower-1',
          reason: 'Manager approved reduced deposit',
        },
      });
      expect(result.amount).toBe(30000);
      expect(result.manualOverride).toBe(true);
    });

    it('blocks unapproved deposit below minimum', () => {
      expect(() =>
        resolveDeposit({
          pricingCurrency: 'EUR',
          rentalRulesFloor: orgFloor,
          tariffDeposit: tariffLayer(50000),
          manualOverride: {
            amountCents: 30000,
            currency: 'EUR',
            approvedByUserId: 'user-1',
            approvalReferenceId: '',
            reason: 'No approval',
          },
        }),
      ).toThrow(DepositBelowMinimumError);
    });

    it('blocks tariff vs pricing currency mismatch', () => {
      expect(() =>
        resolveDeposit({
          pricingCurrency: 'EUR',
          rentalRulesFloor: orgFloor,
          tariffDeposit: tariffLayer(50000, 'USD'),
        }),
      ).toThrow(DepositCurrencyMismatchError);
    });

    it('blocks manual override currency mismatch', () => {
      expect(() =>
        resolveDeposit({
          pricingCurrency: 'EUR',
          rentalRulesFloor: orgFloor,
          tariffDeposit: tariffLayer(50000),
          manualOverride: {
            amountCents: 50000,
            currency: 'USD',
            approvedByUserId: 'user-1',
            approvalReferenceId: 'approval-1',
            reason: 'Wrong currency',
          },
        }),
      ).toThrow(DepositCurrencyMismatchError);
    });

    it('includes calculatedAt timestamp', () => {
      const at = new Date('2026-07-23T12:00:00.000Z');
      const result = resolveDeposit({
        pricingCurrency: 'EUR',
        rentalRulesFloor: null,
        tariffDeposit: tariffLayer(15000),
        calculatedAt: at,
      });
      expect(result.calculatedAt).toBe('2026-07-23T12:00:00.000Z');
    });
  });
});
