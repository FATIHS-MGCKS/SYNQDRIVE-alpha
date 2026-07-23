import {
  buildRentalRulesActivationSnapshot,
  createActiveRentalRulesActivationSnapshot,
  isRentalRulesEnforcementActive,
  RENTAL_RULES_ACTIVATION_WARNING,
} from './rental-rules-activation.policy';

describe('rental-rules-activation.policy', () => {
  it('treats missing organization defaults as permissive with warning', () => {
    const activation = buildRentalRulesActivationSnapshot({
      orgRules: null,
      category: null,
      overrideFields: null,
    });

    expect(activation.organizationDefaultsConfigured).toBe(false);
    expect(activation.enforcementActive).toBe(true);
    expect(activation.informationalWarnings).toContain(
      RENTAL_RULES_ACTIVATION_WARNING.ORGANIZATION_NOT_CONFIGURED,
    );
  });

  it('disables enforcement when organization rules are inactive', () => {
    const activation = buildRentalRulesActivationSnapshot({
      orgRules: { isActive: false },
      category: null,
      overrideFields: null,
    });

    expect(activation.organizationRulesActive).toBe(false);
    expect(activation.enforcementActive).toBe(false);
    expect(isRentalRulesEnforcementActive(activation, false)).toBe(false);
  });

  it('skips inactive category as rule source but keeps enforcement when org active', () => {
    const activation = buildRentalRulesActivationSnapshot({
      orgRules: { isActive: true },
      category: { id: 'cat-1', name: 'Premium', isActive: false },
      overrideFields: null,
    });

    expect(activation.categoryAssigned).toBe(true);
    expect(activation.categoryActive).toBe(false);
    expect(activation.enforcementActive).toBe(true);
    expect(activation.informationalWarnings).toContain(
      RENTAL_RULES_ACTIVATION_WARNING.CATEGORY_INACTIVE,
    );
  });

  it('treats empty vehicle override as inactive override layer', () => {
    const activation = buildRentalRulesActivationSnapshot({
      orgRules: { isActive: true },
      category: null,
      overrideFields: { minimumAgeYears: null, depositAmountCents: null },
    });

    expect(activation.vehicleOverrideActive).toBe(false);
    expect(activation.informationalWarnings).toContain(
      RENTAL_RULES_ACTIVATION_WARNING.VEHICLE_OVERRIDE_INACTIVE,
    );
  });

  it('detects active vehicle override fields', () => {
    const activation = buildRentalRulesActivationSnapshot({
      orgRules: { isActive: true },
      category: null,
      overrideFields: { minimumAgeYears: 30 },
    });

    expect(activation.vehicleOverrideActive).toBe(true);
    expect(
      activation.informationalWarnings.includes(
        RENTAL_RULES_ACTIVATION_WARNING.VEHICLE_OVERRIDE_INACTIVE,
      ),
    ).toBe(false);
  });

  it('creates active snapshot helper defaults', () => {
    const activation = createActiveRentalRulesActivationSnapshot();
    expect(activation.enforcementActive).toBe(true);
    expect(isRentalRulesEnforcementActive(activation, true)).toBe(true);
  });
});
