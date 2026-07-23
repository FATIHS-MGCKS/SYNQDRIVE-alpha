import {
  calculateAgeAtDate,
  evaluateRentalEligibilityChecks,
  resolveEligibilityStatus,
} from './booking-rental-eligibility.util';
import { buildEffectiveRentalRules } from '@modules/rental-rules/rental-effective-rules.util';
import {
  createActiveRentalRulesActivationSnapshot,
  RENTAL_RULES_ACTIVATION_WARNING,
} from '@modules/rental-rules/rental-rules-activation.policy';
import type { BookingRentalEligibilityResult } from './booking-rental-eligibility.types';

describe('booking-rental-eligibility.util activation policy', () => {
  const orgLayer = {
    source: 'ORGANIZATION_DEFAULT' as const,
    sourceName: 'Acme Rental',
    values: {
      minimumAgeYears: 21,
      minimumLicenseHoldingMonths: 12,
      depositAmountCents: 50000,
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

  const formattedRules = {} as BookingRentalEligibilityResult['effectiveRules'];

  function buildRules(
    overrides: {
      rulesActive?: boolean;
      activation?: ReturnType<typeof createActiveRentalRulesActivationSnapshot>;
      categoryLayer?: Parameters<typeof buildEffectiveRentalRules>[0]['categoryLayer'];
      vehicleLayer?: Parameters<typeof buildEffectiveRentalRules>[0]['vehicleLayer'];
    } = {},
  ) {
    return buildEffectiveRentalRules({
      organizationId: 'org1',
      vehicleId: 'veh1',
      orgLayer,
      categoryLayer: overrides.categoryLayer ?? null,
      vehicleLayer: overrides.vehicleLayer ?? null,
      rentalCategoryId: null,
      rentalCategoryName: null,
      rentalCategoryType: null,
      rulesActive: overrides.rulesActive ?? true,
      activation:
        overrides.activation ??
        createActiveRentalRulesActivationSnapshot({
          organizationRulesActive: overrides.rulesActive ?? true,
          enforcementActive: overrides.rulesActive ?? true,
        }),
    });
  }

  const startDate = new Date('2026-07-01T10:00:00.000Z');

  it('returns ELIGIBLE when organization rules are inactive even if customer is too young', () => {
    const rules = buildRules({
      rulesActive: false,
      activation: createActiveRentalRulesActivationSnapshot({
        organizationRulesActive: false,
        enforcementActive: false,
      }),
    });

    const result = evaluateRentalEligibilityChecks({
      rules,
      formattedRules,
      customerAge: 16,
      licenseHoldingMonths: 120,
      hasDateOfBirth: true,
      hasLicenseIssuedAt: true,
      foreignTravelRequested: false,
      additionalDriverCount: 0,
      depositReceived: false,
    });

    expect(result.status).toBe('ELIGIBLE');
    expect(result.blockingReasons).toHaveLength(0);
    expect(result.warningReasons).toContain(
      RENTAL_RULES_ACTIVATION_WARNING.ORGANIZATION_INACTIVE,
    );
  });

  it('applies category rules when category is active', () => {
    const rules = buildRules({
      categoryLayer: {
        source: 'CATEGORY',
        sourceName: 'Premium',
        values: { minimumAgeYears: 25 },
      },
      activation: createActiveRentalRulesActivationSnapshot({
        categoryAssigned: true,
        categoryActive: true,
      }),
    });

    const result = evaluateRentalEligibilityChecks({
      rules,
      formattedRules,
      customerAge: 22,
      licenseHoldingMonths: 120,
      hasDateOfBirth: true,
      hasLicenseIssuedAt: true,
      foreignTravelRequested: false,
      additionalDriverCount: 0,
      depositReceived: false,
    });

    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.blockingReasons.some((r) => r.includes('minimum age 25'))).toBe(true);
  });

  it('falls back to organization rules when category is inactive', () => {
    const rules = buildRules({
      categoryLayer: null,
      activation: createActiveRentalRulesActivationSnapshot({
        categoryAssigned: true,
        categoryActive: false,
        informationalWarnings: [RENTAL_RULES_ACTIVATION_WARNING.CATEGORY_INACTIVE],
      }),
    });

    const result = evaluateRentalEligibilityChecks({
      rules,
      formattedRules,
      customerAge: 22,
      licenseHoldingMonths: 120,
      hasDateOfBirth: true,
      hasLicenseIssuedAt: true,
      foreignTravelRequested: false,
      additionalDriverCount: 0,
      depositReceived: false,
    });

    expect(result.status).toBe('ELIGIBLE');
    expect(result.warningReasons).toContain(
      RENTAL_RULES_ACTIVATION_WARNING.CATEGORY_INACTIVE,
    );
  });

  it('falls back when vehicle override is cleared', () => {
    const rules = buildRules({
      categoryLayer: {
        source: 'CATEGORY',
        sourceName: 'Premium',
        values: { minimumAgeYears: 25 },
      },
      vehicleLayer: null,
      activation: createActiveRentalRulesActivationSnapshot({
        categoryAssigned: true,
        categoryActive: true,
        vehicleOverrideActive: false,
        informationalWarnings: [RENTAL_RULES_ACTIVATION_WARNING.VEHICLE_OVERRIDE_INACTIVE],
      }),
    });

    const result = evaluateRentalEligibilityChecks({
      rules,
      formattedRules,
      customerAge: 22,
      licenseHoldingMonths: 120,
      hasDateOfBirth: true,
      hasLicenseIssuedAt: true,
      foreignTravelRequested: false,
      additionalDriverCount: 0,
      depositReceived: false,
    });

    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.blockingReasons.some((r) => r.includes('minimum age 25'))).toBe(true);
  });

  it('uses permissive org defaults when organization revision is missing', () => {
    const rules = buildEffectiveRentalRules({
      organizationId: 'org1',
      vehicleId: 'veh1',
      orgLayer: { source: 'ORGANIZATION_DEFAULT', sourceName: 'Acme', values: {} },
      categoryLayer: null,
      vehicleLayer: null,
      rentalCategoryId: null,
      rentalCategoryName: null,
      rentalCategoryType: null,
      rulesActive: true,
      activation: createActiveRentalRulesActivationSnapshot({
        organizationDefaultsConfigured: false,
        informationalWarnings: [
          RENTAL_RULES_ACTIVATION_WARNING.ORGANIZATION_NOT_CONFIGURED,
        ],
      }),
    });

    const result = evaluateRentalEligibilityChecks({
      rules,
      formattedRules,
      customerAge: 16,
      licenseHoldingMonths: 0,
      hasDateOfBirth: true,
      hasLicenseIssuedAt: false,
      foreignTravelRequested: false,
      additionalDriverCount: 0,
      depositReceived: false,
    });

    expect(result.status).toBe('ELIGIBLE');
    expect(result.blockingReasons).toHaveLength(0);
    expect(result.warningReasons).toContain(
      RENTAL_RULES_ACTIVATION_WARNING.ORGANIZATION_NOT_CONFIGURED,
    );
  });

  it('vehicle override still wins when active', () => {
    const rules = buildRules({
      categoryLayer: {
        source: 'CATEGORY',
        sourceName: 'Premium',
        values: { minimumAgeYears: 25 },
      },
      vehicleLayer: {
        source: 'VEHICLE_OVERRIDE',
        sourceName: 'BMW',
        values: { minimumAgeYears: 30 },
      },
      activation: createActiveRentalRulesActivationSnapshot({
        categoryAssigned: true,
        categoryActive: true,
        vehicleOverrideActive: true,
      }),
    });

    const result = evaluateRentalEligibilityChecks({
      rules,
      formattedRules,
      customerAge: 28,
      licenseHoldingMonths: 120,
      hasDateOfBirth: true,
      hasLicenseIssuedAt: true,
      foreignTravelRequested: false,
      additionalDriverCount: 0,
      depositReceived: false,
    });

    expect(result.status).toBe('NOT_ELIGIBLE');
    expect(result.blockingReasons.some((r) => r.includes('minimum age 30'))).toBe(true);
  });
});

describe('unverified fact handling', () => {
  const rules = buildEffectiveRentalRules({
    organizationId: 'org1',
    vehicleId: 'veh1',
    orgLayer: {
      source: 'ORGANIZATION_DEFAULT' as const,
      sourceName: 'Acme Rental',
      values: {
        minimumAgeYears: 21,
        minimumLicenseHoldingMonths: 12,
        depositAmountCents: null,
        depositCurrency: 'EUR',
        creditCardRequired: false,
        foreignTravelPolicy: 'ALLOWED' as const,
        additionalDriverPolicy: 'ALLOWED' as const,
        youngDriverPolicy: 'ALLOWED' as const,
        insuranceRequirement: null,
        manualApprovalRequired: false,
        notes: null,
      },
    },
    categoryLayer: null,
    vehicleLayer: null,
    rentalCategoryId: null,
    rentalCategoryName: null,
    rentalCategoryType: null,
    rulesActive: true,
    activation: createActiveRentalRulesActivationSnapshot(),
  });

  const formattedRules = {} as BookingRentalEligibilityResult['effectiveRules'];

  it('routes unverified date of birth suggestions to manual approval', () => {
    const result = evaluateRentalEligibilityChecks({
      rules,
      formattedRules,
      customerAge: null,
      licenseHoldingMonths: 120,
      hasDateOfBirth: false,
      hasLicenseIssuedAt: true,
      unverifiedDateOfBirthPending: true,
      foreignTravelRequested: false,
      additionalDriverCount: 0,
      depositReceived: false,
    });

    expect(result.status).toBe('MANUAL_APPROVAL_REQUIRED');
    expect(result.missingFields).toHaveLength(0);
    expect(result.manualApprovalReasons.some((r) => r.includes('unverified'))).toBe(true);
  });

  it('routes unverified license issue date suggestions to manual approval', () => {
    const result = evaluateRentalEligibilityChecks({
      rules,
      formattedRules,
      customerAge: 30,
      licenseHoldingMonths: null,
      hasDateOfBirth: true,
      hasLicenseIssuedAt: false,
      unverifiedLicenseIssuedAtPending: true,
      foreignTravelRequested: false,
      additionalDriverCount: 0,
      depositReceived: false,
    });

    expect(result.status).toBe('MANUAL_APPROVAL_REQUIRED');
    expect(result.missingFields).toHaveLength(0);
  });
});

describe('resolveEligibilityStatus', () => {
  it('returns ELIGIBLE when no blockers', () => {
    expect(
      resolveEligibilityStatus({
        missingFields: [],
        blockingReasons: [],
        manualApprovalReasons: [],
      }),
    ).toBe('ELIGIBLE');
  });
});

describe('calculateAgeAtDate', () => {
  it('computes age before birthday in the same year', () => {
    const age = calculateAgeAtDate(
      new Date('2000-12-01'),
      new Date('2026-07-01'),
    );
    expect(age).toBe(25);
  });
});
