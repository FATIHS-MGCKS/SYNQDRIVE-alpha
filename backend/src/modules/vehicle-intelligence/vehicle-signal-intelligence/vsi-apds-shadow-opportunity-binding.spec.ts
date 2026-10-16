import {
  validateVsiApdsShadowOpportunityBinding,
  VsiApdsShadowBindingStatus,
} from './vsi-apds-shadow-opportunity-binding';

const decisionAt = new Date('2026-10-16T06:00:00.000Z');

describe('vsi-apds shadow opportunity binding', () => {
  const persisted = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    opportunityId: 'opp-1',
    decisionAt,
    policyVersion: 'p25-apd-b4-v1',
    activationEpochId: 'epoch-1',
    decision: 'HOLD',
  };

  const request = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    providerSourceLinkId: 'link-1',
    opportunityId: 'opp-1',
    decisionAt,
    policyVersion: 'p25-apd-b4-v1',
    activationEpochId: 'epoch-1',
  };

  it('MATCHED when persisted row aligns and single active link', () => {
    const r = validateVsiApdsShadowOpportunityBinding({
      persistedDecision: persisted,
      request,
      activeSourceLinkCount: 1,
    });
    expect(r.bindingStatus).toBe(VsiApdsShadowBindingStatus.MATCHED);
  });

  it('REJECTED on opportunity mismatch', () => {
    const r = validateVsiApdsShadowOpportunityBinding({
      persistedDecision: persisted,
      request: { ...request, opportunityId: 'opp-other' },
      activeSourceLinkCount: 1,
    });
    expect(r.bindingStatus).toBe(VsiApdsShadowBindingStatus.REJECTED);
    expect(r.reasons).toContain('OPPORTUNITY_ID_MISMATCH');
  });

  it('REJECTED on org/vehicle mismatch', () => {
    const r = validateVsiApdsShadowOpportunityBinding({
      persistedDecision: persisted,
      request: { ...request, organizationId: 'org-2' },
      activeSourceLinkCount: 1,
    });
    expect(r.reasons).toContain('ORGANIZATION_ID_MISMATCH');
  });

  it('UNKNOWN for multi active links (vehicle-level APDS)', () => {
    const r = validateVsiApdsShadowOpportunityBinding({
      persistedDecision: persisted,
      request,
      activeSourceLinkCount: 2,
    });
    expect(r.bindingStatus).toBe(VsiApdsShadowBindingStatus.UNKNOWN);
  });

  it('REJECTED on invalid decision timestamp', () => {
    const r = validateVsiApdsShadowOpportunityBinding({
      persistedDecision: persisted,
      request: { ...request, decisionAt: new Date('invalid') },
      activeSourceLinkCount: 1,
    });
    expect(r.bindingStatus).toBe(VsiApdsShadowBindingStatus.REJECTED);
  });
});
