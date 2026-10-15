import { evaluateDtcPollEligibility } from './dtc-snapshot-eligibility';

describe('evaluateDtcPollEligibility', () => {
  const link = { id: 'l1', isActive: true, dimoVehicleId: 'dv1' };

  it('allows active vehicle with active link', () => {
    expect(
      evaluateDtcPollEligibility({
        registryLifecycle: 'ACTIVE',
        dimoTokenId: 1,
        activeDimoLink: link,
        vehicleDimoVehicleId: 'dv1',
      }).eligible,
    ).toBe(true);
  });

  it('rejects offboarded registry lifecycle', () => {
    const r = evaluateDtcPollEligibility({
      registryLifecycle: 'OFFBOARDED',
      dimoTokenId: 187336,
      activeDimoLink: { ...link, isActive: false },
      vehicleDimoVehicleId: 'dv1',
    });
    expect(r.eligible).toBe(false);
    if (!r.eligible) expect(r.reason).toBe('REGISTRY_LIFECYCLE_OFFBOARDED');
  });

  it('rejects inactive DIMO source link', () => {
    const r = evaluateDtcPollEligibility({
      registryLifecycle: 'ACTIVE',
      dimoTokenId: 1,
      activeDimoLink: { ...link, isActive: false },
      vehicleDimoVehicleId: 'dv1',
    });
    expect(r.eligible).toBe(false);
    if (!r.eligible) expect(r.reason).toBe('NO_ACTIVE_DIMO_SOURCE_LINK');
  });
});
