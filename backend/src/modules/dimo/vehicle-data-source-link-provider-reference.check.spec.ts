import {
  evaluateProviderReferenceCheck,
  productionLegacyHmRowPassesCheck,
} from './vehicle-data-source-link-provider-reference.check';

describe('vehicle-data-source-link provider/reference CHECK matrix (C1–C10)', () => {
  it('C1 — DIMO canonical combination is valid', () => {
    expect(
      evaluateProviderReferenceCheck({
        provider: 'DIMO',
        sourceType: 'DIMO',
        dimoVehicleId: 'dimo-1',
        sourceReferenceId: null,
      }),
    ).toEqual({ valid: true, classification: 'DIMO' });
  });

  it('C2 — DIMO provider with HM sourceType is invalid', () => {
    expect(
      evaluateProviderReferenceCheck({
        provider: 'DIMO',
        sourceType: 'HIGH_MOBILITY',
        dimoVehicleId: 'dimo-1',
        sourceReferenceId: null,
      }).valid,
    ).toBe(false);
  });

  it('C3 — HM canonical combination is valid', () => {
    expect(
      evaluateProviderReferenceCheck({
        provider: 'HIGH_MOBILITY',
        sourceType: 'HIGH_MOBILITY',
        dimoVehicleId: null,
        sourceReferenceId: 'hm-1',
      }),
    ).toEqual({ valid: true, classification: 'HM_CANONICAL' });
  });

  it('C4 — legacy HM (UNKNOWN provider) is valid', () => {
    expect(
      evaluateProviderReferenceCheck({
        provider: 'UNKNOWN',
        sourceType: 'HIGH_MOBILITY',
        dimoVehicleId: null,
        sourceReferenceId: 'hm-1',
      }),
    ).toEqual({ valid: true, classification: 'HM_LEGACY' });
  });

  it('C5 — UNKNOWN provider with DIMO sourceType is invalid', () => {
    expect(
      evaluateProviderReferenceCheck({
        provider: 'UNKNOWN',
        sourceType: 'DIMO',
        dimoVehicleId: 'dimo-1',
        sourceReferenceId: null,
      }).valid,
    ).toBe(false);
  });

  it('C6 — future provider with HM sourceReferenceId is not accepted as HM', () => {
    expect(
      evaluateProviderReferenceCheck({
        provider: 'FUTURE_PROVIDER',
        sourceType: 'HIGH_MOBILITY',
        dimoVehicleId: null,
        sourceReferenceId: 'hm-1',
      }),
    ).toEqual({ valid: false, reason: 'invalid_high_mobility_combination' });
  });

  it('C7 — future provider with dimoVehicleId is not accepted as DIMO', () => {
    expect(
      evaluateProviderReferenceCheck({
        provider: 'FUTURE_PROVIDER',
        sourceType: 'FUTURE',
        dimoVehicleId: 'dimo-1',
        sourceReferenceId: null,
      }),
    ).toEqual({ valid: false, reason: 'unsupported_provider_source_type' });
  });

  it('C8 — both provider-specific references populated is invalid', () => {
    expect(
      evaluateProviderReferenceCheck({
        provider: 'DIMO',
        sourceType: 'DIMO',
        dimoVehicleId: 'dimo-1',
        sourceReferenceId: 'hm-1',
      }),
    ).toEqual({ valid: false, reason: 'both_provider_references_populated' });
  });

  it('C9 — DIMO with neither reference is invalid', () => {
    expect(
      evaluateProviderReferenceCheck({
        provider: 'DIMO',
        sourceType: 'DIMO',
        dimoVehicleId: null,
        sourceReferenceId: null,
      }),
    ).toEqual({ valid: false, reason: 'invalid_dimo_combination' });
  });

  it('C10 — HM with neither reference is invalid', () => {
    expect(
      evaluateProviderReferenceCheck({
        provider: 'HIGH_MOBILITY',
        sourceType: 'HIGH_MOBILITY',
        dimoVehicleId: null,
        sourceReferenceId: null,
      }),
    ).toEqual({ valid: false, reason: 'invalid_high_mobility_combination' });
  });

  it('Production legacy HM row predicate passes hardened CHECK', () => {
    expect(
      productionLegacyHmRowPassesCheck({
        provider: 'UNKNOWN',
        sourceType: 'HIGH_MOBILITY',
        sourceReferenceId: 'hm-production-legacy-id',
        dimoVehicleId: null,
      }),
    ).toBe(true);
  });
});
