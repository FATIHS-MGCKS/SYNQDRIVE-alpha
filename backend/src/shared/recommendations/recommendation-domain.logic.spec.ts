import {
  assertNoProtectedAutomatedDiscrimination,
  assertRecommendationStatusTransition,
  buildRecommendationDedupKey,
  deriveExpectedNetBenefit,
  normalizeRecommendationRationale,
} from './recommendation-domain.logic';

describe('recommendation-domain.logic', () => {
  describe('normalizeRecommendationRationale', () => {
    it('rejects empty or too-short rationale', () => {
      expect(() => normalizeRecommendationRationale('')).toThrow(/rationale/i);
      expect(() => normalizeRecommendationRationale('short')).toThrow(/rationale/i);
    });

    it('accepts substantive rationale', () => {
      expect(normalizeRecommendationRationale('Based on brake wear telemetry trend.')).toContain(
        'brake wear',
      );
    });
  });

  describe('assertRecommendationStatusTransition', () => {
    it('allows NEW → REVIEWED', () => {
      expect(() => assertRecommendationStatusTransition('NEW', 'REVIEWED')).not.toThrow();
    });

    it('blocks NEW → COMPLETED', () => {
      expect(() => assertRecommendationStatusTransition('NEW', 'COMPLETED')).toThrow(
        /transition/i,
      );
    });

    it('allows IMPLEMENTED → MEASURING_IMPACT', () => {
      expect(() =>
        assertRecommendationStatusTransition('IMPLEMENTED', 'MEASURING_IMPACT'),
      ).not.toThrow();
    });
  });

  describe('deriveExpectedNetBenefit', () => {
    it('derives net benefit when currencies match', () => {
      expect(
        deriveExpectedNetBenefit(
          { amountMinor: 50000, currency: 'EUR' },
          { amountMinor: 12000, currency: 'EUR' },
          null,
        ),
      ).toEqual({ amountMinor: 38000, currency: 'EUR' });
    });

    it('returns null when currencies differ', () => {
      expect(
        deriveExpectedNetBenefit(
          { amountMinor: 50000, currency: 'EUR' },
          { amountMinor: 12000, currency: 'USD' },
          null,
        ),
      ).toBeNull();
    });
  });

  describe('buildRecommendationDedupKey', () => {
    it('is stable for same inputs regardless of entity order', () => {
      const base = {
        organizationId: 'org-1',
        sourceType: 'DASHBOARD_INSIGHT' as const,
        sourceId: 'insight-1',
        category: 'MAINTENANCE',
        title: 'Schedule brake service',
      };
      const a = buildRecommendationDedupKey({
        ...base,
        affectedEntities: [
          { entityType: 'vehicle', entityId: 'v2' },
          { entityType: 'vehicle', entityId: 'v1' },
        ],
      });
      const b = buildRecommendationDedupKey({
        ...base,
        affectedEntities: [
          { entityType: 'vehicle', entityId: 'v1' },
          { entityType: 'vehicle', entityId: 'v2' },
        ],
      });
      expect(a).toBe(b);
    });
  });

  describe('assertNoProtectedAutomatedDiscrimination', () => {
    it('blocks automated recommendations targeting drivers', () => {
      expect(() =>
        assertNoProtectedAutomatedDiscrimination('EVALUATIONS_RISK', [
          { entityType: 'driver', entityId: 'd1' },
        ]),
      ).toThrow(/driver or customer/i);
    });

    it('allows manual recommendations with driver targets', () => {
      expect(() =>
        assertNoProtectedAutomatedDiscrimination('MANUAL', [
          { entityType: 'driver', entityId: 'd1' },
        ]),
      ).not.toThrow();
    });
  });
});
