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
    currentActiveSourceLinkCount: 1,
    historicalActiveLinkCountAtDecision: 1,
    historicalActiveLinkIds: ['link-1'],
    historicalLinkUniquenessEvidenceComplete: true,
    correlationMode: VsiApdsCorrelationAnalysisMode.VERIFIED_SHADOW_CORRELATION,
    historicalLinkActiveAtDecision: true,
  };

  it('MATCHED when persisted row aligns and historical uniqueness proven', () => {
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

  it('UNKNOWN when historical link not proven at decision time', () => {
    const r = validateVsiApdsShadowOpportunityBinding({
      ...verifiedBase,
      historicalLinkActiveAtDecision: false,
    });
    expect(r.bindingStatus).toBe(VsiApdsShadowBindingStatus.UNKNOWN);
    expect(r.reasons).toContain('HISTORICAL_SOURCE_LINK_ATTRIBUTION_UNPROVEN');
  });

  it('UNKNOWN when historical uniqueness evidence incomplete', () => {
    const r = validateVsiApdsShadowOpportunityBinding({
      ...verifiedBase,
      historicalLinkUniquenessEvidenceComplete: false,
      historicalActiveLinkCountAtDecision: null,
    });
    expect(r.reasons).toContain('HISTORICAL_SOURCE_LINK_UNIQUENESS_UNPROVEN');
  });

  it('UNKNOWN for historical multi-active at decision (ignores current count 1)', () => {
    const r = validateVsiApdsShadowOpportunityBinding({
      ...verifiedBase,
      currentActiveSourceLinkCount: 1,
      historicalActiveLinkCountAtDecision: 2,
      historicalActiveLinkIds: ['link-1', 'link-2'],
    });
    expect(r.bindingStatus).toBe(VsiApdsShadowBindingStatus.UNKNOWN);
    expect(r.reasons).toContain('HISTORICAL_MULTI_ACTIVE_SOURCE_LINKS_AT_DECISION');
  });

  it('UNKNOWN when sole historical link id does not match selected providerSourceLinkId', () => {
    const r = validateVsiApdsShadowOpportunityBinding({
      ...verifiedBase,
      historicalActiveLinkCountAtDecision: 1,
      historicalActiveLinkIds: ['link-other'],
    });
    expect(r.bindingStatus).toBe(VsiApdsShadowBindingStatus.UNKNOWN);
    expect(r.reasons).toContain('SELECTED_SOURCE_LINK_NOT_UNIQUELY_ATTRIBUTABLE_AT_DECISION');
  });
});
