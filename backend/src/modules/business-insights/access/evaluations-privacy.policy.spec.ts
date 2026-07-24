import { MembershipRole } from '@prisma/client';
import {
  buildEvaluationsAccessContext,
  redactDashboardInsightsForRole,
  resolveEvaluationsPiiTierForMembership,
} from './evaluations-privacy.policy';

describe('evaluations-privacy.policy', () => {
  it('redacts dashboard insights for worker with finance read only', () => {
    const tier = resolveEvaluationsPiiTierForMembership(
      buildEvaluationsAccessContext({
        membershipRole: MembershipRole.WORKER,
        canReadFinance: true,
        canReadCustomerPii: false,
      }),
    );

    const response = redactDashboardInsightsForRole(
      {
        generatedAt: null,
        hasRun: true,
        lastRunAt: null,
        stale: false,
        activeInsightCount: 1,
        error: null,
        summary: { total: 1, critical: 0, warning: 1, opportunity: 0, info: 0 },
        insights: [
          {
            id: 'i1',
            type: 'PICKUP_OVERDUE',
            severity: 'WARNING',
            priority: 72,
            title: 'Pickup überfällig',
            message: 'B-AB 1234 · Max Mustermann — geplanter Pickup 24.07., 10:00 (2 h überfällig).',
            entityScope: 'VEHICLE',
            entityIds: ['veh-1'],
            metrics: { customerName: 'Max Mustermann', customerId: 'cust-1' },
            reasons: ['Kunde: Max Mustermann'],
            isGrouped: false,
            groupCount: 1,
            createdAt: new Date().toISOString(),
          },
        ],
      },
      tier,
    );

    expect(tier).toBe('pseudonymous');
    expect(response.insights[0]?.message).not.toContain('Max Mustermann');
    expect(response.insights[0]?.metrics?.customerId).toBeUndefined();
  });
});
