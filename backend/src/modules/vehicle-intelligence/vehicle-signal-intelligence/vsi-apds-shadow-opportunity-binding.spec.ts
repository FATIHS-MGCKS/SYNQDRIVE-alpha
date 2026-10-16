import {
  validateVsiApdsShadowOpportunityBinding,
  VsiApdsCorrelationAnalysisMode,
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
    baselineDecision: 'HOLD',
  };

  const verifiedBase = {
    persistedDecision: persisted,
    request,
    activeSourceLinkCount: 1,
    correlationMode: VsiApdsCorrelationAnalysisMode.VERIFIED_SHADOW_CORRELATION,
    historicalLinkActiveAtDecision: true,
  };

  it('MATCHED when persisted row aligns and historical link proven', () => {
    const r = validateVsiApdsShadowOpportunityBinding(verifiedBase);
    expect(r.bindingStatus).toBe(VsiApdsShadowBindingStatus.MATCHED);
  });

  it('MISSING_PERSISTED_DECISION when row absent in verified mode', () => {
    const r = validateVsiApdsShadowOpportunityBinding({
      ...verifiedBase,
      persistedDecision: null,
    });
    expect(r.bindingStatus).toBe(VsiApdsShadowBindingStatus.MISSING_PERSISTED_DECISION);
  });

  it('UNVERIFIED_ANALYSIS when mode is offline hypothetical', () => {
    const r = validateVsiApdsShadowOpportunityBinding({
      ...verifiedBase,
      persistedDecision: null,
      correlationMode: VsiApdsCorrelationAnalysisMode.UNVERIFIED_ANALYSIS,
    });
    expect(r.bindingStatus).toBe(VsiApdsShadowBindingStatus.UNVERIFIED_ANALYSIS);
  });

  it('REJECTED on opportunity mismatch', () => {
    const r = validateVsiApdsShadowOpportunityBinding({
      ...verifiedBase,
      request: { ...request, opportunityId: 'opp-other' },
    });
    expect(r.bindingStatus).toBe(VsiApdsShadowBindingStatus.REJECTED);
    expect(r.reasons).toContain('OPPORTUNITY_ID_MISMATCH');
  });

  it('REJECTED when epoch required but omitted', () => {
    const r = validateVsiApdsShadowOpportunityBinding({
      ...verifiedBase,
      request: { ...request, activationEpochId: null },
    });
    expect(r.bindingStatus).toBe(VsiApdsShadowBindingStatus.REJECTED);
    expect(r.reasons).toContain('ACTIVATION_EPOCH_ID_REQUIRED_FOR_EPOCH_BOUND_DECISION');
  });

  it('REJECTED on wrong epoch', () => {
    const r = validateVsiApdsShadowOpportunityBinding({
      ...verifiedBase,
      request: { ...request, activationEpochId: 'epoch-wrong' },
    });
    expect(r.reasons).toContain('ACTIVATION_EPOCH_ID_MISMATCH');
  });

  it('UNKNOWN when historical link not proven at decision time', () => {
    const r = validateVsiApdsShadowOpportunityBinding({
      ...verifiedBase,
      historicalLinkActiveAtDecision: false,
    });
    expect(r.bindingStatus).toBe(VsiApdsShadowBindingStatus.UNKNOWN);
    expect(r.reasons).toContain('HISTORICAL_SOURCE_LINK_ATTRIBUTION_UNPROVEN');
  });

  it('UNKNOWN for multi active links (vehicle-level APDS)', () => {
    const r = validateVsiApdsShadowOpportunityBinding({
      ...verifiedBase,
      activeSourceLinkCount: 2,
    });
    expect(r.bindingStatus).toBe(VsiApdsShadowBindingStatus.UNKNOWN);
  });
});
