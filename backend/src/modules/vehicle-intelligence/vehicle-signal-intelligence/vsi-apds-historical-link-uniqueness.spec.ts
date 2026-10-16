import { resolveHistoricalActiveSourceLinkUniqueness } from './vsi-apds-historical-link-uniqueness';
import {
  validateVsiApdsShadowOpportunityBinding,
  VsiApdsCorrelationAnalysisMode,
  VsiApdsShadowBindingStatus,
} from './vsi-apds-shadow-opportunity-binding';

const decisionAt = new Date('2026-10-16T06:00:00.000Z');
const decisionMs = decisionAt.getTime();
const before = new Date('2026-10-16T04:00:00.000Z');
const after = new Date('2026-10-16T08:00:00.000Z');

describe('vsi-apds historical link uniqueness', () => {
  it('two links active at decision, one active today → historical count 2', () => {
    const r = resolveHistoricalActiveSourceLinkUniqueness({
      decisionAtMs: decisionMs,
      links: [
        {
          id: 'link-a',
          activatedAt: before,
          deactivatedAt: null,
          supersededByLinkId: null,
        },
        {
          id: 'link-b',
          activatedAt: before,
          deactivatedAt: after,
          supersededByLinkId: null,
        },
      ],
    });
    expect(r.evidenceComplete).toBe(true);
    expect(r.historicalActiveLinkCount).toBe(2);
  });

  it('one provably active historical link', () => {
    const r = resolveHistoricalActiveSourceLinkUniqueness({
      decisionAtMs: decisionMs,
      links: [
        {
          id: 'link-a',
          activatedAt: before,
          deactivatedAt: null,
          supersededByLinkId: null,
        },
        {
          id: 'link-b',
          activatedAt: before,
          deactivatedAt: new Date('2026-10-16T05:00:00.000Z'),
          supersededByLinkId: null,
        },
      ],
    });
    expect(r.historicalActiveLinkCount).toBe(1);
    expect(r.historicalActiveLinkIds).toEqual(['link-a']);
  });

  it('superseded without deactivatedAt → evidence incomplete', () => {
    const r = resolveHistoricalActiveSourceLinkUniqueness({
      decisionAtMs: decisionMs,
      links: [
        {
          id: 'link-a',
          activatedAt: before,
          deactivatedAt: null,
          supersededByLinkId: 'other',
        },
      ],
    });
    expect(r.evidenceComplete).toBe(false);
    expect(r.historicalActiveLinkCount).toBeNull();
  });

  it('binding UNKNOWN when historical multi-active even if current count is 1', () => {
    const persisted = {
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      opportunityId: 'opp-1',
      decisionAt,
      policyVersion: 'p25-apd-b4-v1',
      activationEpochId: null,
      decision: 'HOLD',
    };
    const r = validateVsiApdsShadowOpportunityBinding({
      persistedDecision: persisted,
      request: {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        providerSourceLinkId: 'link-a',
        opportunityId: 'opp-1',
        decisionAt,
        policyVersion: 'p25-apd-b4-v1',
        activationEpochId: null,
        baselineDecision: 'HOLD',
      },
      currentActiveSourceLinkCount: 1,
      historicalActiveLinkCountAtDecision: 2,
      historicalActiveLinkIds: ['link-a', 'link-b'],
      historicalLinkUniquenessEvidenceComplete: true,
      correlationMode: VsiApdsCorrelationAnalysisMode.VERIFIED_SHADOW_CORRELATION,
      historicalLinkActiveAtDecision: true,
    });
    expect(r.bindingStatus).toBe(VsiApdsShadowBindingStatus.UNKNOWN);
    expect(r.reasons).toContain('HISTORICAL_MULTI_ACTIVE_SOURCE_LINKS_AT_DECISION');
  });
});
